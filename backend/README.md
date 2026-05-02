# 🧠 Backend - APIs y Workers

El backend es el motor principal del sistema electoral. Está construido con Node.js, Express y se comunica con PostgreSQL, MongoDB y RabbitMQ.

## 🚀 Cómo ejecutar
```bash
cd backend
npm install
npm run dev
```

## 📜 Endpoints Principales (APIs)

### 1. Ingesta Rápida (RRV - RabbitMQ)
- **`POST /api/rrv/acta-pdf`**
  - **Uso**: Subir fotos/PDFs de actas (vía App Móvil o script masivo).
  - **Body (multipart/form-data)**: 
    - `file`: Archivo binario.
    - `codigo_mesa`: (ej. 10101001001).
- **`POST /api/rrv/sms`**
  - **Uso**: Recibe votos estructurados vía SMS (requiere registro previo del número).
  - **Body (JSON)**: `{ "numero_origen": "+59170000000", "texto": "M:101010...;VE:70..." }`

### 2. Cómputo Oficial
- **`POST /api/oficial/acta`**
  - **Uso**: Inserta directamente los resultados oficiales (Usado por n8n o Data Loader).
- **`POST /api/oficial/sesion` & `/transcripcion`**
  - **Uso**: Flujo de doble digitación humana.

### 3. Dashboard (Consultas en Tiempo Real)
- **`GET /api/rrv/resumen`**
  - Devuelve el conteo rápido de RRV.
- **`GET /api/oficial/resumen`**
  - Devuelve estadísticas, participación por departamento y votos válidos.
- **`GET /api/dashboard/tiempos`**
  - Devuelve las métricas de rendimiento y qué mesas fueron las más eficientes.

### 4. Administración de SMS
- **`POST /api/sms/numeros`**
  - Registra números de teléfono autorizados (lista blanca).
- **`POST /api/sms/webhook/generico`**
  - Webhook para recibir peticiones de proveedores de SMS externos.
