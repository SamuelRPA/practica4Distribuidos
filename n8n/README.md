# N8N — Workflow de Automatización

## Importar CSV de actas al pipeline oficial

El workflow está en `workflows/importar-csv-actas.json`.

### Cómo usarlo

1. Levanta n8n con `docker-compose up -d n8n`.
2. Abre http://localhost:5678 y autentícate (credenciales en `.env`).
3. Ve a **Workflows → Import from file** y selecciona `importar-csv-actas.json`.
4. Genera el CSV de prueba:
   ```bash
   cd data-loader && python generate_csv_actas.py
   ```
5. Copia `actas_sinteticas.csv` a la carpeta `n8n/workflows/` (n8n la ve en `/workflows`).
6. Ejecuta el workflow manualmente — leerá el CSV y posteará cada fila al backend.

### Lógica del workflow

```
Manual Trigger → Read CSV → Parse CSV → POST /api/oficial/acta → Resumen
                                              │
                                              └── Cada fila se evalúa por el backend:
                                                    APROBADA / EN_CUARENTENA / RECHAZADA
                                                  El workflow continúa con la siguiente
                                                  fila aunque alguna falle (ignoreResponseCode).
```

### Idempotencia

El backend detecta duplicados por `codigo_mesa` y mueve a CUARENTENA todas las
versiones. Si el workflow se reintenta sobre el mismo CSV, las actas ya insertadas
quedarán en cuarentena automáticamente y el log lo registrará.
