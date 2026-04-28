# Sistema Nacional de Cómputo Electoral — Práctica 4

Sistema distribuido para procesar resultados de elecciones en Bolivia.
Implementa los dos pipelines descritos en el [ADR-001](ADR-001-Arquitectura-Sistema-Electoral.md):

- **RRV (Recuento Rápido de Votos)** — preliminar, alta velocidad, ingesta por OCR/SMS/PWA
- **Cómputo Oficial** — riguroso, ACID, validación cruzada de 3 operadores, auditable

Más dashboard analítico, automatización N8N, app móvil nativa, integración SMS por mensajería.

---

## Quick start (10 minutos)

```bash
# 0. Asegúrate de tener: Docker Desktop, Node 20+, Python 3.11+, Expo Go en tu móvil
# 1. Configurar entorno
cp .env.example .env
# Edita .env: pon la contraseña REAL de tu MongoDB Atlas

# 2. Levantar infraestructura (Postgres cluster + RabbitMQ + n8n)
docker-compose up -d

# 3. Levantar OCR service en contenedor (ver README_INSTALACION_Y_AJUSTES.md)
docker start ocr-service   # si ya lo construiste, sino docker build -t ocr-service ./ocr-service

# 4. Cargar datos maestros desde los PDFs
cd data-loader && pip install -r requirements.txt && python load_all.py && cd ..

# 5. Backend
cd backend && npm install && npm run dev    # puerto 3001
# (en terminales separadas)
npm run worker:ocr
npm run worker:validador
npm run worker:escritura

# 6. Dashboard web
cd ../frontend && npm install && npm run dev    # puerto 3000

# 7. Mobile app nativa (Expo)
cd ../mobile-app && npm install
ipconfig | findstr IPv4   # Windows: averigua tu IP local
# Edita mobile-app/.env con tu IP: EXPO_PUBLIC_API_BASE_URL=http://192.168.X.X:3001
npx expo start
# Escanea el QR con Expo Go en tu celular
```

---

## Arquitectura

```
                ┌────────────────────────────────────────────────┐
                │              ENTRADAS DE DATOS                 │
                │                                                │
                │  📷 Mobile (Expo)   📨 SMS/Telegram/WhatsApp   │
                │  📄 CSV (n8n)       📝 Form Web (3 operadores) │
                └──┬─────────────┬──────────────┬─────────────┬──┘
                   │             │              │             │
                   ▼             ▼              ▼             ▼
                ┌────────────────────────────────────────────────┐
                │       BACKEND  Node.js + Express  :3001         │
                │  /api/rrv    /api/oficial   /api/sms            │
                │  /api/dashboard      Workers RabbitMQ           │
                └─────┬─────────────────────┬──────────────────┬──┘
                      │                     │                  │
                      ▼                     ▼                  ▼
                ┌─────────────┐      ┌─────────────┐    ┌────────────┐
                │ RabbitMQ    │      │ OCR Service │    │ Postgres    │
                │ q_ingesta   │      │ Tesseract   │    │ Cluster     │
                │ q_validacion│      │ + OpenCV    │    │ 3 nodos     │
                │ q_escritura │      │ Python+Flask│    │ + HAProxy   │
                │ q_dlq       │      │ :5000       │    │ :5432/:5433 │
                └──────┬──────┘      └─────────────┘    └─────────────┘
                       │
                       ▼
                ┌────────────────────────┐
                │   MongoDB Atlas         │
                │   Replica Set 3 nodos   │
                │   actas_rrv             │
                │   sms_mensajes          │
                │   sms_numeros_autorizados│
                └────────────────────────┘
                       │
                       ▼
                ┌────────────────────────┐
                │ Frontend Dashboard      │
                │ Next.js 14 + Recharts   │
                │ :3000                   │
                │  /dashboard             │
                │  /oficial               │
                │  /sms-admin             │
                └────────────────────────┘
```

Documentación completa: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Estructura de carpetas

