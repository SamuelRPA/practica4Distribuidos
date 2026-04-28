import base64
import os

from flask import Flask, jsonify, request

from extraer import ocr_pdf

app = Flask(__name__)


@app.get('/health')
def health():
    return jsonify({'status': 'ok', 'mock_mode': os.environ.get('OCR_MOCK') == '1'})


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

    resultado = ocr_pdf(pdf_bytes, codigo_mesa=codigo_mesa)
    return jsonify(resultado)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
