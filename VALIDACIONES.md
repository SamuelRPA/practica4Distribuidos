# Sistema de validaciones

Este documento describe todas las validaciones del pipeline RRV en orden,
qué hallazgos se detectan, y qué efecto tienen sobre el estado final del acta.

## Flujo completo de una acta (RRV)

```
┌────────────────────┐
│ 1. OCR             │ Multi-pass (PSM 6, 4, 11) + consolidación
│  Multi-pass        │ → confianza por campo + valor consenso
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ 2. Validación      │ Cuadre aritmético INTERNO antes de soltar:
│    interna OCR     │  - VE + ausentismo == habilitados
│                    │  - p1+...+nulos == VE
│                    │  - Sin negativos
│                    │  - VE <= habilitados
│                    │  → puntaje 0..1 (penaliza confianza)
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ 3. Reintento si    │ Si cuadre falla y calidad de imagen es decente,
│    falló cuadre    │ se intenta OCR con threshold invertido.
│                    │ Si da mejor puntaje, ese resultado gana.
└──────────┬─────────┘
           ▼  (resultado sale del OCR Service)
┌────────────────────┐
│ 4. Validador       │ Compara contra padrón Postgres:
│    PADRÓN          │  - ¿Mesa existe en mesas_electorales?
│                    │  - ¿id_recinto inferido coincide con padrón?
│                    │  - ¿habilitados del acta == cantidad_habilitada?
│                    │  → severidad: OK / ADVERTENCIA / CRITICO
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ 5. Validación      │ R1-R6 modo RRV (no bloqueante):
│    aritmética RRV  │  - Marca advertencias
│                    │  - Si negativo, normaliza a 0
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ 6. Penalización    │ Si padrón=CRITICO   → confianza -0.3
│    confianza       │ Si padrón=ADVERTENCIA → confianza -0.1
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ 7. Clasificación   │ Estado final del acta (ver tabla abajo)
│    estado          │
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ 8. Detección       │ Por hash exacto → idempotente, ignora
│    duplicados      │ Por mesa con datos distintos → DUPLICADO_PARCIAL
│                    │ Score temporal: <30s = +2, <5min = +1
│                    │ Misma fuente: +0.5
│                    │ Score >= 2 → CRITICO, sino ADVERTENCIA
└──────────┬─────────┘
           ▼
┌────────────────────┐
│ 9. INSERT en Mongo │ Acta enriquecida con todos los metadatos:
│    actas_rrv       │  - padron_hallazgos, padron_severidad
│                    │  - recinto_padron (snapshot)
│                    │  - score_duplicado
│                    │  - ocr_meta (pasos del OCR)
│                    │  - validacion_interna_ocr
└────────────────────┘
```

## Estados posibles del acta

| Estado | Cuándo |
|--------|--------|
| `APROBADA` | Confianza ≥ 0.80, sin advertencias, mesa existe en padrón |
| `BAJA_CONFIANZA` | Confianza < 0.50, o entre 0.50–0.80 con advertencias |
| `DATOS_INCONSISTENTES` | Confianza alta pero hay advertencias aritméticas (R1, R2, etc.) |
| `DUPLICADO_PARCIAL` | Ya existe acta para esa mesa con datos diferentes |
| `MESA_FANTASMA` | El codigo_mesa no existe en `mesas_electorales` (padrón) |
| `MESA_RECINTO_DISCORDANTE` | El recinto inferido del codigo_mesa no coincide con el padrón |

## Hallazgos del validador de padrón

| Código | Severidad | Descripción |
|--------|-----------|-------------|
| `MESA_INEXISTENTE_EN_PADRON` | CRÍTICO | El codigo_mesa no está en `mesas_electorales` |
| `RECINTO_VALIDO_MESA_INVALIDA` | CRÍTICO | El recinto sí existe pero la mesa no le pertenece |
| `RECINTO_INEXISTENTE` | CRÍTICO | Ni el recinto ni la mesa existen |
| `RECINTO_INFERIDO_NO_COINCIDE` | ADVERTENCIA | El id_recinto inferido del codigo_mesa difiere del padrón |
| `HABILITADOS_NO_COINCIDE_PADRON` | ADVERTENCIA | El campo "habilitados" del acta ≠ `cantidad_habilitada` del padrón |
| `PADRON_INACCESIBLE` | ADVERTENCIA | Postgres no responde — no se pudo validar (no bloquea) |
| `CODIGO_MESA_INVALIDO` | CRÍTICO | El codigo_mesa no es numérico o está vacío |

## Detección de duplicados

### Tipo 1 — Duplicado exacto (idempotencia)
```
hash(acta_nueva.contenido) == hash(acta_existente.contenido)
→ IGNORADO silenciosamente, devuelve el ingreso_id original
→ Útil para reenvíos por timeout de red
```

### Tipo 2 — Duplicado parcial (mismo mesa, datos distintos)
Calcula un **score**:

