# Actualización del Sistema Electoral: Ley 026, Métricas y Aumento de Datos

Este documento registra los últimos cambios técnicos realizados en la arquitectura y código fuente del sistema distribuido electoral, garantizando el cumplimiento de la **Ley del Régimen Electoral (Ley 026) de Bolivia** y sumando capacidades analíticas avanzadas.

---

## 1. Módulo de Preprocesamiento de PDFs (Aumento de Datos)
**Ruta:** `Data/augment_pdfs.py`

Se ha desarrollado un script en Python que toma como entrada los PDFs crudos de las actas y realiza tres acciones principales:
1. **Anonimización:** Sustituye el nombre del archivo PDF por un UUID aleatorio para evitar sesgos o vulnerabilidades. Se genera un log de mapeo `filename_mapping.txt`.
2. **Inyección de Imperfecciones Físicas:** Mediante `opencv-python`, se inyectan dinámicamente formas elípticas color café (simulando manchas/suciedad) y líneas finas (simulando arrugas) directamente en la imagen del acta antes de re-empaquetarla en formato PDF.
3. **Manejo de Caso Extremo (Acta 10304001115004):** Si el script identifica esta acta, realiza una sobrescritura forzada (un "garabato" numérico superpuesto) en la región de conteo para simular correcciones humanas bruscas que el sistema y el operador deberán resolver.

---

## 2. Inmutabilidad Geográfica y Electoral (Data-Loaders)
**Ruta:** `data-loader/load_csv.py`

Se reescribió el módulo de carga inicial de datos. 
- **Archivos Fuente Definitivos:** El sistema ahora ignora los `.txt` ambiguos y consume obligatoriamente `Recursos Practica 4 - DistribucionTerritorial.csv`, `Recursos Practica 4 - RecintosElectorales.csv` y extrae las mesas del base de `Recursos Practica 4 - Transcripciones.csv`.
- **Efecto:** Estos datos se vuelven la fuente de la verdad en la base de datos (PostgreSQL). Si al sistema ingresa un acta cuyo Recinto, Municipio, Provincia o Departamento no existe en esta lista, la base de datos restringe su paso a través de llaves foráneas (`FOREIGN KEY`) y el servicio de validación la rechaza.

---

## 3. Validaciones Jurídicas Electorales 
**Ruta:** `backend/src/services/shared/validadores.js`

El motor de validación `validarActa()` fue modificado para emitir anulaciones amparadas textualmente por la Ley 026, abandonando los códigos genéricos:
- Si el número de votos y ausentismo no iguala a los habilitados:
  `Anulado por: Inconsistencia aritmética (Art. 177 Ley 026) - El total de votos y ausentismo no cuadra con habilitados.`
- Si los votos emitidos superan a los inscritos en la mesa (Art. 177 inciso c):
  `Anulado por: Nulidad de Mesa (Art. 177 inciso c Ley 026) - El número de votos emitidos supera al número de inscritos en la mesa.`
- **Validación Humana/Observaciones:** Se integró un bloque lógico que examina el campo `observaciones`. Si se halla la subcadena `"anulado"`, el acta se marca como Nula de forma directa, independientemente de si los cálculos matemáticos (o el color y fuente detectado por el OCR) son correctos.

---

## 4. Métricas Temporales y Modificación de Esquema SQL
**Rutas:** 
- `infra/postgres-cluster/primary/init/01-schema.sql`
- `backend/src/services/oficial/oficialService.js`
- `backend/src/repositories/oficialRepository.js`

**Base de Datos:**
Se expandió el esquema de las tablas `votos_oficiales` y `transcripciones_pendientes` para albergar columnas cronológicas:
- `apertura_hora`, `apertura_minutos`
- `cierre_hora`, `cierre_minutos`
- `duracion_minutos`

Se creó una vista materializada **`v_tiempos_mesas`** para hacer consultas en O(1) destinadas al Dashboard Analítico.

**Lógica de Negocio (Backend):**
Durante la inserción de actas únicas y transcripciones, `oficialService.js` transforma la ventana horaria en minutos transcurridos y maneja correctamente ciclos donde el cierre cruza la medianoche (asincronía temporal).

**Nuevos Endpoints del Dashboard:**
Se habilitó el endpoint `GET /api/dashboard/tiempos` (`backend/src/routes/dashboard.routes.js`) que expone para el frontend:
1. **Mesa con Mayor Carga Laboral:** Calcula el máximo histórico de `duracion_minutos`.
2. **Mesa de Cierre Tardío:** Determina cronológicamente la última mesa que cerró en toda la red electoral cruzando `cierre_hora` y `cierre_minutos`.

---

## 5. Automatización de Flujos N8N
**Ruta:** `n8n/workflows/importar-csv-actas.json`

El pipeline ETL visual de n8n fue modificado estructuralmente:
- Consume el `.csv` crudo directamente.
- Extrae variables numéricas, calcula matemáticamente el `ausentismo` a partir de papeletas sobrantes.
- Enruta por POST todos los nuevos parámetros (`apertura_hora`, `cierre_hora`, `observaciones`) hacia la API Oficial en su estado nativo, disparando automáticamente el marco de las Validaciones Ley 026 y generando las métricas de duración en milisegundos sin intervención manual.
