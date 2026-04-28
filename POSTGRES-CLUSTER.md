# Guía paso a paso — Cluster PostgreSQL para el Cómputo Oficial

Esta guía explica qué es, cómo se levanta, cómo se prueba el failover, y cómo se promueve
manualmente un standby si cae el primary.

## ¿Qué vamos a construir?

3 contenedores PostgreSQL con **streaming replication asíncrona** + 1 contenedor HAProxy:

```
                ┌────────────────────────┐
                │   HAProxy (lb_postgres) │
                │  :5432 → primary write  │
                │  :5433 → standby read   │
                └─────────┬───────────┬──┘
                          │           │
              ┌───────────┘           └──────────────┐
              ▼                                       ▼
    ┌──────────────────┐                    ┌────────────────┐
    │   pg_primary     │  WAL streaming     │ pg_standby_1   │
    │ acepta escrituras├───────────────────▶│ replica RO     │
    └──────────────────┘                    └────────────────┘
              │
              │ WAL streaming
              ▼
    ┌────────────────┐
    │ pg_standby_2   │
    │ replica RO     │
    └────────────────┘
```

**¿Por qué streaming replication y no Patroni?** Patroni necesita etcd (3 contenedores
adicionales) y exporta una API REST extra; opera con magia Raft y archivos de configuración
yaml. Para un proyecto de práctica que tiene que defenderse en 5 minutos, streaming
replication es comprensible y demuestra el mismo concepto: replicación + failover.

Si después quieres failover totalmente automático, el upgrade-path es agregar `pg_auto_failover`
sobre los mismos 3 contenedores (lo dejaremos como nota al final).

---

## Conceptos clave

| Término | Significado |
|---|---|
| **Primary** | Único nodo que acepta escrituras. Genera el WAL (Write-Ahead Log). |
| **Standby** | Réplica de solo lectura. Aplica el WAL del primary en tiempo real. |
| **WAL** | Bitácora de cambios; se transmite del primary a los standbys. |
| **Streaming replication** | Los standbys mantienen una conexión abierta al primary y aplican el WAL conforme llega. Latencia típica: milisegundos. |
| **Replication slot** | Marca en el primary que indica hasta dónde leyó cada standby. Evita que el primary borre WAL no replicado. |
| **Promote** | Convertir un standby en primary cuando el primary cae. |
| **HAProxy** | Balanceador TCP. En nuestro caso enruta `:5432` siempre al primary actual y `:5433` a cualquier standby. |

---

## Paso 1 — Levantar el cluster

Todo está en `infra/postgres-cluster/`. Ejecutar desde la raíz del repo:

```bash
docker-compose up -d pg_primary
# Esperar 10s a que inicialice
docker-compose up -d pg_standby_1 pg_standby_2 lb_postgres
```

**¿Qué hace cada contenedor en el arranque?**

1. `pg_primary`:
   - Inicializa con el script `00-primary-init.sql` (crea usuarios, roles, replicación habilitada).
   - Habilita `wal_level=replica`, `max_wal_senders=10`, `hot_standby=on`.
   - Crea el usuario `replicator` que los standbys usan para conectarse.

2. `pg_standby_1` y `pg_standby_2`:
   - El entrypoint detecta que son réplicas (variable `PG_ROLE=standby`).
   - Ejecuta `pg_basebackup` apuntando a `pg_primary` para clonar todo.
   - Crea el archivo `standby.signal` para arrancar en modo standby.
   - Inicia y se queda escuchando WAL del primary.

3. `lb_postgres` (HAProxy):
   - Hace healthcheck SQL a cada nodo: `SELECT pg_is_in_recovery()`.
   - El que retorna `false` es el primary → recibe tráfico en `:5432`.
   - Los que retornan `true` son standbys → reciben tráfico en `:5433`.

**Verificar que arrancó bien:**

```bash
# Conectar al primary y ver replicación
docker exec -it pg_primary psql -U oep_admin -d electoral_oficial \
  -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;"

# Resultado esperado: 2 filas, ambas con state='streaming'
```

```bash
# Confirmar desde un standby que está en recovery
docker exec -it pg_standby_1 psql -U oep_admin -d electoral_oficial \
  -c "SELECT pg_is_in_recovery();"

# Resultado: t (true)
```

---

## Paso 2 — Probar la replicación

