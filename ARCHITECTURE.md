# Arquitectura Implementada

Versión simplificada y verificable del [ADR-001](ADR-001-Arquitectura-Sistema-Electoral.md),
manteniendo todos los requisitos funcionales de la práctica.

## Diagrama general

```
                ┌─────────────────────────────────────────────────────┐
                │                   USUARIOS / DATOS                  │
                │  PWA Móvil   SMS Gateway   CSV (n8n)   Operadores   │
                └──────┬───────────┬──────────────┬──────────┬────────┘
                       │           │              │          │
                       ▼           ▼              ▼          ▼
                ┌──────────────────────────────────────────────────┐
                │              BACKEND (Node.js + Express)         │
                │   /api/rrv/*   /api/oficial/*   /api/dashboard/* │
                └────┬───────────────┬───────────────────┬─────────┘
                     │               │                   │
       ┌─────────────┘               │                   └────────────┐
       ▼                             ▼                                ▼
  ┌─────────┐               ┌──────────────┐                ┌────────────────┐
  │ RabbitMQ│               │ OCR Service  │                │ Postgres Cluster│
  │ 4 colas │               │ Tesseract+CV │                │ (3 nodos)       │
  └────┬────┘               └──────┬───────┘                │ HAProxy:5432/3  │
       │                           │                        │ Cómputo Oficial │
       ▼                           ▼                        │ ACID + Eventos  │
  ┌──────────────────────────────────────┐                  └────────────────┘
  │       MongoDB Atlas (Replica Set)    │
  │       Pipeline RRV — actas + logs    │
  └──────────────────────────────────────┘

                                     │
                                     ▼
                              ┌────────────────┐
                              │ Frontend       │
                              │ Next.js + PWA  │
                              │ Dashboard +    │
                              │ Captura móvil  │
                              └────────────────┘
```

## Decisiones implementadas

### 1. Bases de datos

**MongoDB Atlas — Pipeline RRV**
- El cluster Atlas YA es replica set 3-node con failover automático managed por MongoDB.
- Esto cumple el requisito "cuando uno cae, los otros se levantan automáticamente".
- Ventaja vs self-hosted: no mantenemos infraestructura, no necesitamos `mongo-init` con `rs.initiate()`.
- Conexión vía driver oficial con `retryWrites: true` y `w: "majority"`.

**PostgreSQL Cluster — Pipeline Oficial**
- 3 nodos en docker-compose con **streaming replication asíncrona**.
  - `pg_primary` (puerto 5432): acepta escrituras
  - `pg_standby_1` (puerto 5442): replica de lectura
  - `pg_standby_2` (puerto 5443): replica de lectura
- **Failover semi-automático** documentado paso a paso en [POSTGRES-CLUSTER.md](POSTGRES-CLUSTER.md).
- Para failover totalmente automático, opcional: agregar `pg_auto_failover` o Patroni
  (descrito como upgrade-path, no requerido por la práctica).
- HAProxy delante separa lecturas (5433) y escrituras (5432).

**¿Por qué no Patroni del ADR?** Patroni + etcd + HAProxy son ~6 contenedores adicionales
y operacionalmente complejos. Streaming replication demuestra el mismo concepto
(replica set, failover, alta disponibilidad) y es comprensible para defenderlo en clase.

### 2. Mensajería — RabbitMQ

4 colas durables con dead-letter:
```
q_ingesta   → recibe SMS y rutas de PDF subidos por la PWA
q_validacion → mensajes ya con OCR ejecutado, listos para validar
q_escritura  → batch de actas validadas listas para insertar en Mongo
q_dlq        → mensajes que fallaron 3 veces
```

Workers desacoplados consumen en cada etapa. Cada worker es escalable horizontalmente
(`docker-compose up --scale worker_ocr=3`).

### 3. Backend — Node.js + Express

Estructura modular para separación clara entre RRV, Oficial y compartido:

```
backend/src/
├── config/                     # Conexiones (mongo, postgres, rabbitmq)
├── domain/                     # Modelos puros (acta, mesa, recinto)
├── routes/
│   ├── rrv.routes.js
│   ├── oficial.routes.js
│   └── dashboard.routes.js
├── services/
│   ├── rrv/                    # Lógica del pipeline rápido
│   ├── oficial/                # Lógica del cómputo oficial
│   └── shared/                 # Validadores R1-R7 reutilizados
├── workers/                    # Consumers de RabbitMQ
└── repositories/               # Mongo + Postgres data access
```

### 4. OCR Service — Python + Tesseract (Dockerizado)

Servicio HTTP independiente. Debido a conflictos comunes de compiladores C++ y librerías (OpenCV, Tesseract) en sistemas host Windows, el servicio corre **aislado en un contenedor Docker** Linux. El backend Node.js le manda el PDF y recibe los datos extraídos + confianza por campo.

### 5. Frontend — Next.js

App Router dedicado a web:
- `/dashboard` — Visualizaciones (Recharts)
- `/oficial` — Carga y cómputo oficial web
- `/sms-admin` — Gestión de webhook y números permitidos.

### 6. Aplicación Móvil Nativa — Expo (React Native)

Aplicación nativa (iOS/Android) separada del frontend web, construida con **Expo SDK 54** y `expo-router` v6.
- Consume la misma API REST del RRV.
- Utiliza la cámara nativa del dispositivo y geolocalización.
- Cuenta con modo offline resiliente (guarda actas en cola local si no hay internet y reintenta después).

### 7. N8N

Un workflow que lee CSV, valida fila por fila contra `/api/oficial/acta`, y reporta
resultados al final. Cumple el 15% de automatización exigido.

### 8. Patrones aplicados

- **CQRS**: Lecturas del dashboard van a `pg_standby_*` (5433); escrituras al primary (5432).
  En MongoDB, lecturas con `readPreference: "secondaryPreferred"`.
- **Event Sourcing**: Tabla `eventos_acta_oficial` append-only registra todo cambio de estado.
- **Idempotencia**: Hash SHA-256 del contenido de cada acta. Reenvíos retornan el `ingreso_id` original.
- **Tolerancia a fallos**: RabbitMQ persiste mensajes; workers reintentan; failover de DB
  documentado y verificable matando el contenedor primary.

## Mapeo a la rúbrica de la práctica

| Criterio | % | Implementación |
|---|---|---|
| RRV (OCR + almacenamiento) + Oficial (CSV + validación) | 50 | Backend completo con ambos pipelines |
| Dashboard | 20 | Frontend Next.js con 8 visualizaciones |
| Defensa individual | 30 | (Tu trabajo) — la modularidad ayuda a explicar partes específicas |
| n8n | 15 | Workflow de CSV → API oficial |
| App móvil | 15 | App nativa con Expo SDK 54, cámara GPS y modo offline |
