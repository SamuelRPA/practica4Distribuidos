"""
Extracción de campos del acta — multi-pass OCR.
Estrategia:
  1. Preprocesa la imagen (preprocesar.py)
  2. Corre Tesseract con 3 PSM modes diferentes (--psm 6, 4, 11)
  3. De cada resultado intenta parsear los campos del acta
  4. Combina los 3 resultados eligiendo el valor con mayor confianza por campo
  5. Valida internamente el resultado consolidado (validador_interno.py)
  6. Si el cuadre falla, vuelve a intentar con thresholds distintos
  7. Devuelve datos + meta detallada (pasos, tiempos, confianza por campo)
 
v2.1 — Patrones más amplios para actas dañadas/rotas:
  - Regex con variantes ortográficas y OCR comunes (habilitados, ausentismo, etc.)
  - Estrategia de extracción por posición/línea como fallback cuando falla la etiqueta
  - Búsqueda de números desnudos en zonas conocidas del acta boliviana
  - PSM modes ampliados: se agrega PSM 3 (automático) para páginas muy dañadas
  - Umbral de reintento invertido bajado de 0.4 → 0.2 (reintenta más frecuentemente)
"""
 
import os
import random
import re
import time
 
try:
    import pytesseract
    from pdf2image import convert_from_bytes
    import numpy as np
    OCR_OK = True
except ImportError:
    OCR_OK = False
 
from normalizador import normalizar_campo_numerico
from preprocesar import preprocesar_imagen
from validador_interno import validar_interno
 
