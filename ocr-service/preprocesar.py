"""
Pre-procesamiento robusto de imagen para OCR.
Pipeline completo siguiendo sección 3.4 del ADR + mejoras:
  1. Conversión a escala de grises
  2. Detección y corrección de inclinación (deskew real con Hough lines)
  3. Eliminación de ruido (Non-Local Means para preservar bordes)
  4. Normalización de contraste (CLAHE)
  5. Sharpen suave (kernel unsharp mask)
  6. Binarización adaptativa (Sauvola si está disponible, sino Otsu)
  7. Operaciones morfológicas (close + dilate suave)
  8. Validación de calidad final (devuelve un score de calidad)
 
v2.1 — Mejoras para actas dañadas/rotas:
  - DPI mínimo subido: si la imagen es muy pequeña, upscale más agresivo
  - Parámetros CLAHE más agresivos para papeletas con manchas o bajo contraste
  - Morfología con kernel 2x2 para limpiar ruido de rasgaduras
  - Nuevo paso: inpainting ligero sobre regiones muy oscuras (manchas de tinta)
  - Se intenta binarización con múltiples umbrales y se elige la mejor calidad
  - Tolerancia de ángulo de deskew aumentada a ±45° (actas muy torcidas)
 
Si OpenCV no está disponible, devuelve la imagen original con score 0.
"""
 
import time
 
try:
    import cv2
    import numpy as np
    OPENCV_OK = True
except ImportError:
    OPENCV_OK = False
 
 
def detectar_angulo_skew(imagen_gris):
    """Detecta el ángulo de inclinación usando Hough Transform sobre los bordes."""
    edges = cv2.Canny(imagen_gris, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=150,
        minLineLength=imagen_gris.shape[1] // 6,  # líneas más cortas aceptadas (actas rotas)
        maxLineGap=30
    )
 
    if lines is None or len(lines) == 0:
        return 0.0
 
    angulos = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if x2 - x1 == 0:
            continue
        angulo = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        # Ampliado de ±20° a ±45° para actas muy torcidas
        if abs(angulo) < 45:
            angulos.append(angulo)
 
    if not angulos:
        return 0.0
 
    return float(np.median(angulos))
 
 
def corregir_inclinacion(imagen_gris):
    """Endereza la imagen rotando según el ángulo detectado."""
    angulo = detectar_angulo_skew(imagen_gris)
    if abs(angulo) < 0.3:
        return imagen_gris, angulo
 
    h, w = imagen_gris.shape[:2]
    centro = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(centro, angulo, 1.0)
    rotada = cv2.warpAffine(imagen_gris, M, (w, h),
                            flags=cv2.INTER_CUBIC,
                            borderMode=cv2.BORDER_REPLICATE)
    return rotada, angulo
 
 
def evaluar_calidad(imagen_gris):
    """
    Devuelve un score de 0 a 1 sobre la calidad de la imagen.
    """
    laplacian = cv2.Laplacian(imagen_gris, cv2.CV_64F).var()
    blur_score = min(1.0, laplacian / 500.0)
 
    contraste = imagen_gris.std() / 64.0
    contraste_score = min(1.0, contraste)
 
    brillo_medio = imagen_gris.mean()
    brillo_score = 1.0 - abs(brillo_medio - 127) / 127.0
 
    return round((blur_score * 0.5 + contraste_score * 0.3 + brillo_score * 0.2), 2)
 
 
def reparar_manchas(imagen_gris):
    """
    Aplica inpainting ligero sobre regiones muy oscuras (manchas de tinta, rasgaduras).
    Solo se aplica si hay regiones significativamente oscuras fuera del texto normal.
    """
    # Detectar manchas muy oscuras (menores que umbral bajo)
    _, mask_manchas = cv2.threshold(imagen_gris, 30, 255, cv2.THRESH_BINARY_INV)
    # Erosionar para no afectar texto normal (letras también son oscuras)
    kernel_erode = np.ones((5, 5), np.uint8)
    mask_manchas = cv2.erode(mask_manchas, kernel_erode, iterations=1)
    # Solo inpaint si hay manchas detectadas
    if cv2.countNonZero(mask_manchas) > 100:
        try:
            reparada = cv2.inpaint(imagen_gris, mask_manchas, inpaintRadius=3,
                                   flags=cv2.INPAINT_TELEA)
            return reparada
        except Exception:
            pass
    return imagen_gris
 
 
