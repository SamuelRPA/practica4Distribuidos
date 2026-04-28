# Resumen de Instalación y Ajustes del Sistema Electoral

Este documento resume todas las acciones y configuraciones realizadas para levantar con éxito el **Sistema Nacional de Cómputo Electoral (Práctica 4)** en este entorno local de Windows.

## 🛠️ Ajustes y Solución de Problemas Realizados

Durante la instalación, se presentaron varios desafíos típicos de un entorno Windows (ausencia de compiladores C++ y librerías del sistema operativo). Para asegurar que el sistema funcionara al 100%, se tomaron las siguientes decisiones arquitectónicas:

### 1. Contenedorización del Servicio OCR
El servicio `ocr-service` requiere **Tesseract-OCR** y librerías de OpenCV que fallan al compilar en Python 3.14 bajo Windows sin MSVC.
- **Solución:** Se creó un `Dockerfile` dedicado en la carpeta `ocr-service` basado en `python:3.11-slim`. Este instala las dependencias de sistema necesarias (Tesseract, libgl1) de forma nativa en Linux y expone el puerto `5000`. Luego se construyó y ejecutó en la red de Docker.

### 2. Carga de Datos Maestros (Data Loader)
El script de carga de datos (`load_all.py`) fallaba inicialmente por dos motivos:
- Errores de codificación al leer los `.txt` extraídos de los PDFs (caracteres con tilde).
- Errores de violación de clave única en la base de datos de Postgres al intentar insertar ciertas mesas repetidas desde el PDF.
- **Solución:** 
  - Se modificaron los archivos `parse_distribucion.py`, `parse_mesas.py` y `parse_recintos.py` para utilizar `encoding='latin-1'` e ignorar registros duplicados (`ON CONFLICT DO NOTHING` controlado).
  - Además, se ajustó la expresión regular en `parse_distribucion.py` para asegurar que ningún registro de departamento/municipio se perdiera.
  - Para evitar instalar `psycopg2-binary` en el Windows host, la carga masiva se ejecutó limpiamente instanciando un contenedor efímero de Docker con Python 3.11 conectado a la red de Postgres.

### 3. Configuración de Entorno (.env)
- Se corrigió un error tipográfico en la URL de MongoDB (de `mmongodb+srv://...` a `mongodb+srv://...`).
- Se cambió el `POSTGRES_HOST` de `localhost` a `127.0.0.1` para evitar timeouts de red y fallos de autenticación originados por la resolución de IPv6 en versiones modernas de Node.js en Windows.

### 4. Inicialización de Infraestructura
- Se eliminaron volúmenes previos corruptos o vacíos y se ejecutó un inicio limpio con `docker-compose up -d`.
- Esto levantó el clúster de **PostgreSQL (Primary + 2 Standbys)**, el balanceador de carga **HAProxy**, el gestor de colas **RabbitMQ** y la herramienta de automatización **N8N**.
- Finalmente, se instalaron las dependencias de Node (`npm install`) tanto para el **Backend** como para el **Frontend** y se dejaron corriendo en segundo plano (`npm run dev`).

---

## 🚀 Cómo volver a levantar el proyecto en el futuro

Si en algún momento apagas tu computadora o cierras las consolas, estos son los pasos para volver a encender el sistema:

### 1. Iniciar la Infraestructura de fondo (Base de datos, Colas, OCR)
Abre tu terminal en la raíz del proyecto (`d:\Universidad\Distribuidos\practica4Distribuidos`) y asegúrate de que Docker Desktop esté abierto.
```bash
# Encender la base de datos, n8n y RabbitMQ
docker-compose up -d

# (Opcional) Si el contenedor de OCR está detenido, inícialo:
docker start ocr-service
```

### 2. Iniciar el Backend
Abre una **nueva pestaña** en tu terminal:
```bash
cd backend
npm run dev
```

### 3. Iniciar el Frontend
Abre otra **nueva pestaña** en tu terminal:
```bash
cd frontend
npm run dev
```

### 4. Iniciar la App Móvil (Expo)
Para capturar actas nativamente desde tu celular, abre una **nueva pestaña**:
```bash
cd mobile-app
npx expo start -c --tunnel
```
*(Escanea el código QR que aparece en la terminal con la app Expo Go de tu celular).*

Una vez que todo esté corriendo, puedes ver el sistema en tu navegador:
- **Dashboard:** [http://localhost:3000](http://localhost:3000)
- **App Móvil (Web/PWA fallback):** [http://localhost:3000/mobile](http://localhost:3000/mobile)

---
*Documento generado tras la configuración y corrección de entorno automatizada.*
