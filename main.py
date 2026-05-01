# =========================================================
# SISTEMA RRV - EXTRACCIÓN GEOMÉTRICA DE ALTA PRECISIÓN
# =========================================================

import os
import cv2
import pytesseract
import numpy as np
import pandas as pd
from fastapi import FastAPI, BackgroundTasks
from concurrent.futures import ProcessPoolExecutor, as_completed
import fitz  # PyMuPDF para PDFs super rápidos
import re
import uuid
import logging
from datetime import datetime

# ==========================
# CONFIGURACIÓN DEL SISTEMA
# ==========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACTAS_DIR = os.path.join(BASE_DIR, "Actas")
RESULTADOS_DIR = os.path.join(BASE_DIR, "Resultados")
DEBUG_DIR = os.path.join(BASE_DIR, "Debug_Recortes") # Nivel Dios para ver qué está leyendo

# Crear carpetas si no existen
for folder in [ACTAS_DIR, RESULTADOS_DIR, DEBUG_DIR]:
    os.makedirs(folder, exist_ok=True)

PROCESOS = max(1, int(os.cpu_count() * 0.8))

logging.basicConfig(filename="errores.log", level=logging.ERROR, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

app = FastAPI(title="API RRV - Extracción Perfecta")

# ==========================
# DICCIONARIO DE COORDENADAS
# ==========================
# Tamaño estándar al que redimensionaremos todas las imágenes antes de cortar
TARGET_WIDTH = 2000
TARGET_HEIGHT = 1400

# Formato: "Nombre_Campo": [Y_inicio, Y_fin, X_inicio, X_fin]
# NOTA: Estas coordenadas están aproximadas según tus imágenes. 
# Si el cuadrito no encaja perfecto, ajusta estos números.
COORDENADAS = {
    "codigo_mesa": [170, 230, 80, 320],
    "numero_mesa": [400, 520, 100, 250],
    "hora_apertura": [560, 620, 100, 280],
    "hora_cierre": [715, 780, 100, 280],
    "electores_habilitados": [785, 845, 140, 280],
    "papeletas_anfora": [870, 930, 140, 280],
    "papeletas_no_usadas": [960, 1020, 140, 280],
    
    # VOTOS CANDIDATOS
    "votos_daenerys": [330, 385, 660, 780],
    "votos_sansa": [390, 440, 660, 780],
    "votos_robert": [445, 495, 660, 780],
    "votos_tyrion": [500, 555, 660, 780],
    
    # TOTALES
    "votos_validos": [710, 765, 660, 780],
    "votos_blancos": [765, 820, 660, 780],
    "votos_nulos": [825, 880, 660, 780]
}

# ==========================
# FUNCIONES DE MEJORA DE IMAGEN
# ==========================
def preprocess_crop(roi):
    """Limpia exclusivamente el cuadradito recortado para que los números brillen."""
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    
    # Escalar el recorte para que Tesseract vea los números más grandes
    gray = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    
    # Binarización para eliminar el fondo grisáceo o de color de la papeleta
    _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    
    return thresh

def clean_ocr_text(text, is_time=False):
    """Filtro estricto: Solo deja pasar números. Convierte letras que parecen números."""
    text = text.replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1').replace('S', '5')
    if is_time:
        # Extraer solo números y agregar los dos puntos de la hora (ej: 0801 -> 08:01)
        nums = re.sub(r'[^0-9]', '', text)
        if len(nums) >= 4:
            return f"{nums[:2]}:{nums[2:4]}"
        return text
    else:
        # Solo números puros
        nums = re.sub(r'[^0-9]', '', text)
        return nums if nums else "0"

# ==========================
# MOTOR PRINCIPAL DE EXTRACCIÓN
# ==========================
def process_single_file(filepath):
    filename = os.path.basename(filepath)
    try:
        # 1. LEER ARCHIVO (PDF O IMAGEN)
        if filepath.lower().endswith(".pdf"):
            doc = fitz.open(filepath)
            page = doc[0] 
            pix = page.get_pixmap(dpi=250)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            if pix.n == 4:
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
            else:
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            doc.close()
        else:
            img = cv2.imread(filepath)
            
        if img is None:
            return None

        # 2. ESTANDARIZAR TAMAÑO (CRÍTICO PARA QUE LAS COORDENADAS FUNCIONEN)
        img = cv2.resize(img, (TARGET_WIDTH, TARGET_HEIGHT))
        
        datos = {
            "id_acta": str(uuid.uuid4())[:8], 
            "archivo": filename, 
        }

        # 3. RECORTAR Y EXTRAER
        # Configuración Tesseract: psm 7 (una sola línea de texto) y solo números
        config_nums = '--psm 7 -c tessedit_char_whitelist=0123456789'

        for campo, coords in COORDENADAS.items():
            y1, y2, x1, x2 = coords
            
            # Recortar la imagen
            recorte = img[y1:y2, x1:x2]
            recorte_procesado = preprocess_crop(recorte)
            
            # GUARDAR RECORTE PARA DEBUG (Para que veas si el cuadro está bien puesto)
            # Descomenta esta línea si quieres revisar las fotitos generadas
            # cv2.imwrite(os.path.join(DEBUG_DIR, f"{filename}_{campo}.jpg"), recorte_procesado)

            # Extraer Texto
            texto_bruto = pytesseract.image_to_string(recorte_procesado, config=config_nums)
            
            # Limpiar y guardar
            is_time = "hora" in campo
            datos[campo] = clean_ocr_text(texto_bruto, is_time)

        return datos

    except Exception as e:
        logging.error(f"Error procesando {filename}: {str(e)}")
        return {"archivo": filename, "error": "Fallo en procesamiento"}

# ==========================
# CONTROLADOR LOTE A LOTE
# ==========================
def process_all_background():
    archivos = [os.path.join(ACTAS_DIR, f) for f in os.listdir(ACTAS_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf'))]
    if not archivos: return

    csv_path = os.path.join(RESULTADOS_DIR, "resultados_maestros.csv")
    es_primer_chunk = not os.path.exists(csv_path)
    resultados_chunk = []
    chunk_size = 5 

    with ProcessPoolExecutor(max_workers=PROCESOS) as executor:
        futuros = {executor.submit(process_single_file, f): f for f in archivos}
        for idx, future in enumerate(as_completed(futuros), 1):
            resultado = future.result()
            if resultado and "error" not in resultado:
                resultados_chunk.append(resultado)
            
            if idx % chunk_size == 0 or idx == len(archivos):
                df = pd.DataFrame(resultados_chunk)
                df.to_csv(csv_path, mode='a', header=es_primer_chunk, index=False, encoding='utf-8')
                es_primer_chunk = False
                resultados_chunk = []

# ==========================
# ENDPOINTS API
# ==========================
@app.get("/")
def home():
    return {"status": "API Activa y Optimizada"}

@app.post("/iniciar_procesamiento")
def procesar_masivo(background_tasks: BackgroundTasks):
    background_tasks.add_task(process_all_background)
    return {"mensaje": "Procesamiento masivo en curso. Revisa /estado"}

@app.get("/estado")
def estado():
    archivos = len([f for f in os.listdir(ACTAS_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf'))])
    csv_path = os.path.join(RESULTADOS_DIR, "resultados_maestros.csv")
    procesados = 0
    if os.path.exists(csv_path):
        with open(csv_path, 'r', encoding='utf-8') as f: procesados = max(0, sum(1 for _ in f) - 1)
    return {
        "total_archivos": archivos,
        "procesados": procesados,
        "pendientes": archivos - procesados,
        "completado": f"{round((procesados/archivos*100) if archivos>0 else 0, 2)}%"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)