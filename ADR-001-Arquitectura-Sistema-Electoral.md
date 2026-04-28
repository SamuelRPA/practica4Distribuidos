# ADR-001 v2: Arquitectura del Sistema Nacional de Cómputo Electoral — Bolivia

**Status:** Aceptado (v2 — revisado)
**Fecha:** 2026-04-26
**Proyecto:** Sistema Electoral OEP — Práctica 4, Sistemas Distribuidos

---

## 1. Contexto y Restricciones Reales

**Escala:** 5.368 recintos · 35.000 mesas electorales
**Conectividad:** No todos los recintos tienen internet — SMS como canal alternativo obligatorio
**Calidad de dato:** Los PDFs vienen con fuentes atípicas, errores de suma, actas repetidas (hasta 5+ por mesa o más), datos faltantes, recintos inexistentes en el padrón, mesas asignadas a recintos pero sin existencia real
**Filosofía de diseño:** "Todo lo que puede salir mal, saldrá mal" — cada fallo tiene una respuesta explícita y siempre genera un log. Pero el sistema nunca se detiene.

---

## 2. Decisión de Base de Datos por Pipeline

### Pipeline RRV → **MongoDB** (Replica Set, 3 nodos)

**Justificación:**

El RRV necesita velocidad ante todo. Los documentos de actas que llegan del OCR son semiestructurados: un acta puede tener todos los campos, otra puede llegar con campos faltantes, mal interpretados, o con metadatos adicionales del OCR (confianza por campo, versión normalizada, versión cruda). Forzar un schema rígido SQL en la capa de ingesta ralentiza el pipeline y complica el código de normalización.

MongoDB encaja por tres razones concretas:

Primero, el schema es flexible por naturaleza. El documento del acta puede tener `campos_no_reconocidos`, `ocr_raw`, `confianza_por_campo` sin necesidad de migraciones. Cuando el OCR lee un acta con fuentes raras, guarda tanto el valor interpretado como el valor crudo — en SQL eso requiere columnas extra o JSON, en MongoDB es natural.

Segundo, el modelo de Replica Set de MongoDB maneja la disponibilidad de escritura de forma automática. Con 3 nodos, si cae el primario, se realiza una elección en ~5-15 segundos y uno de los secundarios asume como nuevo primario. El driver con `retryWrites: true` reintenta automáticamente. Desde la perspectiva del servicio que escribe, el cluster siempre está disponible para insertar. Esto cumple exactamente el requisito: "si falla una base, todo sigue igual porque tenemos otra".

Tercero, la consistencia eventual es aceptable para el RRV. Es un conteo preliminar, no vinculante. Si una acta aparece en el dashboard 10 segundos después de haber sido validada, no es un problema. Eso no sería aceptable en el cómputo oficial — ahí sí necesitamos consistencia fuerte.

```
Cluster RRV — MongoDB Replica Set (3 nodos):

  ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
  │  MONGO_RRV_1  │────▶│  MONGO_RRV_2  │────▶│  MONGO_RRV_3  │
  │  (Primary)    │     │  (Secondary)  │     │  (Secondary)  │
  └───────────────┘     └───────────────┘     └───────────────┘
         ↑                      ↑
   Acepta escrituras      Si Primary cae →
   con w:"majority"       elección automática
                          nuevo Primary en ~10s
                          writeConcern="majority"
                          garantiza durabilidad

Comportamiento ante fallo:
  - Si cae MONGO_RRV_1 → elección → MONGO_RRV_2 se convierte en Primary
  - El driver reintenta la escritura pendiente automáticamente
  - El servicio de ingesta no necesita saber qué nodo es el primario
  - Las 3 réplicas pueden servir lecturas del dashboard (readPreference: secondaryPreferred)
```

**Colección principal: `actas_rrv`**
```json
{
  "_id": "ObjectId",
  "codigo_mesa": 35000,
  "fuente": "PDF | SMS | MOVIL",
  "estado": "APROBADA | ANULADA | BAJA_CONFIANZA",
  "ingreso_numero": 1,
  "datos_interpretados": {
    "habilitados": 85,
    "votos_emitidos": 70,
    "ausentismo": 15,
    "p1": 0, "p2": 20, "p3": 8, "p4": 32,
    "votos_blancos": 4,
    "votos_nulos": 6
  },
  "datos_crudos_ocr": {
    "habilitados_raw": "8Ø",
    "votos_emitidos_raw": "7O",
    "p2_raw": "2O"
  },
  "confianza_por_campo": {
    "habilitados": 0.97,
    "votos_emitidos": 0.88,
    "p2": 0.72
  },
  "confianza_global": 0.86,
  "hash_pdf": "sha256:...",
  "motivo_anulacion": null,
  "timestamp_recepcion": "ISODate",
  "timestamp_procesado": "ISODate",
  "intentos_previos": 0
}
```

---

### Pipeline Oficial → **PostgreSQL** (Patroni, 3 nodos, Active-Active con HAProxy)

**Justificación:**

El cómputo oficial requiere ACID y consistencia fuerte sin excepciones. Una acta no puede insertarse a medias. Un operador no puede ver datos que otro aún no ha confirmado. Las consultas del dashboard oficial involucran JOINs entre mesas, recintos, municipios, departamentos — eso es SQL nativo, en MongoDB requeriría `$lookup` anidados con colecciones desnormalizadas y lógica adicional.

El cluster Patroni con 3 nodos (1 primary + 2 standbys) con HAProxy delante garantiza que cualquier escritura va siempre al nodo primario activo. Si el primario cae, Patroni hace la elección (usa etcd para consensus), HAProxy detecta el nuevo primario y redirige las conexiones. El servicio que escribe se reconecta automáticamente. Resultado práctico: siempre hay un nodo disponible para escribir.

```
Cluster Oficial — PostgreSQL + Patroni + HAProxy:

  ┌─────────────────────────────────────────────────────┐
  │                     HAProxy                         │
  │   Puerto 5000 → escribe al Primary actual           │
  │   Puerto 5001 → lee desde cualquier nodo            │
  └───────────┬───────────────────────────┬─────────────┘
              │                           │
  ┌───────────▼──────┐         ┌──────────▼──────────┐
  │  PG_OFI_1        │         │  PG_OFI_2 / PG_OFI_3│
  │  (Primary)       │◀───────▶│  (Standby)           │
  │  Escribe AQUÍ    │ replic.  │  Failover automático │
  └──────────────────┘ síncrona └─────────────────────┘
```

