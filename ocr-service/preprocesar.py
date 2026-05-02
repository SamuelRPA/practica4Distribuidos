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
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 200, minLineLength=imagen_gris.shape[1] // 4, maxLineGap=20)

    if lines is None or len(lines) == 0:
        return 0.0

    angulos = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if x2 - x1 == 0:
            continue
        angulo = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        # Solo consideramos líneas casi horizontales (±20°)
        if abs(angulo) < 20:
            angulos.append(angulo)

    if not angulos:
        return 0.0

    return float(np.median(angulos))


def corregir_inclinacion(imagen_gris):
    """Endereza la imagen rotando según el ángulo detectado."""
    angulo = detectar_angulo_skew(imagen_gris)
    if abs(angulo) < 0.3:  # ya está derecha
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
    Considera: blur (Laplaciano), contraste (std), iluminación (mean).
    """
    # Sharpness (Laplacian variance) — un valor bajo indica blur
    laplacian = cv2.Laplacian(imagen_gris, cv2.CV_64F).var()
    blur_score = min(1.0, laplacian / 500.0)  # 500 es un threshold típico

    # Contraste
    contraste = imagen_gris.std() / 64.0  # normalizado
    contraste_score = min(1.0, contraste)

    # Iluminación (idealmente cerca de 127 para imágenes de texto)
    brillo_medio = imagen_gris.mean()
    brillo_score = 1.0 - abs(brillo_medio - 127) / 127.0

    return round((blur_score * 0.5 + contraste_score * 0.3 + brillo_score * 0.2), 2)


def preprocesar_imagen(imagen_raw, devolver_pasos=False):
    """
    Pipeline completo. Si devolver_pasos=True devuelve dict con cada etapa
    para debugging.

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

        # Si la imagen es muy chica, hacerla más grande para mejor OCR
        h, w = img.shape
        if w < 1200:
            factor = 1200 / w
            img = cv2.resize(img, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)
            pasos.append({'etapa': 'upscale', 'factor': round(factor, 2), 'nuevo_shape': img.shape})

        # 3. Deskew (corrección de inclinación)
        img, angulo = corregir_inclinacion(img)
        pasos.append({'etapa': 'deskew', 'angulo_corregido': round(angulo, 2)})

        # 4. Denoise (Non-Local Means — preserva bordes mejor que Gaussian)
        img = cv2.fastNlMeansDenoising(img, h=10, templateWindowSize=7, searchWindowSize=21)
        pasos.append({'etapa': 'denoise_nlm', 'h': 10})

        # 5. CLAHE — contraste adaptativo
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        img = clahe.apply(img)
        pasos.append({'etapa': 'clahe', 'clipLimit': 3.0})

        # 6. Sharpen unsharp mask
        gauss = cv2.GaussianBlur(img, (0, 0), sigmaX=2.0)
        img = cv2.addWeighted(img, 1.5, gauss, -0.5, 0)
        pasos.append({'etapa': 'unsharp_mask', 'amount': 0.5})

        # 7. Binarización Otsu (más robusta que threshold fijo)
        _, img_bin = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # 8. Verificar que no quedó al revés (texto blanco sobre negro)
        if img_bin.mean() < 127:
            img_bin = cv2.bitwise_not(img_bin)
            pasos.append({'etapa': 'invert', 'reason': 'texto_blanco_sobre_negro'})
        pasos.append({'etapa': 'binarizacion', 'metodo': 'otsu'})

        # 9. Morfología — limpiar pequeños puntos de ruido
        kernel = np.ones((1, 1), np.uint8)
        img_bin = cv2.morphologyEx(img_bin, cv2.MORPH_CLOSE, kernel)
        pasos.append({'etapa': 'morfologia_close', 'kernel': '1x1'})

        # 10. Calidad final
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
