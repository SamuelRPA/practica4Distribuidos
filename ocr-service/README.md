# OCR Service

Servicio HTTP en Python que recibe un PDF, ejecuta OCR con Tesseract,
normaliza dígitos OCR atípicos y devuelve los campos extraídos
con confianza por campo.

## Instalación y Ejecución

**Nota importante (2026):** Para evitar problemas de compilación de OpenCV y ausencia de compiladores C++ nativos en Windows, **este servicio ha sido migrado a Docker**. Ya no es necesario instalar Tesseract de forma local en tu máquina host.

Simplemente asegúrate de que esté levantado mediante Docker Compose o de forma autónoma:

```bash
docker run -d --name ocr-service -p 5000:5000 --network practica4distribuidos_pg_cluster -v ${PWD}:/app ocr-service
```

*(La imagen docker instala internamente `tesseract-ocr`, `libgl1` y todo lo requerido en un entorno Linux `python:3.11-slim` garantizando un 100% de éxito en cualquier SO).*

## API

### POST /ocr

Body JSON:
```json
{
  "pdf_b64": "<base64 del PDF>",
  "codigo_mesa": 12345
}
```

Response:
```json
{
  "datos_interpretados": {
    "habilitados": 85,
    "votos_emitidos": 70,
    "ausentismo": 15,
    "p1": 0, "p2": 20, "p3": 8, "p4": 32,
    "votos_blancos": 4, "votos_nulos": 6
  },
  "datos_crudos": { ... },
  "confianza_por_campo": { "habilitados": 0.97, ... }
}
```

## Modo mock

Si Tesseract no está instalado, el servicio retorna datos sintéticos coherentes
para que puedas desarrollar el resto del sistema sin atascarte en OCR.
Activa el modo con `OCR_MOCK=1`.
