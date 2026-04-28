"""
Normalización de caracteres OCR.
Espejo del módulo Node.js — mantener sincronizados los mapas.
"""

MAPA_CARACTERES = {
    # 0
    'O': '0', 'o': '0', 'Ø': '0', 'ø': '0', 'θ': '0', 'Θ': '0', 'Q': '0', 'D': '0',
    # 1
    'I': '1', 'l': '1', 'i': '1', '|': '1', '!': '1',
    # 2
    'Z': '2', 'z': '2',
    # 3
    'E': '3',
    # 4
    'A': '4',
    # 5
    'S': '5', 's': '5',
    # 6
    'G': '6', 'b': '6',
    # 7
    '⌐': '7', 'T': '7',
    # 8
    'B': '8',
    # 9
    'g': '9', 'q': '9',
}


def normalizar_campo_numerico(texto_crudo):
    """
    Retorna (valor:int|None, confianza:float, raw:str)
    """
    if texto_crudo is None:
        return None, 0.0, ""
    raw = str(texto_crudo).strip()
    if not raw:
        return None, 0.0, raw

    resultado = ""
    sustituciones = 0
    irreconocibles = 0

    for ch in raw:
        if ch.isdigit():
            resultado += ch
        elif ch in MAPA_CARACTERES:
            resultado += MAPA_CARACTERES[ch]
            sustituciones += 1
        elif ch in (' ', '.', ','):
            continue
        else:
            irreconocibles += 1

    if not resultado:
        return None, 0.0, raw

    valor = int(resultado)
    penalizacion = sustituciones * 0.1 + irreconocibles * 0.2
    confianza = max(0.0, 1.0 - penalizacion)
    return valor, round(confianza, 2), raw