| Condición | Peso |
|-----------|------|
| Otra acta de la misma mesa hace < 30 segundos | +2 |
| Otra acta de la misma mesa hace < 5 minutos | +1 |
| Otra acta de la misma mesa, misma fuente | +0.5 |

| Total score | Nivel de alerta |
|-------------|-----------------|
| ≥ 2 | **CRÍTICO** (probable error operador o intento de manipulación) |
| 1 ≤ score < 2 | **ADVERTENCIA** |
| Versión #3 o más | **CRÍTICO** automáticamente |

Todas las versiones quedan visibles en el historial. La que tenga
**mayor confianza_global** se marca como `es_version_activa: true` y
es la que aparece en el dashboard.

## Validación interna del OCR

El servicio Python valida los números **antes** de devolverlos al backend.
Esto detecta cuando el OCR leyó valores que no cuadran (ej. confundió un 8 con un 0)
y permite reintentar con threshold invertido.

```python
{
  'cuadre_total':      bool,   # VE + ausentismo == habilitados
  'cuadre_parciales':  bool,   # p1+...+nulos == VE
  'sin_negativos':     bool,
  'razonable':         bool,   # VE <= habilitados, partido_n <= VE
  'puntaje':           float,  # 0..1, multiplica la confianza
  'observaciones':     [str]
}
```

Si `puntaje < 0.7` el OCR hace un segundo intento con la imagen invertida.

## Métricas tiempo de procesamiento

| Etapa | Tiempo típico |
|-------|---------------|
| Conversión PDF → imagen | 200–500 ms |
| Preprocesamiento (deskew, CLAHE, denoise, sharpen) | 400–800 ms |
| OCR pass 1 (PSM 6) | 600–1500 ms |
| OCR pass 2 (PSM 4) | 600–1500 ms |
| OCR pass 3 (PSM 11) | 600–1500 ms |
| Consolidación + validación interna | < 50 ms |
| Reintento inverso (si aplica) | +600–1500 ms |
| **Total típico** | **2–5 segundos por acta** |

Esto es procesamiento **real**, no espera artificial. La razón de los 3 passes
es que diferentes layouts del acta (encabezado, columnas, sparse) responden
mejor a diferentes PSM.

## Cómo ver todo esto en logs

Después de hacer un upload de foto a `/api/rrv/acta-pdf`:

**Backend (T2):**
```
[rrv-routes] 📷 Foto recibida desde móvil — mesa 10101001001
[rrv-routes] 📤 Encolada en q_ingesta
```

**OCR worker (T3):**
```
[ocr-worker] 📥 Mensaje recibido — mesa 10101001001
[ocr-worker] ⚙ Llamando a OCR Service ...
[ocr-worker] ✓ OCR completado para mesa 10101001001
   ↳ {"confianza_promedio":"0.89","modo":"TESSERACT","campos":9}
```

**OCR service (Docker logs):**
```
[ocr-service] ━━━━ INICIO procesamiento mesa=10101001001 (245678 bytes) ━━━━
[ocr-service] OCR completo en 3214ms · calidad=0.78 · cuadre_total=True · cuadre_parciales=True · confianza=0.89
[ocr-service]   cuadre_total=True cuadre_parciales=True puntaje=1.0
[ocr-service] ━━━━ FIN (3214ms) ━━━━
```

**Validador worker (T4):**
```
[validador] 📥 Validando acta — mesa 10101001001
[validador] 📤 Publicado en q_escritura
```

**Escritura worker (T5):** ← **AQUÍ se ven los hallazgos**
```
[rrv-service] ⚙ Procesando acta — mesa 10101001001, fuente=PDF
[rrv-service] Padrón OK — recinto "U.E. Santa Mónica" en Chuquisaca
[rrv-service] Estado preliminar: APROBADA (confianza=0.89, advertencias=0)
[rrv-service] ✓ Insertada en Mongo — id=65a3f8b2 estado=APROBADA
[escritura] 🗄 Mongo INSERT → mesa 10101001001, estado=APROBADA
   ↳ {"ingreso_id":"65a3f8b2c4d5","confianza":0.89,"nivel_alerta":null}
```

**Caso con problemas:**
```
[rrv-service] ⚙ Procesando acta — mesa 99999999999, fuente=SMS
[rrv-service] ⚠ Validación de padrón CRÍTICA — MESA_INEXISTENTE_EN_PADRON
   ↳ {"codigo_mesa_buscado":99999999999}
[rrv-service] Estado preliminar: MESA_FANTASMA (confianza=0.65)
[rrv-service] ✓ Insertada en Mongo — id=65a4... estado=MESA_FANTASMA
[escritura] 🗄 Mongo INSERT → mesa 99999999999, estado=MESA_FANTASMA
[escritura]   Hallazgos padrón: MESA_INEXISTENTE_EN_PADRON
```