def binarizar_multi_umbral(imagen_gris):
    """
    Intenta binarizar con varios métodos y elige el resultado con mejor calidad.
    Útil para actas con iluminación irregular o manchas.
    """
    candidatos = []
 
    # Método 1: Otsu
    _, bin_otsu = cv2.threshold(imagen_gris, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidatos.append(('otsu', bin_otsu))
 
    # Método 2: Umbral adaptativo (mejor para iluminación irregular)
    try:
        bin_adapt = cv2.adaptiveThreshold(
            imagen_gris, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31, C=10
        )
        candidatos.append(('adaptativo', bin_adapt))
    except Exception:
        pass
 
    # Método 3: Otsu con suavizado previo (reduce ruido de rasgaduras)
    blur_prev = cv2.GaussianBlur(imagen_gris, (3, 3), 0)
    _, bin_otsu_blur = cv2.threshold(blur_prev, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidatos.append(('otsu_blur', bin_otsu_blur))
 
    # Elegir el que tenga mejor calidad (mayor varianza de Laplaciano — más nitidez)
    mejor_nombre, mejor_img = 'otsu', bin_otsu
    mejor_score = evaluar_calidad(bin_otsu)
 
    for nombre, img in candidatos[1:]:
        score = evaluar_calidad(img)
        if score > mejor_score:
            mejor_score = score
            mejor_nombre, mejor_img = nombre, img
 
    return mejor_img, mejor_nombre
 
 
def preprocesar_imagen(imagen_raw, devolver_pasos=False):
    """
    Pipeline completo. Si devolver_pasos=True devuelve dict con cada etapa.
 
    Retorna:
      - imagen procesada lista para OCR
      - O (imagen, dict_metadata) si devolver_pasos=True
    """
    if not OPENCV_OK:
        if devolver_pasos:
            return imagen_raw, {'error': 'opencv_no_disponible', 'pasos': []}
        return imagen_raw
 
    inicio = time.time()
    pasos = []
 
    try:
        # 1. Escala de grises
        if len(imagen_raw.shape) == 3:
            img = cv2.cvtColor(imagen_raw, cv2.COLOR_BGR2GRAY)
        else:
            img = imagen_raw.copy()
        pasos.append({'etapa': 'gris', 'shape': img.shape})
 
        # 2. Evaluar calidad inicial
        calidad_inicial = evaluar_calidad(img)
        pasos.append({'etapa': 'calidad_inicial', 'score': calidad_inicial})
 
        # 3. Upscale si la imagen es pequeña — más agresivo que antes (800→1400)
        h, w = img.shape
        if w < 1400:
            factor = 1400 / w
            img = cv2.resize(img, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)
            pasos.append({'etapa': 'upscale', 'factor': round(factor, 2), 'nuevo_shape': img.shape})
 
        # 4. Reparar manchas (inpainting sobre regiones muy oscuras)
        img = reparar_manchas(img)
        pasos.append({'etapa': 'reparar_manchas'})
 
        # 5. Deskew (corrección de inclinación — ahora tolera ±45°)
        img, angulo = corregir_inclinacion(img)
        pasos.append({'etapa': 'deskew', 'angulo_corregido': round(angulo, 2)})
 
        # 6. Denoise más agresivo para actas dañadas (h=15 en lugar de h=10)
        img = cv2.fastNlMeansDenoising(img, h=15, templateWindowSize=7, searchWindowSize=21)
        pasos.append({'etapa': 'denoise_nlm', 'h': 15})
 
        # 7. CLAHE más agresivo para papeletas con manchas (clipLimit 3→4)
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        img = clahe.apply(img)
        pasos.append({'etapa': 'clahe', 'clipLimit': 4.0})
 
        # 8. Sharpen unsharp mask
        gauss = cv2.GaussianBlur(img, (0, 0), sigmaX=2.0)
        img = cv2.addWeighted(img, 1.5, gauss, -0.5, 0)
        pasos.append({'etapa': 'unsharp_mask', 'amount': 0.5})
 
        # 9. Binarización multi-umbral (elige el mejor entre Otsu, adaptativo, Otsu+blur)
        img_bin, metodo_bin = binarizar_multi_umbral(img)
        pasos.append({'etapa': 'binarizacion', 'metodo': metodo_bin})
 
        # 10. Verificar que no quedó invertido (texto blanco sobre negro)
        if img_bin.mean() < 127:
            img_bin = cv2.bitwise_not(img_bin)
            pasos.append({'etapa': 'invert', 'reason': 'texto_blanco_sobre_negro'})
 
        # 11. Morfología con kernel 2x2 — limpia ruido de rasgaduras mejor que 1x1
        kernel = np.ones((2, 2), np.uint8)
        img_bin = cv2.morphologyEx(img_bin, cv2.MORPH_CLOSE, kernel)
        pasos.append({'etapa': 'morfologia_close', 'kernel': '2x2'})
 
        # 12. Dilatación muy suave para reconectar trazos cortados por rasgaduras
        kernel_dil = np.ones((1, 2), np.uint8)  # solo horizontal, no engrosa verticalmente
        img_bin = cv2.dilate(img_bin, kernel_dil, iterations=1)
        pasos.append({'etapa': 'dilate_suave', 'kernel': '1x2'})
 
        # 13. Calidad final
        calidad_final = evaluar_calidad(img_bin)
        pasos.append({'etapa': 'calidad_final', 'score': calidad_final})
 
        elapsed_ms = int((time.time() - inicio) * 1000)
        meta = {
            'pasos': pasos,
            'angulo_skew_corregido': round(angulo, 2),
            'calidad_inicial': calidad_inicial,
            'calidad_final': calidad_final,
            'tiempo_ms': elapsed_ms,
        }
 
        if devolver_pasos:
            return img_bin, meta
        return img_bin
 
    except Exception as e:
        print(f"[preprocesar] error: {e}")
        if devolver_pasos:
            return imagen_raw, {'error': str(e), 'pasos': pasos}
        return imagen_raw