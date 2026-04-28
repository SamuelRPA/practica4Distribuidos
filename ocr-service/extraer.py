"""
Extracción de campos del acta. La heurística es:
- Buscar etiquetas conocidas (Habilitados, Votos Emitidos, Partido N, etc.)
  en el texto OCR y tomar el siguiente token numérico.
- Si Tesseract no está disponible, generar datos sintéticos (modo mock).
"""

import os
import random
import re

try:
    import pytesseract
    from pdf2image import convert_from_bytes
    from PIL import Image
    import numpy as np
    OCR_OK = True
except ImportError:
    OCR_OK = False

from normalizador import normalizar_campo_numerico
from preprocesar import preprocesar_imagen

PATRONES_ETIQUETAS = {
    'habilitados':   re.compile(r'(?:habilitad[oa]s?|ciudadanos\s+habilitados|cantidad\s+habilitada)\s*[:\-]?\s*(\S+)', re.I),
    'votos_emitidos': re.compile(r'(?:votos\s+emitid[oa]s|emitid[oa]s|voto?s?\s+vali?dos?)\s*[:\-]?\s*(\S+)', re.I),
    'ausentismo':    re.compile(r'(?:ausent(?:ismo|es)|no\s+votaron)\s*[:\-]?\s*(\S+)', re.I),
    'p1':            re.compile(r'\b(?:p\s*1|partido\s*1|MAS[\s\-]?ISP)\s*[:\-]?\s*(\S+)', re.I),
    'p2':            re.compile(r'\b(?:p\s*2|partido\s*2)\s*[:\-]?\s*(\S+)', re.I),
    'p3':            re.compile(r'\b(?:p\s*3|partido\s*3)\s*[:\-]?\s*(\S+)', re.I),
    'p4':            re.compile(r'\b(?:p\s*4|partido\s*4)\s*[:\-]?\s*(\S+)', re.I),
    'votos_blancos': re.compile(r'(?:blanc[oa]s?|en\s+blanco)\s*[:\-]?\s*(\S+)', re.I),
    'votos_nulos':   re.compile(r'(?:nul[oa]s?)\s*[:\-]?\s*(\S+)', re.I),
}


def extraer_de_texto(texto):
    crudos = {}
    interpretados = {}
    confianzas = {}

    for campo, patron in PATRONES_ETIQUETAS.items():
        m = patron.search(texto)
        if m:
            crudo = m.group(1)
            valor, conf, _ = normalizar_campo_numerico(crudo)
            crudos[f'{campo}_raw'] = crudo
            interpretados[campo] = valor
            confianzas[campo] = conf
        else:
            interpretados[campo] = None
            confianzas[campo] = 0.0

    return interpretados, crudos, confianzas


def ocr_pdf(pdf_bytes, codigo_mesa=None):
    """
    Pipeline completo. Modo mock si Tesseract o OpenCV no están instalados.
    """
    if os.environ.get('OCR_MOCK') == '1' or not OCR_OK:
        return _mock(codigo_mesa)

    try:
        paginas = convert_from_bytes(pdf_bytes, dpi=200)
        if not paginas:
            return _mock(codigo_mesa, error='pdf_sin_paginas')

        # Solo la primera página suele tener el cuerpo del acta
        imagen = np.array(paginas[0])
        imagen_proc = preprocesar_imagen(imagen)
        texto = pytesseract.image_to_string(imagen_proc, lang='spa', config='--psm 6')
        interpretados, crudos, confianzas = extraer_de_texto(texto)
        return {
            'datos_interpretados': interpretados,
            'datos_crudos': crudos,
            'confianza_por_campo': confianzas,
            'texto_completo': texto[:1000],  # primeros 1000 chars para depuración
        }
    except Exception as e:
        return _mock(codigo_mesa, error=str(e))


def _mock(codigo_mesa=None, error=None):
    """
    Datos sintéticos coherentes para desarrollo sin Tesseract.
    """
    random.seed(codigo_mesa or 42)
    habilitados = random.randint(150, 600)
    ausentismo = random.randint(10, int(habilitados * 0.3))
    votos_emitidos = habilitados - ausentismo
    p1 = random.randint(0, votos_emitidos // 2)
    p2 = random.randint(0, votos_emitidos - p1)
    p3 = random.randint(0, max(1, votos_emitidos - p1 - p2))
    p4 = max(0, votos_emitidos - p1 - p2 - p3 - 5)
    blancos = max(0, votos_emitidos - p1 - p2 - p3 - p4 - 2)
    nulos = max(0, votos_emitidos - p1 - p2 - p3 - p4 - blancos)

    return {
        'datos_interpretados': {
            'habilitados': habilitados,
            'votos_emitidos': votos_emitidos,
            'ausentismo': ausentismo,
            'p1': p1, 'p2': p2, 'p3': p3, 'p4': p4,
            'votos_blancos': blancos, 'votos_nulos': nulos,
        },
        'datos_crudos': {'_modo': 'MOCK'},
        'confianza_por_campo': {
            'habilitados': 0.95, 'votos_emitidos': 0.92, 'ausentismo': 0.90,
            'p1': 0.88, 'p2': 0.88, 'p3': 0.88, 'p4': 0.88,
            'votos_blancos': 0.90, 'votos_nulos': 0.90,
        },
        '_mock': True,
        '_error': error,
    }