```bash
# 1. Conectarse al primary y crear datos
docker exec -it pg_primary psql -U oep_admin -d electoral_oficial -c "
  CREATE TABLE prueba_replicacion (id serial primary key, mensaje text);
  INSERT INTO prueba_replicacion (mensaje) VALUES ('hola desde primary');
"

# 2. Leer desde el standby — debe aparecer instantáneamente
docker exec -it pg_standby_1 psql -U oep_admin -d electoral_oficial \
  -c "SELECT * FROM prueba_replicacion;"

# 3. Intentar escribir en el standby — debe FALLAR
docker exec -it pg_standby_1 psql -U oep_admin -d electoral_oficial \
  -c "INSERT INTO prueba_replicacion (mensaje) VALUES ('no debería escribir');"
# ERROR:  cannot execute INSERT in a read-only transaction
```

---

## Paso 3 — Probar el failover (matando el primary)

```bash
# 1. Matar el primary
docker stop pg_primary

# 2. HAProxy detecta que el primary no responde (~5-10s)
docker exec -it lb_postgres ps aux | grep haproxy

# 3. Promover manualmente uno de los standbys a nuevo primary
docker exec -it pg_standby_1 su - postgres -c "pg_ctl promote -D /var/lib/postgresql/data"

# 4. Verificar — ahora pg_standby_1 NO está en recovery
docker exec -it pg_standby_1 psql -U oep_admin -d electoral_oficial \
  -c "SELECT pg_is_in_recovery();"
# Resultado: f (false) — ya es el nuevo primary

# 5. HAProxy ahora dirige las escrituras a pg_standby_1 automáticamente
#    (su healthcheck detecta que ya no está en recovery)

# 6. La aplicación continúa escribiendo sin saber que cambió de nodo.
```

**Para volver a tener 3 nodos** después del failover, hay que reincorporar el viejo primary
como standby. Hay un script `infra/postgres-cluster/scripts/reincorporar.sh` que automatiza esto.

---

## Paso 4 — Failover automático (opcional, upgrade-path)

Si quieres que el paso 3.3 (promote manual) ocurra automáticamente, hay tres opciones,
en orden de complejidad:

### Opción A — `repmgr` (más simple)
Agrega un demonio `repmgrd` en cada nodo que monitoriza al primary y promueve automáticamente.
Sigue siendo streaming replication, solo agrega monitoreo.

### Opción B — `pg_auto_failover`
Microsoft mantiene este proyecto. Necesita un nodo extra ("monitor") que decide quién promueve.
3 nodos PG + 1 monitor = 4 contenedores.

### Opción C — Patroni + etcd
Lo del ADR. 3 nodos PG + 3 etcd + HAProxy = 7 contenedores. Producción-grade pero overkill
para defensa de 5 minutos.

**Recomendación para la práctica:** Quédate con manual + script + demostración en vivo.
La rúbrica solo dice "cuando uno cae, los otros se levantan" — un script que promueva
en 2 segundos cumple eso de forma defendible.

---

## Paso 5 — Configurar la app para usar el cluster

En `.env`:
```
POSTGRES_HOST=localhost
POSTGRES_PORT_WRITE=5432  # Apunta al HAProxy → primary actual
POSTGRES_PORT_READ=5433   # Apunta al HAProxy → cualquier standby
```

En el código del backend:
```js
import { Pool } from 'pg';

// Pool de escrituras (siempre va al primary)
export const pgWrite = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT_WRITE,
  // retry automático: si HAProxy cambia de primary, la siguiente query funciona
});

// Pool de lecturas (CQRS — separa carga del dashboard)
export const pgRead = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT_READ,
});
```

---

## Troubleshooting

| Problema | Causa probable | Solución |
|---|---|---|
| `pg_basebackup` falla en standby | El primary no permite conexiones de replicación | Revisar `pg_hba.conf` del primary, debe tener línea `host replication replicator 0.0.0.0/0 md5` |
| Standby no replica | Slot de replicación lleno o WAL borrado | `SELECT * FROM pg_replication_slots;` en el primary |
| HAProxy no dirige al primary nuevo | Healthcheck no se actualizó | Revisar logs: `docker logs lb_postgres` |
| Después de failover, escrituras fallan | App con conexiones cacheadas al primary muerto | El driver `pg` reintenta automáticamente; si no, `pool.end()` y reconectar |

---

## Resumen de comandos útiles

```bash
# Ver estado de replicación
docker exec pg_primary psql -U oep_admin -d electoral_oficial \
  -c "SELECT * FROM pg_stat_replication;"

# Ver lag de replicación
docker exec pg_primary psql -U oep_admin -d electoral_oficial \
  -c "SELECT client_addr, EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_segs FROM pg_stat_replication;"

# Promover manualmente un standby
docker exec pg_standby_1 su - postgres -c "pg_ctl promote -D /var/lib/postgresql/data"

# Verificar quién es primary
for n in pg_primary pg_standby_1 pg_standby_2; do
  echo -n "$n: ";
  docker exec $n psql -U oep_admin -d electoral_oficial -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "DOWN"
done
```