---

## 3. Pipeline 1 — RRV (Recuento Rápido de Votos)

### 3.1 Principio fundamental del RRV + Cola de Mensajes (C1)

**Velocidad sobre exactitud.** El RRV es preliminar y no vinculante. El objetivo es mostrar tendencias rápido. Por eso:
- No hay revisión manual en este pipeline. Si el OCR extrae datos con baja confianza, se insertan igual con `estado: BAJA_CONFIANZA`
- Solo se descarta un acta si es literalmente imposible extraer el `codigo_mesa` (sin él, no se puede asociar a ninguna mesa)
- Duplicados exactos: idempotentes, se ignoran. Duplicados parciales (mismo mesa, datos distintos): se guardan todos y se alerta según cantidad
- Todo lo que llega, se registra

**Arquitectura de colas RabbitMQ (C1) — velocidad como prioridad:**

El pipeline RRV no procesa los PDFs en línea bloqueante. Cada etapa es un worker independiente que consume de una cola y publica en la siguiente. Esto permite escalar cada etapa sin tocar las demás y absorber los 35.000 PDFs sin que la ingesta se bloquee esperando al OCR:

```
[App Móvil / SMS]
       ↓ publica
  ┌─────────────────────┐   prioridad: SMS > PDF (SMS ya es texto, más rápido)
  │  QUEUE: q_ingesta   │   durable: true · max-length: 50.000
  └─────────────────────┘
       ↓ consume (N workers OCR en paralelo, escala horizontal)
  [Pre-procesamiento → OCR → Normalización]
       ↓ publica
  ┌────────────────────────┐
  │  QUEUE: q_validacion   │   durable: true
  └────────────────────────┘
       ↓ consume (M workers Validador)
  [Validador RRV → Clasificación de estado]
       ↓ publica
  ┌───────────────────────┐
  │  QUEUE: q_escritura   │   durable: true · prefetch: 100
  └───────────────────────┘
       ↓ consume (escritura batch a MongoDB)
  [MongoDB Replica Set]

  + Dead Letter Queue (q_dlq): mensajes que fallaron 3 veces → log de error + alerta
```

**Por qué RabbitMQ y no Kafka:**
- 35.000 PDFs es un volumen manejable para RabbitMQ. Kafka añade complejidad operacional (ZooKeeper/KRaft, topics, offsets) sin beneficio proporcional.
- RabbitMQ tiene **priority queues** nativas: SMS entra con prioridad 10, PDFs con prioridad 5. Los SMS se procesan primero porque ya son texto estructurado — llegan, se parsean y se validan 10x más rápido que un PDF.
- El prefetch de escritura en batch (100 documentos) maximiza el throughput hacia MongoDB.

**Comportamiento ante fallo de una etapa:**
- Si los workers de OCR se caen: los PDFs se acumulan en `q_ingesta`. Al reiniciar los workers, continúan desde donde estaban. Sin pérdida de datos.
- Si MongoDB cae: los mensajes se acumulan en `q_escritura`. Al recuperar el cluster, se vacía la cola automáticamente.

### 3.2 Canal A — App Móvil

La app (canal rojo del diagrama) captura la foto del acta:
1. Convierte JPG/PNG → PDF (resolución mínima 200 DPI, aceptable para OCR)
2. Adjunta `codigo_mesa` seleccionado por el operador en la app (no se lee del acta, lo ingresa el humano — esto reduce errores de OCR en el campo más crítico)
3. Sube vía HTTPS con retry automático: intenta cada 15s si no hay señal, sin límite de intentos mientras la sesión esté activa
4. El servidor devuelve el `ingreso_id` para confirmar recepción

### 3.3 Canal B — SMS (formato flexible)

El SMS puede tener los campos en cualquier orden, con cualquier separador común (`;`, `,`, `|`, espacio, salto de línea). Lo que importa es que los pares `CLAVE:VALOR` o `CLAVE=VALOR` estén presentes.

**Claves aceptadas (case-insensitive, variantes incluidas):**
```
Mesa / M / mesa / MESA / cod_mesa  →  codigo_mesa
VE / ve / emitidos / votaron       →  votos_emitidos
VN / PNU / VNU / ausentes          →  ausentismo
P1 / partido1 / p1                 →  p1
P2 / partido2 / p2                 →  p2
P3 / partido3 / p3                 →  p3
P4 / partido4 / p4                 →  p4
VB / blancos / blanco              →  votos_blancos
NU / nulos / nulo                  →  votos_nulos
OBS / obs / observacion            →  observaciones (opcional)
```

**Ejemplos de SMS que se aceptan:**
```
# Formato original
M:0001128;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6

# Orden diferente, separador coma
MESA=1128, VE=70, P1=0, P2=20, P3=8, P4=32, VB=4, NU=6, VN=15

# Con texto libre (se extrae lo que se puede)
Mesa 1128 tiene 70 votantes, VN:15 ausentes. P1=0 P2=20 P3=8 P4=32 VB=4 NU=6
```

El parser usa regex sobre el texto completo del SMS buscando cada patrón de clave. Lo que no se reconoce, se ignora. Si faltan campos críticos (`codigo_mesa` o más de 3 campos de votos), el SMS se rechaza y se responde con un mensaje indicando qué campos faltaron — pero sin restricciones de horario ni límite de intentos de reenvío.

**Seguridad SMS mínima:** Lista blanca de números autorizados (registrados en el sistema antes de la elección). No se agrega autenticación por token para no complicar el canal de emergencia. Un SMS de número no registrado simplemente se ignora sin respuesta.

### 3.4 Pre-procesamiento de Imagen (B1 — nuevo paso antes del OCR)

Antes de que Tesseract vea el PDF, la imagen pasa por una cadena de pre-procesamiento. Este paso es barato computacionalmente pero multiplica la tasa de éxito del OCR en actas con mala iluminación, perspectiva torcida, o contraste bajo:

