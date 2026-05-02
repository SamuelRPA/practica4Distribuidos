# 🗃️ Data Loader (Carga de Datos Electorales)

Esta carpeta contiene todos los scripts necesarios para poblar las bases de datos (PostgreSQL/MongoDB) e inyectar archivos masivos para pruebas de estrés.

## 🚀 1. Carga Masiva de PDFs al Backend (Recomendado)
Para estresar el sistema y probar el OCR en RabbitMQ, puedes inyectar automáticamente una carpeta llena de PDFs.

### Requisitos previos:
Tener el `backend` encendido y corriendo en el puerto 3001.

### Ejecución:
No necesitas instalar nada en Python, el script usa Node.js nativo (v18+).
```bash
node upload_pdfs.js <ruta-a-tu-carpeta-de-pdfs>
```
*Ejemplo:*
```bash
node upload_pdfs.js ../Data/pdf
```
> **Importante:** Los archivos dentro de la carpeta deben tener en su nombre el código de la mesa correspondiente (ej: `acta_10101001001.pdf`).

---

## 🐍 2. Scripts Nativos de Python (Opcional)
Contiene scripts (como `load_csv.py`) que se conectan directamente a PostgreSQL a través de `psycopg2` para insertar recintos y padrones. 

*(Nota para Windows: Requiere Python 3.11/3.12 y herramientas de compilación C++ para psycopg2. Si usas Node.js, muchas de estas tablas se auto-generan en el esquema, por lo que su uso es opcional).*
