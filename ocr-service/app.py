import base64
import os
import time

from flask import Flask, jsonify, request

from extraer import ocr_pdf
from padron_lookup import cargar_padron

app = Flask(__name__)

# Cargar el CSV de transcripciones al iniciar el servicio
_n_mesas = cargar_padron()
print(f'[ocr-service] Padrón cargado: {_n_mesas} mesas de referencia.')


@app.get('/health')
def health():
    from padron_lookup import disponible, _PADRON
    return jsonify({
        'status': 'ok',
        'mock_mode': os.environ.get('OCR_MOCK') == '1',
        'service': 'ocr-service',
        'version': '3.0',
        'padron_disponible': disponible(),
        'padron_mesas': len(_PADRON),
    })


@app.post('/ocr')
def ocr():
    payload = request.get_json(silent=True) or {}
    pdf_b64 = payload.get('pdf_b64')
    codigo_mesa = payload.get('codigo_mesa')

    if not pdf_b64:
        return jsonify({'error': 'pdf_b64 requerido'}), 400

    try:
        pdf_bytes = base64.b64decode(pdf_b64)
    except Exception as e:
        return jsonify({'error': f'pdf_b64 inválido: {e}'}), 400

    print(f'\n[ocr-service] ━━━━ INICIO procesamiento mesa={codigo_mesa} '
          f'({len(pdf_bytes)} bytes) ━━━━')
    t0 = time.time()

    resultado = ocr_pdf(pdf_bytes, codigo_mesa=codigo_mesa)

    elapsed = int((time.time() - t0) * 1000)
    meta = resultado.get('meta', {})

    print(f"[ocr-service] {meta.get('resumen', 'sin resumen')}")
    if meta.get('validacion_interna'):
        v = meta['validacion_interna']
        print(f"[ocr-service]   cuadre_total={v['cuadre_total']} cuadre_parciales={v['cuadre_parciales']} "
              f"puntaje={v['puntaje']}")
        for obs in v.get('observaciones', []):
            print(f"[ocr-service]     ⚠ {obs}")

    print(f"[ocr-service] ━━━━ FIN ({elapsed}ms) ━━━━\n")

    return jsonify(resultado)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'[ocr-service] arrancando en :{port} (mock={os.environ.get("OCR_MOCK") == "1"})')
    app.run(host='0.0.0.0', port=port)
