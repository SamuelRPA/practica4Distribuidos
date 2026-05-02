# 🚀 Guía Rápida de Ejecución: Sistema de Cómputo Electoral

Esta guía contiene los pasos exactos para arrancar todos los componentes del sistema en tu entorno local y hacer las pruebas de flujo.

## 🏗️ 1. Levantar la Infraestructura Base (Docker)
Antes de iniciar cualquier servicio, asegúrate de tener encendidos los servicios base (PostgreSQL, RabbitMQ, OCR y n8n):
```bash
docker-compose up -d
```
*Si estás usando tu PostgreSQL 18 local (puerto 5432), asegúrate de que el servicio de Postgres esté en ejecución en tu computadora.*

## ⚙️ 2. Iniciar el Backend (API & Workers)
El backend procesa toda la lógica, la cola de RabbitMQ y expone las APIs.
1. Abre una terminal en la raíz del proyecto.
2. Entra a la carpeta: `cd backend`
3. Instala dependencias (si no lo hiciste): `npm install`
4. Ejecuta el servidor en modo desarrollo:
```bash
npm run dev
```
*(El backend debe quedar corriendo. Mostrará en verde "API HTTP escuchando en :3001").*

## 📊 3. Iniciar el Dashboard (Frontend)
El dashboard te permitirá ver los mapas de calor, resultados y métricas en vivo.
1. Abre otra terminal.
2. Entra a la carpeta: `cd frontend`
3. Instala dependencias: `npm install`
4. Inicia el servidor:
```bash
npm run dev
```
5. Abre en tu navegador: **http://localhost:3000/dashboard**

## 📱 4. Iniciar la Aplicación Móvil
1. Abre otra terminal y ve a la carpeta: `cd mobile-app`
2. Verifica que el archivo `.env` apunte a tu IP local (Ej: `EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:3001`).
3. Ejecuta la app:
```bash
npx expo start
```
4. Escanea el código QR con la app **Expo Go** en tu celular para enviar fotos reales al sistema.

---

## 🧪 ¿Cómo probar el flujo completo?

### Prueba 1: Carga Masiva de PDFs (Data Loader)
1. Coloca tus archivos de actas en `Data/pdf/` con el formato de nombre (ej: `acta_10101001001.pdf`).
2. Abre una terminal y ve a `cd data-loader`.
3. Ejecuta el script de carga de Node.js:
```bash
node upload_pdfs.js ../Data/pdf
```
4. Mira el Dashboard y observa cómo el sistema procesa masivamente los archivos.

### Prueba 2: Simulador de SMS
Puedes probar la ingesta veloz a través de SMS usando `curl` desde cualquier terminal.
1. Registra tu número de celular en el sistema:
```bash
curl -X POST http://localhost:3001/api/sms/numeros -H "Content-Type: application/json" -d "{\"numero\":\"+59170123456\",\"etiqueta\":\"Celular Prueba\",\"proveedor\":\"GENERICO\"}"
```
2. Envía un SMS simulado (reemplaza el código de mesa y los votos según desees):
```bash
curl -X POST http://localhost:3001/api/sms/webhook/generico -H "Content-Type: application/json" -d "{\"numero_origen\":\"+59170123456\",\"texto\":\"M:10101001001;VE:70;VN:15;P1:0;P2:20;P3:8;P4:32;VB:4;NU:6\"}"
```
3. Verifica en el Dashboard que la mesa ha sido contabilizada al instante.