```
practica4Distribuidos/
│
├── README.md                            ← este archivo
├── ARCHITECTURE.md                      ← decisiones arquitectónicas
├── POSTGRES-CLUSTER.md                  ← cómo levantar el cluster Postgres
├── SMS-INTEGRATION.md                   ← integrar Telegram / Twilio / WhatsApp
├── TWILIO-QUICKSTART.md                 ← guía paso a paso de Twilio
├── README_INSTALACION_Y_AJUSTES.md      ← log de ajustes de instalación
├── ACTUALIZACION_LEY026_METRICAS.md     ← ajustes Ley 026, métricas temporales, ruido PDFs
├── ADR-001-Arquitectura-Sistema-Electoral.md
│
├── .env / .env.example                  ← variables de entorno (gitignored)
├── docker-compose.yml                   ← Postgres cluster + RabbitMQ + n8n
├── .gitignore
│
├── backend/                             Node.js + Express
│   ├── package.json
│   └── src/
│       ├── config/                      env, mongo, postgres, rabbitmq
│       ├── domain/                      modelos puros
│       ├── routes/                      rrv, oficial, sms, dashboard
│       ├── services/
│       │   ├── shared/                  validadores R1-R7, normalizador OCR, hash
│       │   ├── rrv/                     smsParser, rrvService
│       │   └── oficial/                 oficialService (3-operadores + cuarentena)
│       ├── repositories/                rrvRepo, oficialRepo, smsRepo
│       ├── workers/                     ocr, validador, escritura
│       └── server.js
│
├── ocr-service/                         Python + Flask + Tesseract (Dockerizado)
│   ├── Dockerfile
│   ├── app.py
│   ├── normalizador.py                  espejo del JS
│   ├── preprocesar.py                   OpenCV: deskew, CLAHE, Otsu, dilate
│   ├── extraer.py                       OCR + extracción de campos (modo mock disponible)
│   └── requirements.txt
│
├── frontend/                            Next.js 14 (dashboard + admin)
│   └── src/app/
│       ├── page.tsx                     home
│       ├── dashboard/page.tsx           visualizaciones RRV vs Oficial
│       ├── oficial/page.tsx             formulario web del cómputo oficial
│       ├── sms-admin/page.tsx           CRUD números autorizados + simulador SMS
│       └── mobile/page.tsx              info → redirige a Expo Go
│
├── mobile-app/                          Expo + React Native nativa
│   ├── app.json                         permisos, splash, bundle id
│   ├── babel.config.js
│   ├── package.json                     SDK 54, expo-router v6, expo-image-picker, etc
│   ├── app/                             pantallas (file-based routing)
│   │   ├── _layout.tsx                  root: gradient + Stack
│   │   ├── index.tsx                    home con captura inline
│   │   ├── historial.tsx                lista persistente de envíos
│   │   └── ajustes.tsx                  config del operador
│   └── src/
│       ├── theme.ts                     sistema de diseño (matching dashboard)
│       ├── config.ts                    lee EXPO_PUBLIC_API_BASE_URL
│       ├── api.ts                       cliente HTTP + FormData
│       ├── storage.ts                   AsyncStorage: historial + cola offline
│       ├── components/                  Boton, Card, Input, Pasos, Estado, ...
│       ├── hooks/                       useCamara, useUbicacion, useConectividad, useColaOffline
│       └── screens/CapturaInline.tsx    lógica de captura (form + cámara + envío)
│
├── data-loader/                         Python — parsea PDFs a Postgres
│   ├── parse_distribucion.py
│   ├── parse_recintos.py
│   ├── parse_mesas.py
│   ├── generate_csv_actas.py            CSV de prueba para n8n
│   └── load_all.py                      orquestador
│
├── n8n/
│   ├── workflows/importar-csv-actas.json
│   └── README.md
│
├── infra/postgres-cluster/              Cluster Postgres 3 nodos
│   ├── primary/
│   │   ├── postgresql.conf
│   │   ├── pg_hba.conf
│   │   └── init/
│   │       ├── 00-replication-setup.sh
│   │       └── 01-schema.sql            schema completo del oficial
│   ├── standby/entrypoint.sh            pg_basebackup automático
│   ├── haproxy/haproxy.cfg
│   └── scripts/
│       ├── promote-standby.sh           failover manual
│       └── check-cluster.sh
│
└── Data/                                PDFs y datos maestros (gitignored)
    ├── 03 Practica 4 Bases de datos tolerantes a fallos.pdf
    ├── Recursos Practica 4 - DistribucionTerritorial.pdf
    ├── Recursos Practica 4 - RecintosElectorales.pdf
    └── Recursos Practica 4 - ActasImpresas.pdf
```

---

## Servicios y puertos