```python
def preprocesar_imagen(imagen_raw) -> imagen_procesada:
    # 1. Corrección de perspectiva (deskewing)
    #    Detecta el ángulo de inclinación del acta y lo corrige
    #    Crítico cuando la foto fue tomada de costado o con el móvil inclinado
    img = corregir_perspectiva(imagen_raw)          # OpenCV: findContours + warpPerspective

    # 2. Normalización de contraste (CLAHE)
    #    Mejora la legibilidad en zonas sobreexpuestas o subexpuestas
    #    CLAHE (Contrast Limited Adaptive Histogram Equalization) es local → no destruye
    #    las zonas que ya tenían buen contraste
    img = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8)).apply(img)

    # 3. Eliminación de ruido
    #    Filtro de mediana: preserva bordes de letras mejor que Gaussian
    img = cv2.medianBlur(img, ksize=3)

    # 4. Binarización adaptativa (Otsu)
    #    Convierte a blanco/negro con umbral calculado por zona
    #    Necesario porque el fondo del acta no es uniformemente blanco
    _, img = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # 5. Dilatación suave para reforzar trazos finos
    #    Recupera dígitos cuya tinta se diluyó en la impresión
    kernel = np.ones((2,2), np.uint8)
    img = cv2.dilate(img, kernel, iterations=1)

    return img
```

**Si el pre-procesamiento falla** (imagen completamente negra, irreconocible geométricamente) → el paso de OCR recibe la imagen original sin modificar. Nunca bloquea el pipeline.

---

### 3.5 OCR + Normalización de Caracteres

Este es el punto más crítico del sistema. Los PDFs pueden venir con cualquier variante tipográfica de los dígitos. La normalización ocurre **antes** de intentar cualquier validación numérica.

**Tabla de normalización completa (campos numéricos):**
```python
MAPA_CARACTERES = {
    # Variantes del 0
    'O': '0', 'o': '0', 'Ø': '0', 'ø': '0', 'θ': '0', 'Θ': '0',
    'Q': '0', 'D': '0',

    # Variantes del 1
    'I': '1', 'l': '1', 'i': '1', '|': '1', '!': '1',

    # Variantes del 2
    'Z': '2', 'z': '2',

    # Variantes del 3
    'E': '3',  # raro pero posible en fuentes degradadas

    # Variantes del 4
    'A': '4',  # en algunas fuentes manuscritas digitalizadas

    # Variantes del 5
    'S': '5', 's': '5',

    # Variantes del 6
    'G': '6', 'b': '6',  # b minúscula se confunde con 6 invertido

    # Variantes del 7
    '⌐': '7', 'T': '7',  # T con trazo en algunos fonts

    # Variantes del 8
    'B': '8',  # B mayúscula con serifs muy marcados

    # Variantes del 9
    'g': '9', 'q': '9',
}

def normalizar_campo_numerico(texto_crudo: str) -> tuple[int | None, float]:
    """
    Retorna (valor_normalizado, confianza).
    confianza = 1.0 si todos los chars eran dígitos originales.
    confianza decrece 0.1 por cada sustitución aplicada.
    Retorna (None, 0.0) si no se puede interpretar.
    """
    resultado = ""
    sustituciones = 0
    for char in texto_crudo.strip():
        if char.isdigit():
            resultado += char
        elif char in MAPA_CARACTERES:
            resultado += MAPA_CARACTERES[char]
            sustituciones += 1
        elif char in [' ', '.', ',']:
            continue  # separadores visuales, ignorar
        else:
            # Carácter no reconocible en contexto numérico
            sustituciones += 2  # penalización mayor
    
    if not resultado:
        return None, 0.0
    
    valor = int(resultado)
    confianza = max(0.0, 1.0 - (sustituciones * 0.1))
    return valor, confianza
```

**Estrategia cuando hay baja confianza:**
- Si `confianza_global >= 0.80`: insertar con estado `APROBADA`
- Si `confianza_global >= 0.50`: insertar con estado `BAJA_CONFIANZA` (aparece diferenciado en el dashboard)
- Si `confianza_global < 0.50` pero `codigo_mesa` se pudo extraer: insertar con estado `BAJA_CONFIANZA` y todos los campos que se pudieron
- Si `codigo_mesa` es irreconocible: descartar y loggear como `OCR_IRRECUPERABLE`

En ningún caso se envía a revisión manual. El dato entra con su nivel de confianza marcado.

### 3.6 Manejo de Múltiples Actas por Mesa — Duplicados Simples y Parciales (B2)

Pueden llegar 2, 5, 10 o más actas para la misma mesa. Vienen por reenvíos de red, errores del operador, múltiples canales simultáneos (app + SMS), o intentos maliciosos. El sistema distingue dos tipos de duplicado con estrategias diferentes:

#### Tipo 1 — Duplicado exacto (mismo contenido)
El hash SHA-256 del contenido del acta coincide con uno ya registrado. Causa típica: reintento de red, la app envió dos veces.
```
hash(acta_nueva) == hash(acta_existente)
→ Ignorar silenciosamente. No insertar, no loggear como error.
→ Responder al cliente con el mismo ingreso_id ya existente (idempotencia).
```

#### Tipo 2 — Duplicado parcial (misma mesa, contenido DIFERENTE)
El `codigo_mesa` ya existe pero el hash es distinto. Causa probable: error del operador, o intento de reemplazar un acta legítima con datos distintos. Puede ocurrir N veces (2, 5, 10+):

```python
def manejar_duplicados_rrv(codigo_mesa, nueva_acta):
    todas_las_versiones = mongo.actas_rrv.find({"codigo_mesa": codigo_mesa})
    version_count = len(todas_las_versiones)

    if version_count == 0:
        # Primera vez — insertar normalmente
        return insertar_acta(nueva_acta, ingreso_numero=1)

    # Calcular hash de la nueva acta
    hash_nuevo = sha256(nueva_acta.datos_interpretados)

    # Verificar si es duplicado exacto
    for version in todas_las_versiones:
        if version.hash_contenido == hash_nuevo:
            return {"status": "DUPLICADO_EXACTO_IGNORADO", "id": version._id}

    # Es duplicado PARCIAL — misma mesa, datos diferentes
    # Clasificar nivel de alerta según cuántas versiones ya hay
    nivel_alerta = "ADVERTENCIA" if version_count < 3 else "CRITICO"

    nueva_acta.estado = "DUPLICADO_PARCIAL"
    nueva_acta.ingreso_numero = version_count + 1
    nueva_acta.nivel_alerta = nivel_alerta
    insertar_acta(nueva_acta)

    log_duplicado_parcial({
        "codigo_mesa": codigo_mesa,
        "total_versiones": version_count + 1,
        "hash_nueva": hash_nuevo,
        "hashes_existentes": [v.hash_contenido for v in todas_las_versiones],
        "diferencias": comparar_campos(todas_las_versiones[-1], nueva_acta),
        "nivel_alerta": nivel_alerta,
        "nota": "Actas con datos distintos para la misma mesa. "
                "Posible error del operador o intento de manipulación."
                if nivel_alerta == "CRITICO" else "Reenvío con datos distintos."
    })

    # El dashboard muestra la versión con mayor confianza_global como "activa"
    # Las demás quedan visibles en el historial de la mesa
    reelegir_version_activa(codigo_mesa)
```

