# Data Loader

Scripts que parsean los PDFs de `Data/` (DistribucionTerritorial,
RecintosElectorales, ActasImpresas) y cargan los datos maestros en PostgreSQL.

## Uso

```bash
cd data-loader
python -m venv .venv
source .venv/Scripts/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python load_all.py
```

`load_all.py` ejecuta los scripts en orden:
1. `parse_distribucion.py` → tabla `distribucion_territorial`
2. `parse_recintos.py` → tabla `recintos_electorales`
3. `parse_mesas.py` → tabla `mesas_electorales` (lee de actas + recintos)

Los scripts son idempotentes — usan `INSERT ... ON CONFLICT DO NOTHING`,
así que ejecutarlos varias veces no rompe nada (útil para saltar llaves duplicadas generadas en la conversión del PDF).

**Nota Técnica (2026):** Se actualizó el engine de lectura de archivos a `latin-1` (ISO-8859-1) dado que los `pdftotext` generados en Windows producían caracteres no-UTF8 que crasheaban el loader.

## ¿De dónde leen?

Asumen que los PDFs ya fueron convertidos a TXT con `pdftotext -layout`.
Si los .txt no existen, ejecutarlos intentará hacer la conversión (requiere poppler-utils/xpdf-tools).