| Servicio | Tecnología | Puerto | Descripción |
|----------|-----------|--------|-------------|
| **Frontend Dashboard** | Next.js 14 | 3000 | Dashboard analítico + admin SMS + form oficial |
| **Backend API** | Node.js + Express | 3001 | APIs RRV, Oficial, SMS, Dashboard |
| **OCR Service** | Python + Flask + Tesseract | 5000 | Procesamiento de imágenes de actas |
| **Mobile App** | Expo + React Native | 8081 (dev) | App nativa para captura — abre con Expo Go |
| **PostgreSQL primary** | Postgres 16 | 5432 | Escrituras del cómputo oficial |
| **PostgreSQL standby (HAProxy)** | Postgres 16 | 5433 | Lecturas (CQRS) |
| **RabbitMQ AMQP** | RabbitMQ 3.13 | 5672 | Mensajería del pipeline |
| **RabbitMQ Management** | RabbitMQ 3.13 | 15672 | UI web — guest/guest |
| **n8n** | n8n latest | 5678 | Automatización CSV → API |
| **MongoDB** | Atlas (cloud) | — | Replica set managed para RRV |

---

## Cómo levantar cada componente

### 1. Infraestructura (Docker)

```bash
docker-compose up -d
```

Esto arranca:
- `pg_primary` (5432), `pg_standby_1` (5442), `pg_standby_2` (5443)
- `lb_postgres` HAProxy (5433 → standbys)
- `rabbitmq` (5672 + 15672 UI)
- `n8n` (5678)

Verifica el cluster Postgres:
```bash
bash infra/postgres-cluster/scripts/check-cluster.sh
```

Verifica RabbitMQ: abre http://localhost:15672 (guest/guest).

### 2. OCR Service

Como descubriste durante la instalación, **es más fácil dockerizar** que compilar OpenCV en Windows. El Dockerfile ya está en `ocr-service/`.

```bash
cd ocr-service
docker build -t ocr-service .
docker run -d --name ocr-service --network practica4distribuidos_pg_cluster -p 5000:5000 ocr-service
```

Si Tesseract aún no está disponible, el servicio devuelve datos sintéticos
(modo mock) para que el resto del sistema siga funcionando.

### 3. Carga de datos maestros

```bash
cd data-loader
python -m venv .venv
source .venv/Scripts/activate    # Windows
pip install -r requirements.txt
python load_all.py
```

Carga: `distribucion_territorial`, `recintos_electorales`, `mesas_electorales`
desde los archivos inmutables `.csv` de `Data/`. Es idempotente y rechaza actas fuera del padrón (ON CONFLICT DO NOTHING).

### 4. Backend Node.js

```bash
cd backend
npm install
npm run dev          # API HTTP en :3001
```

Workers (cada uno en su terminal):
```bash
npm run worker:ocr           # consume q_ingesta → llama OCR → publica q_validacion
npm run worker:validador     # consume q_validacion → publica q_escritura
npm run worker:escritura     # consume q_escritura → MongoDB
```

### 5. Frontend dashboard

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Rutas disponibles:
- `/dashboard` — visualizaciones (8 cards con KPIs, comparación RRV vs Oficial, top errores)
- `/oficial` — formulario para transcribir actas al cómputo oficial
- `/sms-admin` — gestión de números autorizados + simulador + auditoría

### 6. Mobile app (Expo)

```bash
cd mobile-app
npm install
```

**Configura la IP del backend** (no uses `localhost`, el móvil no la resuelve):
```bash
ipconfig | findstr IPv4    # Windows
# Edita mobile-app/.env:
# EXPO_PUBLIC_API_BASE_URL=http://192.168.X.X:3001
```

Arranca el dev server:
```bash
npx expo start
```