**Comportamiento en resumen:**

| Situación | Tipo | Acción | Alerta |
|-----------|------|--------|--------|
| Misma mesa, mismo hash | Exacto | Ignorar (idempotente) | Ninguna |
| Misma mesa, distinto hash, 1ra duplicación | Parcial | Insertar como DUPLICADO_PARCIAL | ADVERTENCIA |
| Misma mesa, distinto hash, 3ra+ duplicación | Parcial repetido | Insertar como DUPLICADO_PARCIAL | CRÍTICO |
| Versión con mayor confianza que la activa | Mejora | Actualizar versión activa | Info |

El log de duplicados parciales con nivel CRÍTICO se expone directamente en el panel de supervisión del dashboard para revisión humana post-elección.

### 3.6 Validaciones del RRV (rápidas, no bloqueantes)

Las validaciones del RRV son livianas. Si fallan, el acta igual se inserta con estado `BAJA_CONFIANZA` o `DATOS_INCONSISTENTES` — nunca se descarta por reglas de negocio.

```python
def validar_y_clasificar_rrv(acta) -> str:
    """Retorna el estado que tendrá el acta."""
    errores = []

    # R1: cuadre total
    if acta.votos_emitidos + acta.ausentismo != acta.habilitados:
        errores.append("CUADRE_TOTAL")

    # R2: cuadre de votos
    suma = acta.p1 + acta.p2 + acta.p3 + acta.p4 + acta.votos_blancos + acta.votos_nulos
    if suma != acta.votos_emitidos:
        errores.append("CUADRE_VOTOS")

    # R3: no puede haber negativos
    campos = [acta.p1, acta.p2, acta.p3, acta.p4, acta.votos_blancos, acta.votos_nulos,
              acta.votos_emitidos, acta.ausentismo, acta.habilitados]
    if any(v is not None and v < 0 for v in campos):
        errores.append("VALOR_NEGATIVO")

    # R4: habilitados no puede ser 0
    if acta.habilitados == 0:
        errores.append("HABILITADOS_CERO")

    if not errores and acta.confianza_global >= 0.80:
        return "APROBADA"
    elif acta.confianza_global < 0.50:
        return "BAJA_CONFIANZA"
    elif errores:
        return "DATOS_INCONSISTENTES"
    else:
        return "BAJA_CONFIANZA"
    # En todos los casos se inserta. Solo OCR_IRRECUPERABLE no se inserta.
```

---

## 4. Pipeline 2 — Cómputo Oficial (OEP)

### 4.1 Principio fundamental del Oficial

**Exactitud sobre velocidad.** Aquí sí se rechaza con firmeza. Pero se rechazan los registros individuales, no el sistema. Si un acta falla la validación, el operador o el CSV siguen procesando las demás. El sistema no se detiene por una acta mala.

### 4.1.5 Entrada de Datos: Transcripción por Tres Operadores y Validación Cruzada (F1)

**Principio:** Cada acta física es procesada por alguna de estas dos vías — manual con tres operadores, o automatizada con N8N. Ambas convergen en el mismo validador cruzado.

#### Vía A — Transcripción manual: Tres operadores independientes (MT1, MT2, MT3)

Cada acta física es transcrita de forma **independiente** por tres operadores (MT1, MT2, MT3) en el sistema OEP. Ninguno ve la entrada del otro. Una vez que los tres registran su transcripción, el sistema ejecuta la validación cruzada automáticamente.

#### Vía B — Automatización: N8N como alternativa a los tres operadores

N8N actúa como orquestador de flujo alternativo. En lugar de esperar a tres operadores humanos, N8N ejecuta el mismo OCR y extracción de datos del Pipeline RRV, genera **tres "transcripciones sintéticas"** a partir de distintos modelos o configuraciones de OCR, y las inyecta directamente en `transcripciones_pendientes` con `operador_id` = 101/102/103 (rango reservado para agentes automáticos). El validador cruzado `validar_cruzado_3()` no distingue si las entradas vienen de humanos o de N8N.

```
   [Acta física recibida]
          │
    ┌─────┴──────┐
    │            │
  Vía A        Vía B
  3 operadores  N8N (automatizado)
  MT1/MT2/MT3   OCR ×3 configuraciones
    │            │
    └─────┬──────┘
          ▼
  transcripciones_pendientes
          ▼
  validar_cruzado_3()  ← mismo código, ambas vías
```

**Cuándo usar cada vía:**

| Criterio | Vía A (operadores) | Vía B (N8N) |
|---|---|---|
| Actas con imagen clara | opcional | preferida (más rápido) |
| Actas con daños/manchas | obligatoria | como apoyo inicial |
| Volumen masivo sin tiempo | no recomendada | obligatoria |
| Acta impugnada legalmente | obligatoria | no válida como única fuente |

```
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │  Operador 1  │   │  Operador 2  │   │  Operador 3  │
    │    (MT1)     │   │    (MT2)     │   │    (MT3)     │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────────────────────────────────────────────┐
    │         transcripciones_pendientes (PostgreSQL)     │
    │    session_id | codigo_mesa | operador | valores     │
    └─────────────────────────────────────────────────────┘
                              │
                              ▼  (cuando llegan los 3)
                  ┌───────────────────────┐
                  │  validar_cruzado_3()  │
                  └──────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        Unanimidad      Mayoría 2/3    3-way disagree
        APROBADA      APROBADA +      EN_CUARENTENA
                      log discordante  → supervisor
```

**Lógica de validación cruzada:**

