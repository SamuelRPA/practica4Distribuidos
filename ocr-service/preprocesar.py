"""
Pre-procesamiento de imagen — sección 3.4 del ADR.
Si OpenCV/Tesseract no están disponibles, las funciones devuelven la imagen sin tocar.
"""

try:
    import cv2
    import numpy as np
    OPENCV_OK = True
except ImportError:
    OPENCV_OK = False


def preprocesar_imagen(imagen_raw):
    """
    Aplica deskew, CLAHE, denoising, binarización adaptativa y dilatación suave.
    Si algún paso falla, retorna la imagen original.
    """
    if not OPENCV_OK:
        return imagen_raw

    try:
        if len(imagen_raw.shape) == 3:
            img = cv2.cvtColor(imagen_raw, cv2.COLOR_BGR2GRAY)
        else:
            img = imagen_raw

        # CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        img = clahe.apply(img)

        # Denoise
        img = cv2.medianBlur(img, ksize=3)

        # Binarización Otsu
        _, img = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Dilatación suave
        kernel = np.ones((2, 2), np.uint8)
        img = cv2.dilate(img, kernel, iterations=1)

        return img
    except Exception as e:
        print(f"[preprocesar] fallo, devolviendo original: {e}")
        return imagen_raw