Te aparece un QR en la terminal. En tu celular:
- Instala **Expo Go** ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) | [iOS](https://apps.apple.com/app/expo-go/id982107779))
- Android: abre Expo Go → "Scan QR code"
- iOS: abre la cámara → escanea → toca el banner

Si el QR no funciona por temas de red:
```bash
npx expo start --tunnel    # túnel internet (más lento pero siempre funciona)
```

---

## Pipelines principales

### Pipeline RRV (rápido, eventual consistency)

```
Captura del operador (móvil/SMS/CSV)
        │
        ▼
Backend /api/rrv/*  →  RabbitMQ q_ingesta (priority 5 PDF, 10 SMS)
                              │
                              ▼ ocrWorker
                       OCR Service Python (Tesseract + normalizador)
                              │
                              ▼ q_validacion
                       validadorWorker → clasifica APROBADA/BAJA_CONFIANZA/etc
                              │
                              ▼ q_escritura
                       escrituraWorker → MongoDB Atlas (replica set)
                              │
                              ▼
                       Dashboard lee con readPreference=secondaryPreferred
```

Ver [backend/src/services/rrv/rrvService.js](backend/src/services/rrv/rrvService.js).

### Pipeline Oficial (riguroso, ACID)

```
CSV (n8n) o formulario web
        │
        ▼
Backend /api/oficial/acta
        │
        ├─ valida existencia de mesa contra padrón Postgres inmutable
        ├─ valida reglas electorales estrictas (Ley 026 Art. 177)
        ├─ detecta duplicados → CUARENTENA si ya existe acta
        ├─ detecta observación "anulado" explícita → ANULADA
        ├─ cross-check con RRV → guarda discrepancias en JSONB
        └─ INSERT en votos_oficiales (Postgres primary) con cálculo de duracion_minutos
                                │
                                ▼ trigger fn_log_evento_acta
                          eventos_acta_oficial (append-only, Event Sourcing)
```

Para el flujo de 3 operadores con validación cruzada:
```
POST /api/oficial/sesion       → crea session_id
POST /api/oficial/transcripcion (×3 operadores)
                                ↓
                 validar_cruzado_3_operadores()
                                ↓
                 ┌──────┬──────┬───────────────┐
                 ▼      ▼      ▼
            unanimidad  2/3   desacuerdo total
            APROBADA    APROBADA  EN_CUARENTENA
                       + log     supervisor revisa
```

### SMS / mensajería

```
Operador en recinto
        │
        ▼ (mensaje vía SMS / Telegram / WhatsApp)
Proveedor (Twilio / Telegram Bot / WhatsApp Cloud)
        │
        ▼ POST /api/sms/webhook/{proveedor}
Backend
        ├─ normaliza payload por proveedor (Twilio.From, Telegram.message.text, etc)
        ├─ verifica número en lista blanca (Mongo)
        ├─ parsea SMS con regex flexible
        └─ encola en q_validacion con priority=10
                                │
                                ▼
                       (sigue el pipeline RRV normal)
```

Detalles: [SMS-INTEGRATION.md](SMS-INTEGRATION.md), [TWILIO-QUICKSTART.md](TWILIO-QUICKSTART.md).

---

## Patrones distribuidos implementados

| Patrón | Implementación |
|--------|---------------|
| **CQRS** | Pool escritura → Postgres primary :5432. Pool lectura → HAProxy :5433 (standbys). Mongo: `secondaryPreferred` |
| **Event Sourcing** | Tabla `eventos_acta_oficial` append-only con trigger automático en `votos_oficiales` |
| **Idempotencia** | Hash SHA-256 de cada acta. Reenvíos retornan el `ingreso_id` original sin duplicar |
| **Tolerancia a fallos** | RabbitMQ persiste mensajes; workers reintentan; failover Postgres documentado y verificable; replica set MongoDB managed |
| **Eventual consistency** | RRV acepta `BAJA_CONFIANZA` y se actualiza conforme llegan mejores versiones |
| **Strong consistency** | Cómputo oficial: ACID con sync replication, validaciones bloqueantes |

---

## Características de la mobile app

| Feature | Cómo se implementa |
|---------|-------------------|
| Cámara nativa | `expo-image-picker` con permisos en `app.json` |
| GPS del recinto | `expo-location` opcional, asocia coordenadas a la captura |
| Modo offline | Cola persistente en AsyncStorage (`useColaOffline`) |
| Reintentos | hasta 5 veces, después marca como fallido y lo saca de cola |
| Historial | persistente entre cierres (AsyncStorage), KPIs por estado |
| Health check | ping al backend cada 10s, banner online/offline en tiempo real |
| Diseño | Gradient + glassmorphism, paleta `#1457bd` (matching del dashboard) |
| Navegación | `expo-router` file-based (3 pantallas) |

---

## SMS — administración y proveedores soportados

El sistema acepta SMS de múltiples proveedores con un solo backend:

```
POST /api/sms/webhook/twilio       ← SMS reales internacionales
POST /api/sms/webhook/telegram     ← gratis, ideal para demo
POST /api/sms/webhook/whatsapp     ← WhatsApp Cloud API
POST /api/sms/webhook/generico     ← cualquier proveedor con { numero_origen, texto }
```

Administración en `/sms-admin`:
- Lista blanca de números (CRUD)
- Toggle activo/inactivo por número
- Historial de mensajes recibidos con resultado
- Simulador integrado para probar sin proveedor real

Para configurar proveedores reales: [SMS-INTEGRATION.md](SMS-INTEGRATION.md), [TWILIO-QUICKSTART.md](TWILIO-QUICKSTART.md).

---

## Documentación complementaria

| Archivo | Contenido |
|---------|-----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagrama y decisiones de la arquitectura, justificación de cada elección |
| [POSTGRES-CLUSTER.md](POSTGRES-CLUSTER.md) | Levantar el cluster Postgres, replicación, failover paso a paso |
| [SMS-INTEGRATION.md](SMS-INTEGRATION.md) | Conectar Telegram Bot, Twilio, WhatsApp y proveedores genéricos |
| [TWILIO-QUICKSTART.md](TWILIO-QUICKSTART.md) | Guía paso a paso para Twilio (cuenta, número, ngrok, webhook) |
| [README_INSTALACION_Y_AJUSTES.md](README_INSTALACION_Y_AJUSTES.md) | Log de ajustes hechos durante la instalación inicial |
| [ACTUALIZACION_LEY026_METRICAS.md](ACTUALIZACION_LEY026_METRICAS.md) | **Nuevo:** Registro de adaptaciones normativas (Ley 026), métricas temporales de actas, aumento de datos en PDFs (manchas, arrugas) y data loaders en base a CSVs inmutables |
| [ADR-001-Arquitectura-Sistema-Electoral.md](ADR-001-Arquitectura-Sistema-Electoral.md) | Decisión arquitectónica original (versión completa) |
| [mobile-app/README.md](mobile-app/README.md) | Detalles de la app Expo + troubleshooting |
| [n8n/README.md](n8n/README.md) | Importar workflow CSV → API oficial |

---

## Troubleshooting común

| Problema | Solución |
|----------|----------|
| Backend dice "Mongo no disponible" | Verifica que la contraseña de Atlas esté correcta en `.env` y que tu IP esté permitida en Atlas Network Access |
| Postgres no acepta conexiones | `docker-compose restart pg_primary && bash infra/postgres-cluster/scripts/check-cluster.sh` |
| RabbitMQ rechaza mensajes | Asegúrate de que las colas se creen al primer arranque del backend (lo hace `connectRabbit()` automáticamente) |
| OCR Service no responde | El contenedor puede haberse detenido: `docker start ocr-service` o reconstruirlo |
| Mobile dice "Network request failed" | El móvil no llega a tu PC. Revisa `EXPO_PUBLIC_API_BASE_URL` en `mobile-app/.env` y el firewall del puerto 3001 |
| QR de Expo no carga el bundle | `npx expo start --tunnel` (más lento pero atraviesa NAT) |
| `pg_basebackup` falla en standby | Borra el volumen `docker volume rm practica4distribuidos_pg_standby_1_data` y reinicia |
| Frontend muestra arrays vacíos | Verifica que los workers estén corriendo y que el data-loader haya cargado las mesas |

---

## Cobertura de la rúbrica

| Criterio | % | Implementación |
|----------|---|----------------|
| RRV (OCR + almacenamiento) + Oficial (CSV + validación) | 50 | Backend completo, dos pipelines independientes, OCR Python, validadores compartidos R1-R7 |
| Dashboard | 20 | Frontend Next.js con 8 visualizaciones, comparación RRV vs Oficial, KPIs en tiempo real |
| Defensa individual en inglés | 30 | (tu trabajo) — la modularidad ayuda a explicar partes específicas |
| Automatización n8n | 15 | Workflow `importar-csv-actas.json` con HTTP request por fila |
| App móvil | 15 | App nativa Expo + React Native con cámara, GPS, offline queue, diseño consistente |

---

## Comandos rápidos de operación

```bash
# Ver estado del cluster Postgres
bash infra/postgres-cluster/scripts/check-cluster.sh

# Promover un standby a primary (failover manual)
bash infra/postgres-cluster/scripts/promote-standby.sh pg_standby_1

# Ver replicación en vivo desde el primary
docker exec pg_primary psql -U oep_admin -d electoral_oficial \
  -c "SELECT application_name, state, sync_state FROM pg_stat_replication;"

# Ver mensajes en cola de RabbitMQ
docker exec rabbitmq rabbitmqctl list_queues name messages

# Ver actas RRV recientes en MongoDB
# (usa Compass o mongosh con tu MONGO_URI)
db.actas_rrv.find().sort({ timestamp_recepcion: -1 }).limit(5)

# Generar CSV sintético para probar n8n
cd data-loader && python generate_csv_actas.py

# Reiniciar todos los servicios docker
docker-compose down && docker-compose up -d

# Ver logs de un componente
docker logs -f pg_primary
docker logs -f rabbitmq
docker logs -f ocr-service
```