```python
def validar_cruzado_tres_operadores(mesa_id: int, session_id: UUID):
    entradas = db.transcripciones_pendientes.query(
        "codigo_mesa = ? AND session_id = ?", mesa_id, session_id
    )
    if len(entradas) < 3:
        return  # Esperar hasta tener las 3 transcripciones

    mt1, mt2, mt3 = entradas[0], entradas[1], entradas[2]
    campos = [
        'votos_emitidos', 'ausentismo',
        'p1', 'p2', 'p3', 'p4',
        'votos_blancos', 'votos_nulos'
    ]

    discrepancias   = {}
    valores_consenso = {}

    for campo in campos:
        v1 = getattr(mt1, campo)
        v2 = getattr(mt2, campo)
        v3 = getattr(mt3, campo)
        valores = [v1, v2, v3]

        if v1 == v2 == v3:
            # Unanimidad → consenso limpio
            valores_consenso[campo] = v1

        elif v1 == v2 or v1 == v3 or v2 == v3:
            # Mayoría 2-de-3 → usar valor mayoritario, registrar discordante
            mayoria = max(set(valores), key=valores.count)
            discordante = [
                (op, v) for op, v in [("MT1", v1), ("MT2", v2), ("MT3", v3)]
                if v != mayoria
            ]
            valores_consenso[campo] = mayoria
            discrepancias[campo] = {
                "consenso":    mayoria,
                "discordante": discordante,
                "resolucion":  "MAYORIA_2_DE_3"
            }

        else:
            # Desacuerdo total → campo sin resolver
            discrepancias[campo] = {
                "mt1": v1, "mt2": v2, "mt3": v3,
                "resolucion": "CUARENTENA_TOTAL_DESACUERDO"
            }
            valores_consenso[campo] = None

    campos_en_cuarentena = [
        c for c, d in discrepancias.items()
        if d.get("resolucion") == "CUARENTENA_TOTAL_DESACUERDO"
    ]

    if not campos_en_cuarentena:
        # Aprobada: unanimidad total o mayorías resueltas
        acta_oficial = construir_acta(
            valores_consenso,
            estado="APROBADA",
            discrepancias_menores=discrepancias  # puede estar vacío
        )
    else:
        # Al menos un campo sin resolver → cuarentena total
        acta_oficial = construir_acta(
            valores_consenso,
            estado="EN_CUARENTENA",
            campos_sin_resolver=campos_en_cuarentena
        )

    db.votos_oficiales.insert(acta_oficial)
    db.logs_oficial.insert({
        "tipo":                 "VALIDACION_CRUZADA_3_OPERADORES",
        "codigo_mesa":          mesa_id,
        "estado_resultado":     acta_oficial.estado,
        "total_discrepancias":  len(discrepancias),
        "campos_en_cuarentena": campos_en_cuarentena,
        "timestamp":            utcnow()
    })
```

**Tabla de sesiones de transcripción:**

```sql
CREATE TABLE transcripciones_pendientes (
    id              SERIAL PRIMARY KEY,
    session_id      UUID NOT NULL,
    codigo_mesa     INTEGER NOT NULL REFERENCES mesas_electorales(codigo_mesa),
    operador_id     INTEGER NOT NULL,   -- MT1=1, MT2=2, MT3=3
    votos_emitidos  INTEGER,
    ausentismo      INTEGER,
    p1              INTEGER, p2 INTEGER, p3 INTEGER, p4 INTEGER,
    votos_blancos   INTEGER,
    votos_nulos     INTEGER,
    creado_en       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (session_id, codigo_mesa, operador_id)
);
```

**Estados del acta oficial resultante:**

| Escenario | Estado | Acción siguiente |
|---|---|---|
| Los 3 coinciden en todos los campos | `APROBADA` | Se publica al cómputo oficial |
| 2-de-3 coinciden en todos los campos | `APROBADA` | Se publica + log con discordante |
| Al menos 1 campo con desacuerdo total | `EN_CUARENTENA` | Supervisor revisa y resuelve manualmente |

---

### 4.1.8 Reutilización de validaciones RRV en el Cómputo Oficial

Las reglas de validación R1–R7 del Pipeline RRV **son las mismas** que usa el Cómputo Oficial. La diferencia no está en qué se valida, sino en **qué pasa cuando falla**:

| Regla | Descripción | RRV (fallo) | Oficial (fallo) |
|---|---|---|---|
| R1 | `VE + ausentismo = habilitados` | BAJA_CONFIANZA, sigue | RECHAZADO, bloquea ese registro |
| R2 | `P1+P2+P3+P4+VB+VN = VE` | BAJA_CONFIANZA, sigue | RECHAZADO, bloquea ese registro |
| R3 | `habilitados == padrón maestro` | Advertencia en log | RECHAZADO bloqueante |
| R4 | Todos los campos ≥ 0 | Normaliza a 0, sigue | RECHAZADO bloqueante |
| R5 | `VE ≤ habilitados` | BAJA_CONFIANZA, sigue | RECHAZADO bloqueante |
| R6 | `habilitados > 0` | Advertencia en log | RECHAZADO bloqueante |
| R7 | Mesa existe en padrón | Advertencia (no bloquea RRV) | MESA_INEXISTENTE bloqueante |

**Implementación compartida:** el módulo `validaciones_electorales.py` es importado por ambos pipelines. El parámetro `modo` controla el comportamiento ante fallo:

```python
def validar_acta(acta, modo: Literal["RRV", "OFICIAL"]) -> ResultadoValidacion:
    errores_bloqueantes = []
    advertencias = []

    # R1
    if acta.votos_emitidos + acta.ausentismo != acta.habilitados:
        if modo == "OFICIAL":
            errores_bloqueantes.append("CUADRE_TOTAL_FAIL_R1")
        else:
            advertencias.append("CUADRE_TOTAL_FAIL_R1")

    # R2
    suma_parciales = acta.p1 + acta.p2 + acta.p3 + acta.p4 + acta.votos_blancos + acta.votos_nulos
    if suma_parciales != acta.votos_emitidos:
        if modo == "OFICIAL":
            errores_bloqueantes.append("CUADRE_PARCIALES_FAIL_R2")
        else:
            advertencias.append("CUADRE_PARCIALES_FAIL_R2")

    # R4: campos negativos
    for campo in ['p1','p2','p3','p4','votos_blancos','votos_nulos','votos_emitidos']:
        if getattr(acta, campo, 0) < 0:
            if modo == "OFICIAL":
                errores_bloqueantes.append(f"CAMPO_NEGATIVO_{campo.upper()}")
            else:
                setattr(acta, campo, 0)  # RRV normaliza silenciosamente

    # R5
    if acta.votos_emitidos > acta.habilitados:
        if modo == "OFICIAL":
            errores_bloqueantes.append("VE_SUPERA_HABILITADOS_R5")
        else:
            advertencias.append("VE_SUPERA_HABILITADOS_R5")

    return ResultadoValidacion(
        aprobada=len(errores_bloqueantes) == 0,
        errores=errores_bloqueantes,
        advertencias=advertencias
    )
```