# ---------------------------------------------------------------------------
# Patrones principales — más tolerantes a variantes OCR y actas dañadas
# ---------------------------------------------------------------------------
PATRONES_ETIQUETAS = {
    'habilitados': re.compile(
        r'(?:'
        r'habilitad[oa]s?'
        r'|ciudadanos?\s+habilitad[oa]s?'
        r'|cantidad\s+habilitada'
        r'|electores?\s+habilitad[oa]s?'
        r'|inscritos?'
        r'|hab[il]{1,2}[it]{1,2}ados?'   # OCR con letras duplicadas
        r'|h[ao]b[il]itados?'              # h→a confusión
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'votos_emitidos': re.compile(
        r'(?:'
        r'votos?\s+emitid[oa]s?'
        r'|votos?\s+v[áa]lid[oa]s?'
        r'|emitid[oa]s?'
        r'|papeletas?\s+(?:en\s+)?[áa]nfora'
        r'|votaron'
        r'|sufragantes?'
        r'|votos?\s+[ée]mitid[oa]s?'      # acento OCR
        r'|v[ao]tos\s+emit'                # truncado por mancha
        r'|VOTOS\s+V[ÁA]LIDOS'
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'ausentismo': re.compile(
        r'(?:'
        r'ausent(?:ismo|es?)'
        r'|no\s+votaron'
        r'|no\s+sufragantes?'
        r'|aus[ea]ntismo'                  # variante OCR
        r'|ausent[ei]s'
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'p1': re.compile(
        r'(?:'
        r'\bp\s*[\.:\-]?\s*1\b'
        r'|partido\s*[\.:\-]?\s*1'
        r'|MAS[\s\-]?ISP'
        r'|daenerys'
        r'|targaryen'
        r'|[Dd]aenerys\s+[Tt]argaryen'
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'p2': re.compile(
        r'(?:'
        r'\bp\s*[\.:\-]?\s*2\b'
        r'|partido\s*[\.:\-]?\s*2'
        r'|sansa'
        r'|stark'
        r'|[Ss]ansa\s+[Ss]tark'
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'p3': re.compile(
        r'(?:'
        r'\bp\s*[\.:\-]?\s*3\b'
        r'|partido\s*[\.:\-]?\s*3'
        r'|robert'
        r'|baratheon'
        r'|[Rr]obert\s+[Bb]aratheon'
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'p4': re.compile(
        r'(?:'
        r'\bp\s*[\.:\-]?\s*4\b'
        r'|partido\s*[\.:\-]?\s*4'
        r'|tyrion'
        r'|lannister'
        r'|[Tt]yrion\s+[Ll]annister'
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'votos_blancos': re.compile(
        r'(?:'
        r'\bvb\b'
        r'|votos?\s+blanc[oa]s?'
        r'|en\s+blanco'
        r'|blanc[oa]s?'
        r'|[Vv][Bb]\s*[:\-]'
        r'|votos\s+en\s+blan'              # truncado
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'votos_nulos': re.compile(
        r'(?:'
        r'\bnu\b'
        r'|votos?\s+nul[oa]s?'
        r'|nul[oa]s?'
        r'|[Vv][Nn]\s*[:\-]'
        r'|vot[oa]s\s+nul'                 # truncado
        r')\s*[:\-\.=]?\s*(\S+)',
        re.I
    ),
    'apertura_hora': re.compile(
        r'(?:apertura|inicio\s+votaci[oó]n|inici[oó]\s+de\s+mesa)\s*[:\-\.=]?\s*(\d{1,2})\s*[:h]\s*(\d{1,2})?',
        re.I
    ),
    'cierre_hora': re.compile(
        r'(?:cierre|fin\s+votaci[oó]n|fin\s+de\s+mesa|conclusi[oó]n)\s*[:\-\.=]?\s*(\d{1,2})\s*[:h]\s*(\d{1,2})?',
        re.I
    ),
}
 
# Patrón fallback: buscar etiqueta + número en la misma línea, sin importar el separador
# Útil cuando el OCR pierde el separador ":" en actas dañadas
PATRON_LINEA_GENERICO = re.compile(r'(\d{1,4})\s*$')
 
PSM_MODES = [6, 4, 11, 3]  # Agregado PSM 3 (automático) para páginas muy dañadas
 
 
def extraer_de_texto(texto):
    """Aplica los patrones regex y normaliza."""
    crudos = {}
    interpretados = {}
    confianzas = {}
 
    lineas = texto.splitlines()
 
    for campo, patron in PATRONES_ETIQUETAS.items():
        m = patron.search(texto)
 
        if campo in ('apertura_hora', 'cierre_hora'):
            if m:
                hora = m.group(1)
                minutos = m.group(2) or '0'
                interpretados[campo] = int(hora) if hora.isdigit() else None
                interpretados[campo.replace('_hora', '_minutos')] = int(minutos) if minutos.isdigit() else 0
                confianzas[campo] = 0.9 if hora.isdigit() else 0.0
                crudos[f'{campo}_raw'] = m.group(0)
            else:
                interpretados[campo] = None
                confianzas[campo] = 0.0
            continue
 
        if m:
            crudo = m.group(1)
            valor, conf, _ = normalizar_campo_numerico(crudo)
            crudos[f'{campo}_raw'] = crudo
            interpretados[campo] = valor
            confianzas[campo] = conf
        else:
            # Fallback: buscar la línea que contiene la etiqueta (sin separador)
            # y extraer el número al final de esa línea o la siguiente
            valor_fallback = None
            conf_fallback = 0.0
            patron_nombre = patron.pattern.split(r'\s*[:\-')[0]  # tomar solo la parte del nombre
            for i, linea in enumerate(lineas):
                if re.search(patron_nombre, linea, re.I):
                    # Buscar número al final de esta línea
                    nm = PATRON_LINEA_GENERICO.search(linea)
                    if nm:
                        valor_fallback, conf_fallback, _ = normalizar_campo_numerico(nm.group(1))
                        conf_fallback = max(0.0, conf_fallback - 0.15)  # penalización por fallback
                        crudos[f'{campo}_raw'] = nm.group(1)
                        break
                    # O en la línea siguiente
                    if i + 1 < len(lineas):
                        nm2 = PATRON_LINEA_GENERICO.search(lineas[i + 1])
                        if nm2:
                            valor_fallback, conf_fallback, _ = normalizar_campo_numerico(nm2.group(1))
                            conf_fallback = max(0.0, conf_fallback - 0.20)
                            crudos[f'{campo}_raw'] = nm2.group(1)
                            break
            interpretados[campo] = valor_fallback
            confianzas[campo] = conf_fallback
 
    return interpretados, crudos, confianzas
 
 
def consolidar_passes(resultados):
    """
    Recibe lista de (interpretados, crudos, confianzas, texto, psm).
    Para cada campo, elige el valor con mayor confianza entre los passes.
    Si dos passes coinciden en el valor, eso aumenta la confianza final.
    """
    if not resultados:
        return {}, {}, {}, {}
 
    campos = set()
    for r in resultados:
        campos.update(r[0].keys())
 
    final_interpretados = {}
    final_crudos = {}
    final_confianzas = {}
    detalle_pases = {}
 
    for campo in campos:
        candidatos = []
        for interp, crudos, confs, _texto, psm in resultados:
            v = interp.get(campo)
            c = confs.get(campo, 0.0)
            if v is not None:
                candidatos.append((v, c, psm))
 
        if not candidatos:
            final_interpretados[campo] = None
            final_confianzas[campo] = 0.0
            continue
 
        valores = [c[0] for c in candidatos]
        coinciden_todos = len(set(valores)) == 1 and len(valores) >= 2
 
        mejor = max(candidatos, key=lambda c: c[1])
        valor, conf, psm_ganador = mejor
 
        if coinciden_todos:
            conf = min(1.0, conf + 0.15)  # bonus por consenso
 
        final_interpretados[campo] = valor
        final_confianzas[campo] = round(conf, 2)
        detalle_pases[campo] = {
            'valor_final': valor,
            'psm_ganador': psm_ganador,
            'consenso': coinciden_todos,
            'candidatos': candidatos,
        }
 
    mejor_pase = max(resultados, key=lambda r: sum(1 for v in r[0].values() if v is not None))
    final_crudos = mejor_pase[1]
 
    return final_interpretados, final_crudos, final_confianzas, detalle_pases
 
 
def ocr_pdf(pdf_bytes, codigo_mesa=None):
    """
    Pipeline completo de OCR robusto.
    """
    inicio = time.time()
    meta = {'pasos': [], 'mock': False}
 
    if os.environ.get('OCR_MOCK') == '1' or not OCR_OK:
        meta['mock'] = True
        meta['razon_mock'] = 'OCR_MOCK env' if os.environ.get('OCR_MOCK') else 'tesseract_no_disponible'
        return _mock(codigo_mesa, meta=meta)
 
    try:
        # 1. Convertir PDF a imágenes
        meta['pasos'].append({'etapa': 'convertir_pdf', 'inicio': time.time()})
        paginas = convert_from_bytes(pdf_bytes, dpi=300)
        if not paginas:
            return _mock(codigo_mesa, error='pdf_sin_paginas', meta=meta)
        meta['pasos'][-1]['paginas'] = len(paginas)
        meta['pasos'][-1]['fin'] = time.time()
 
        # 2. Pre-procesar la primera página
        meta['pasos'].append({'etapa': 'preprocesar', 'inicio': time.time()})
        imagen = np.array(paginas[0])
        imagen_proc, prep_meta = preprocesar_imagen(imagen, devolver_pasos=True)
        meta['pasos'][-1].update(prep_meta)
        meta['pasos'][-1]['fin'] = time.time()
        meta['calidad_imagen'] = prep_meta.get('calidad_final', 0)
 
        # 3. Multi-pass OCR — 4 PSM modes (se agregó PSM 3 para páginas dañadas)
        resultados_pases = []
        meta['pasos'].append({'etapa': 'ocr_multipass', 'inicio': time.time(), 'psm_modes': PSM_MODES})
 
        for psm in PSM_MODES:
            t0 = time.time()
            config_tess = f'--oem 3 --psm {psm} -l spa+eng -c preserve_interword_spaces=1'
            try:
                texto = pytesseract.image_to_string(imagen_proc, config=config_tess)
                interp, crudos, confs = extraer_de_texto(texto)
                campos_ok = sum(1 for v in interp.values() if v is not None)
                resultados_pases.append((interp, crudos, confs, texto, psm))
                meta['pasos'][-1].setdefault('passes', []).append({
                    'psm': psm,
                    'tiempo_ms': int((time.time() - t0) * 1000),
                    'campos_reconocidos': campos_ok,
                    'longitud_texto': len(texto),
                })
            except Exception as e:
                meta['pasos'][-1].setdefault('passes', []).append({
                    'psm': psm, 'error': str(e),
                })
 
        meta['pasos'][-1]['fin'] = time.time()
 
        # 4. Consolidar resultados de los passes
        meta['pasos'].append({'etapa': 'consolidacion', 'inicio': time.time()})
        interpretados, crudos, confianzas, detalle = consolidar_passes(resultados_pases)
        meta['pasos'][-1]['detalle_consolidacion'] = {
            campo: {'consenso': d['consenso'], 'psm_ganador': d['psm_ganador']}
            for campo, d in detalle.items()
        }
        meta['pasos'][-1]['fin'] = time.time()
 
        # 5. Validación interna — ¿cuadran los números?
        meta['pasos'].append({'etapa': 'validacion_interna', 'inicio': time.time()})
        validacion = validar_interno(interpretados, codigo_mesa=codigo_mesa)
        meta['pasos'][-1].update(validacion)
        meta['pasos'][-1]['fin'] = time.time()
 
        # 6. Reintento con imagen invertida si el cuadre falla
        # Umbral bajado de 0.4 → 0.2: reintenta incluso con imágenes de baja calidad
        if (not validacion['cuadre_total'] or not validacion['cuadre_parciales']) \
                and meta.get('calidad_imagen', 0) > 0.2:
            meta['pasos'].append({'etapa': 'reintento_inverso', 'inicio': time.time()})
            try:
                import cv2
                img_inv = cv2.bitwise_not(imagen_proc)
                texto_inv = pytesseract.image_to_string(img_inv, config='--oem 3 --psm 6 -l spa+eng')
                interp_inv, crudos_inv, confs_inv = extraer_de_texto(texto_inv)
                val_inv = validar_interno(interp_inv, codigo_mesa=codigo_mesa)
                meta['pasos'][-1]['validacion_reintento'] = val_inv
                if val_inv['puntaje'] > validacion['puntaje']:
                    interpretados, crudos, confianzas = interp_inv, crudos_inv, confs_inv
                    validacion = val_inv
                    meta['pasos'][-1]['usado'] = True
                else:
                    meta['pasos'][-1]['usado'] = False
            except Exception as e:
                meta['pasos'][-1]['error'] = str(e)
            meta['pasos'][-1]['fin'] = time.time()
 
        # 7. Confianza global ajustada por validación interna
        confianza_promedio = (
            sum(confianzas.values()) / max(1, len([v for v in confianzas.values() if v > 0]))
        )
        confianza_global = round(confianza_promedio * validacion['puntaje'], 2)
 
        meta['tiempo_total_ms'] = int((time.time() - inicio) * 1000)
        meta['confianza_global'] = confianza_global
        meta['validacion_interna'] = validacion
        meta['psm_usados'] = PSM_MODES
        meta['resumen'] = (
            f"OCR completo en {meta['tiempo_total_ms']}ms · calidad={meta.get('calidad_imagen', 0)} · "
            f"cuadre_total={validacion['cuadre_total']} · cuadre_parciales={validacion['cuadre_parciales']} · "
            f"confianza={confianza_global}"
        )
 
        return {
            'datos_interpretados': interpretados,
            'datos_crudos': crudos,
            'confianza_por_campo': confianzas,
            'confianza_global': confianza_global,
            'validacion_interna': validacion,
            'meta': meta,
        }
 
    except Exception as e:
        meta['error_fatal'] = str(e)
        return _mock(codigo_mesa, error=str(e), meta=meta)
 
 
def _mock(codigo_mesa=None, error=None, meta=None):
    """
    Datos sintéticos coherentes para desarrollo sin Tesseract.
    """
    random.seed(codigo_mesa or 42)
    if not (os.environ.get('OCR_FAST_MOCK') == '1'):
        time.sleep(1.5)
 
    habilitados = random.randint(150, 600)
    ausentismo = random.randint(10, int(habilitados * 0.3))
    votos_emitidos = habilitados - ausentismo
    p1 = random.randint(0, votos_emitidos // 2)
    p2 = random.randint(0, votos_emitidos - p1)
    p3 = random.randint(0, max(1, votos_emitidos - p1 - p2))
    p4 = max(0, votos_emitidos - p1 - p2 - p3 - 5)
    blancos = max(0, votos_emitidos - p1 - p2 - p3 - p4 - 2)
    nulos = max(0, votos_emitidos - p1 - p2 - p3 - p4 - blancos)
 
    datos = {
        'habilitados': habilitados,
        'votos_emitidos': votos_emitidos,
        'ausentismo': ausentismo,
        'p1': p1, 'p2': p2, 'p3': p3, 'p4': p4,
        'votos_blancos': blancos, 'votos_nulos': nulos,
    }
    validacion = validar_interno(datos, codigo_mesa=codigo_mesa)
    confianza_por_campo = {k: 0.92 for k in datos}
 
    return {
        'datos_interpretados': datos,
        'datos_crudos': {'_modo': 'MOCK'},
        'confianza_por_campo': confianza_por_campo,
        'confianza_global': 0.88,
        'validacion_interna': validacion,
        'meta': {
            **(meta or {}),
            '_mock': True,
            '_error': error,
            'tiempo_total_ms': 1500,
            'resumen': f"OCR MOCK · cuadre={validacion['cuadre_total']} · puntaje={validacion['puntaje']}",
        },
    }