---

### 4.2 Validaciones exhaustivas del Cómputo Oficial

A diferencia del RRV, aquí los errores sí son bloqueantes para ese registro específico:

#### Grupo 1 — Validaciones de existencia (contra el padrón maestro)

```sql
-- Error: MESA_INEXISTENTE
-- La mesa que intentan insertar no existe en ningún recinto del padrón
SELECT * FROM mesas_electorales WHERE codigo_mesa = :codigo_mesa;
-- Si 0 rows → RECHAZAR con motivo MESA_INEXISTENTE

-- Error: RECINTO_EXISTE_PERO_MESA_NO
-- El operador puso un recinto válido pero un número de mesa que no le corresponde
SELECT * FROM mesas_electorales 
WHERE id_recinto = :id_recinto AND codigo_mesa = :codigo_mesa;
-- Si 0 rows pero el recinto sí existe → RECINTO_VALIDO_MESA_INVALIDA

-- Error: RECINTO_INEXISTENTE
-- El código de recinto enviado no está en la base de recintos
SELECT * FROM recintos_electorales WHERE id_recinto = :id_recinto;
-- Si 0 rows → RECINTO_INEXISTENTE
```

#### Grupo 2 — Validaciones aritméticas (iguales al RRV pero bloqueantes)

```
R1: votos_emitidos + ausentismo = habilitados_padron  [OBLIGATORIO]
R2: p1 + p2 + p3 + p4 + votos_blancos + votos_nulos = votos_emitidos  [OBLIGATORIO]
R3: habilitados_padron == valor_en_padron_maestro  [OBLIGATORIO, dato inmutable]
R4: Todos los campos numéricos >= 0  [OBLIGATORIO]
R5: votos_emitidos <= habilitados_padron  [OBLIGATORIO]
R6: habilitados_padron > 0  [OBLIGATORIO]
```

#### Grupo 3 — Validaciones de duplicado (más de 5 actas por mesa)

```python
def manejar_duplicado_oficial(codigo_mesa, nuevo_registro):
    existentes = db.votos_oficiales.query(
        "codigo_mesa = ? AND estado != 'ANULADA'", codigo_mesa
    )
    
    if len(existentes) == 0:
        # Primera vez — procesar normalmente
        return procesar_oficial(nuevo_registro)
    
    # Ya existe al menos una → CUARENTENA de todas
    # Anular todas las existentes
    for registro in existentes:
        db.votos_oficiales.update(registro.id, {
            "estado": "EN_CUARENTENA",
            "motivo": f"DUPLICADO_DETECTADO: {len(existentes)+1} actas para misma mesa"
        })
    
    # Insertar el nuevo también en cuarentena
    nuevo_registro.estado = "EN_CUARENTENA"
    nuevo_registro.motivo = f"DUPLICADO: acta #{len(existentes)+1} para mesa {codigo_mesa}"
    db.votos_oficiales.insert(nuevo_registro)
    
    # Log obligatorio
    db.logs_oficial.insert({
        "tipo": "CUARENTENA_DUPLICADO",
        "codigo_mesa": codigo_mesa,
        "total_actas_afectadas": len(existentes) + 1,
        "accion": "Todas las actas de esta mesa puestas en CUARENTENA hasta revisión supervisada"
    })
    
    # Diferencia con RRV: en el oficial los duplicados van a CUARENTENA (no IGNORADO)
    # Requieren revisión de un supervisor para determinar cuál es la correcta
    # El supervisor puede aprobar una y anular las demás
```

#### Grupo 4 — Validación cruzada con RRV

```python
def validar_cruzado_con_rrv(acta_oficial):
    acta_rrv = mongo_rrv.actas.find_one({
        "codigo_mesa": acta_oficial.codigo_mesa,
        "estado": "APROBADA"
    })
    
    if acta_rrv is None:
        # No hay acta RRV para comparar → OK, continuar
        acta_oficial.discrepancia_rrv = None
        return
    
    # Calcular diferencias campo por campo
    discrepancias = {}
    campos = ['votos_emitidos', 'p1', 'p2', 'p3', 'p4', 'votos_blancos', 'votos_nulos']
    for campo in campos:
        val_oficial = getattr(acta_oficial, campo)
        val_rrv = acta_rrv['datos_interpretados'].get(campo)
        if val_oficial != val_rrv:
            discrepancias[campo] = {"oficial": val_oficial, "rrv": val_rrv}
    
    # Guardar discrepancias en el registro (no bloquea la inserción)
    acta_oficial.discrepancia_rrv = discrepancias if discrepancias else None
    # Las discrepancias se muestran en el dashboard para análisis
```

### 4.3 Schema SQL (Oficial)

```sql
-- Tabla maestra de mesas (solo lectura, cargada al inicio)
CREATE TABLE mesas_electorales (
    codigo_mesa         INTEGER PRIMARY KEY,
    nro_mesa            INTEGER NOT NULL,
    cantidad_habilitada INTEGER NOT NULL,  -- INMUTABLE
    id_recinto          INTEGER NOT NULL REFERENCES recintos_electorales(id)
);

-- Tabla de votos oficiales
CREATE TABLE votos_oficiales (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_mesa         INTEGER NOT NULL REFERENCES mesas_electorales(codigo_mesa),
    habilitados         INTEGER NOT NULL,       -- copiado del padrón al insertar
    votos_emitidos      INTEGER,
    ausentismo          INTEGER,
    p1                  INTEGER DEFAULT 0,
    p2                  INTEGER DEFAULT 0,
    p3                  INTEGER DEFAULT 0,
    p4                  INTEGER DEFAULT 0,
    votos_blancos       INTEGER DEFAULT 0,
    votos_nulos         INTEGER DEFAULT 0,
    estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    -- Estados: APROBADA | EN_CUARENTENA | ANULADA | PENDIENTE
    motivo_estado       TEXT,
    discrepancia_rrv    JSONB,               -- diferencias vs el conteo rápido
    fuente              VARCHAR(10) NOT NULL, -- MANUAL | CSV | N8N
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    creado_por          VARCHAR(50) NOT NULL, -- operador MT1/MT2/MT3 o "N8N"
    modificado_en       TIMESTAMPTZ,
    modificado_por      VARCHAR(50),
    sesion_id           UUID NOT NULL
);

-- Event log inmutable (Event Sourcing)
CREATE TABLE eventos_acta_oficial (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_mesa     INTEGER NOT NULL,
    tipo_evento     VARCHAR(50) NOT NULL,
    -- INGRESADA | VALIDADA | APROBADA | RECHAZADA | EN_CUARENTENA
    -- CUARENTENA_LIBERADA | ANULADA | SUPERVISOR_APROBÓ
    payload         JSONB NOT NULL,
    actor           VARCHAR(50) NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Esta tabla es APPEND-ONLY. Nada se borra ni modifica aquí jamás.

-- Log de errores (también append-only)
CREATE TABLE logs_oficial (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    codigo_mesa     INTEGER,
    tipo_error      VARCHAR(60) NOT NULL,
    detalle         TEXT NOT NULL,
    datos_entrada   JSONB,
    operador_id     VARCHAR(50)
);

-- Índices
CREATE INDEX idx_vo_mesa ON votos_oficiales(codigo_mesa);
CREATE INDEX idx_vo_estado ON votos_oficiales(estado);
CREATE INDEX idx_eventos_mesa ON eventos_acta_oficial(codigo_mesa);
CREATE INDEX idx_eventos_tipo ON eventos_acta_oficial(tipo_evento);
```

---

## 5. Cluster de Base de Datos — Comportamiento ante Fallos

### MongoDB RRV (3 nodos)

El Replica Set de MongoDB usa elección basada en mayoría (Raft simplificado). Con 3 nodos:
- Tolerancia a fallos: puede caer 1 nodo sin afectar operación
- Si cae el Primary → los 2 Secondary restantes eligen nuevo Primary en ~5-15s
- El driver con `retryWrites: true` y `retryReads: true` reintenta automáticamente
- `writeConcern: { w: "majority" }` garantiza que la escritura fue confirmada por al menos 2 nodos antes de responder OK
- Los 3 nodos pueden servir lecturas (`readPreference: "secondaryPreferred"`) → el dashboard distribuye carga entre los 3

```
Configuración del cliente MongoDB (driver):
{
  replicaSet: "rsRRV",
  w: "majority",
  j: true,
  retryWrites: true,
  retryReads: true,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000
}
```

### PostgreSQL Oficial (Patroni + etcd + HAProxy)

```
Componentes:
  - 3 nodos PG (1 primary activo + 2 standbys sincrónicos)
  - etcd cluster (3 nodos) para consensus de liderazgo
  - HAProxy como punto de entrada único:
      Puerto 5432 → Primary (escrituras, lecturas consistentes)
      Puerto 5433 → Any Standby (lecturas del dashboard)

Ante fallo del Primary:
  1. etcd detecta pérdida de heartbeat (~5s)
  2. Patroni inicia elección (~5-10s)
  3. HAProxy healthcheck detecta nuevo primary (~5s)
  Total: ~15-20s de indisponibilidad de escritura
  Durante esos 20s: las escrituras pendientes hacen retry con backoff exponencial
```

**En ambos clusters:** Ningún fallo de un nodo individual detiene el sistema. La alta disponibilidad es automática, sin intervención humana.

---

## 6. Catálogo Completo de Errores y Logs

Todo rechazo, anulación, advertencia o evento relevante genera un registro. El sistema nunca silencia un error.

| Código de error | Pipeline | Descripción | Acción |
|-----------------|----------|-------------|--------|
| `OCR_IRRECUPERABLE` | RRV | No se pudo extraer `codigo_mesa` | Descartado, log con hash del PDF |
| `BAJA_CONFIANZA` | RRV | Confianza global < 0.80 | Insertado con estado BAJA_CONFIANZA |
| `CUADRE_TOTAL_FAIL` | Ambos | VE + PNU ≠ CH | RRV: inserta como DATOS_INCONSISTENTES. Oficial: RECHAZADA |
| `CUADRE_VOTOS_FAIL` | Ambos | Suma partidos ≠ VE | RRV: inserta. Oficial: RECHAZADA |
| `VALOR_NEGATIVO` | Ambos | Campo numérico < 0 | RRV: inserta con flag. Oficial: RECHAZADA |
| `DATO_MAESTRO_CH` | Ambos | CH del acta ≠ padrón maestro | RRV: flag. Oficial: RECHAZADA |
| `DUPLICADO_IGNORADO` | RRV | Mesa ya tiene acta APROBADA | Guarda como DUPLICADO_IGNORADO |
| `CUARENTENA_DUPLICADO` | Oficial | Más de 1 acta para misma mesa | Todas pasan a EN_CUARENTENA |
| `MESA_INEXISTENTE` | Oficial | codigo_mesa no en padrón | RECHAZADA |
| `RECINTO_INEXISTENTE` | Oficial | id_recinto no existe | RECHAZADA |
| `RECINTO_VALIDO_MESA_INVALIDA` | Oficial | Recinto OK pero mesa no le pertenece | RECHAZADA |
| `SMS_CAMPOS_FALTANTES` | RRV | SMS sin codigo_mesa u otros críticos | No procesado, SMS de respuesta con campos faltantes |
| `SMS_NUMERO_NO_AUTORIZADO` | RRV | Número no en lista blanca | Ignorado silenciosamente |
| `VE_MAYOR_QUE_HABILITADOS` | Oficial | votos_emitidos > habilitados_padron | RECHAZADA |
| `HABILITADOS_CERO` | Ambos | habilitados = 0 | RRV: flag. Oficial: RECHAZADA |
| `DISCREPANCIA_RRV_OFICIAL` | Oficial | Diferencia vs acta RRV | Insertada, discrepancia guardada en JSON |

---

## 7. N8N — Workflow de Automatización (Oficial)

```
Workflow N8N para CSV:

  [Trigger: archivo CSV subido]
         ↓
  [Leer CSV fila por fila]
         ↓
  [Mapear columnas → campos de acta]
         ↓
  [HTTP POST → /api/oficial/acta]
         ↓
    ¿Respuesta OK?
      SÍ → Marcar fila como procesada
      NO → Guardar en lista de errores + continuar con siguiente fila
         ↓
  [Al finalizar: generar reporte]
    - Total filas: N
    - Aprobadas: X
    - Rechazadas: Y (con motivos agrupados)
    - En cuarentena: Z
```

Las filas se procesan de forma idempotente: si el workflow se interrumpe y se reintenta, las actas ya insertadas devolverán `DUPLICADO_CUARENTENA` y el N8N las registra sin volver a insertar.

---

## 8. Dashboard Analítico

Conectado a las réplicas de lectura de ambos clusters (CQRS — las lecturas nunca afectan el pipeline de escritura):

**Fuente de datos:**
- Lecturas de MongoDB RRV → `secondaryPreferred`
- Lecturas de PostgreSQL Oficial → Puerto 5433 (standbys)

**Visualizaciones mínimas:**
1. **Mapa de calor** por departamento/municipio: qué partido va ganando por zona geográfica
2. **Progreso de actas** en tiempo real: recibidas / aprobadas / baja confianza / cuarentena / anuladas
3. **Comparación RRV vs Oficial** por mesa: tabla con diferencias resaltadas
4. **% Participación** por municipio (VE / habilitados_padron × 100)
5. **Distribución de votos** por candidato (P1-P4 + blancos + nulos)
6. **Timeline de ingesta** actas por hora — para detectar cuellos de botella
7. **Top errores de validación** — qué tipo de error es más frecuente (para retroalimentar el OCR)
8. **Confiabilidad TREP vs Oficial** — calculada como porcentaje de actas sin discrepancias

**Datos inmutables en el dashboard:**
- `cantidad_habilitada` por mesa: cargada del padrón, nunca cambia
- Todo lo demás (votos, estados) se puede actualizar conforme llegan más actas

---

## 9. Sprint Planning (Revisado)

### Sprint 1 — Infraestructura base (Días 1-3)
- [ ] Levantar MongoDB Replica Set (3 nodos) con Docker Compose para RRV
- [ ] Levantar PostgreSQL + Patroni (3 nodos) + etcd + HAProxy para Oficial
- [ ] Verificar failover automático en ambos clusters (matar el primario y medir tiempo de recuperación)
- [ ] Importar datos maestros: distribucion_territorial, recintos_electorales, mesas_electorales (35.000 registros)
- [ ] Crear colección MongoDB + schema Mongoose para `actas_rrv` y `logs_rrv`
- [ ] Crear schema SQL completo para el oficial

### Sprint 2 — OCR + Normalización (Días 3-5)
- [ ] Implementar servicio OCR con Tesseract
- [ ] Implementar tabla de normalización de caracteres completa
- [ ] Implementar `normalizar_campo_numerico()` con retorno de confianza por campo
- [ ] Probar con las actas de muestra del PDF de recursos (la del acta real en página 7)
- [ ] Probar con actas sintéticas que usen Ø, θ, I, S, etc.

### Sprint 3 — Validador RRV + Ingesta (Días 5-7)
- [ ] Endpoint HTTP para recepción de PDFs (multipart upload)
- [ ] Pipeline: PDF → OCR → Normalización → Validador RRV → MongoDB
- [ ] Lógica de manejo de duplicados (primera válida gana, resto DUPLICADO_IGNORADO)
- [ ] Sistema de logs en MongoDB (`logs_rrv`)
- [ ] Parser SMS flexible (regex por clave, cualquier orden)
- [ ] Receptor SMS + integración al pipeline RRV

### Sprint 4 — App Móvil (Días 6-8)
- [ ] App móvil: captura de foto + selección de mesa + conversión a PDF
- [ ] Upload con retry automático sin límite de intentos
- [ ] Confirmación visual al operador cuando el servidor recibe el PDF

### Sprint 5 — Pipeline Oficial + N8N (Días 7-10)
- [ ] Formulario web para operadores (campo por campo con validación en tiempo real)
- [ ] Endpoint `/api/oficial/acta` con todas las validaciones exhaustivas
- [ ] Lógica de cuarentena para duplicados del oficial
- [ ] Workflow N8N: lectura de CSV → POST por fila → reporte final
- [ ] Vista de supervisor para resolver actas en cuarentena

### Sprint 6 — Dashboard + Pruebas de caos (Días 10-14)
- [ ] Conectar Power BI o Metabase a réplicas de lectura
- [ ] Implementar las 8 visualizaciones requeridas
- [ ] Prueba de caos: matar nodo primario MongoDB mientras se insertan PDFs
- [ ] Prueba de caos: matar nodo primario PostgreSQL durante ingesta CSV
- [ ] Prueba de duplicados masivos: enviar la misma acta 5+ veces por distintos canales
- [ ] Prueba OCR: PDFs con fuentes atípicas de todos los dígitos
- [ ] Prueba SMS: todos los formatos alternativos + números no autorizados

---

## 10. Resumen de Decisiones Arquitectónicas

| Decisión | Elección | Razón |
|----------|----------|-------|
| BD para RRV | **MongoDB Replica Set** | Schema flexible para OCR variable, eventual consistency aceptable, failover automático, velocidad |
| BD para Oficial | **PostgreSQL + Patroni** | ACID, JOINs complejos, consistencia fuerte, auditoría |
| Cluster mode RRV | **3 nodos, elección automática** | Cualquier nodo puede ser primario, driver reintenta solo |
| Cluster mode Oficial | **Patroni + HAProxy** | Failover automático, siempre hay un nodo disponible para escribir |
| SMS format | **Flexible (regex por clave)** | Canal de emergencia — no se puede pedir formato exacto en condiciones de campo |
| RRV sin manual | **Todo entra, se clasifica** | Velocidad — el RRV es preliminar, no vinculante |
| Duplicados RRV | **Primera válida gana** | No bloquear el conteo por reenvíos |
| Duplicados Oficial | **Cuarentena de todas** | Seguridad — no publicar resultado oficial si hay ambigüedad |
| Datos inmutables | **habilitados del padrón maestro** | No pueden cambiar — cualquier acta que los altere es rechazada |
| Horario SMS | **Sin restricción** | Flexibilidad para condiciones reales de campo |
| Límite de intentos SMS | **Sin límite** | Canal de emergencia — no cortar comunicación |

---

*"Todo lo que puede salir mal, saldrá mal" — el sistema tiene una respuesta para cada caso y siempre escribe un log.*
