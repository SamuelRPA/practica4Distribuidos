"""
Normalización de caracteres OCR.
Espejo del módulo Node.js — mantener sincronizados los mapas.
 
v2.1 — Reglas más tolerantes para actas dañadas/rotas:
  - Separado el mapa en "alta confianza" vs "baja confianza"
  - Los caracteres ambiguos (D→0, B→8, T→7) solo se sustituyen si están
    en contexto claramente numérico, no en etiquetas de texto
  - Se acepta guión, asterisco y tilde como ruido descartable
  - Confianza penalizada menos agresivamente
"""
 
# Sustituciones de ALTA confianza (forma visualmente muy similar al dígito)
MAPA_ALTA_CONFIANZA = {
    'O': '0', 'o': '0', 'Ø': '0', 'ø': '0', 'θ': '0', 'Θ': '0',
    'I': '1', 'l': '1', '|': '1', '!': '1',
    'Z': '2', 'z': '2',
    'S': '5', 's': '5',
    'G': '6',
    'g': '9', 'q': '9',
}
 
# Sustituciones de BAJA confianza (solo válidas en contexto claramente numérico)
MAPA_BAJA_CONFIANZA = {
    'Q': '0',
    'i': '1',
    'E': '3',
    'A': '4',
    'b': '6',
    'B': '8',
    'D': '0',
    'T': '7',
    '⌐': '7',
}
 
# Caracteres que se descartan silenciosamente (ruido de papeleta dañada)
RUIDO_DESCARTABLE = set(' .,;:_-–—*~´`^°#@$/\\()[]{}<>"\'+=%&')
 
 
def normalizar_campo_numerico(texto_crudo, contexto_estricto=False):
    """
    Retorna (valor:int|None, confianza:float, raw:str)
 
    contexto_estricto=True  → solo aplica MAPA_ALTA_CONFIANZA.
    contexto_estricto=False → aplica ambos mapas (actas dañadas con mucho ruido).
    """
    if texto_crudo is None:
        return None, 0.0, ""
    raw = str(texto_crudo).strip()
    if not raw:
        return None, 0.0, raw
 
    resultado = ""
    sust_alta = 0
    sust_baja = 0
    irreconocibles = 0
 
    for ch in raw:
        if ch.isdigit():
            resultado += ch
        elif ch in MAPA_ALTA_CONFIANZA:
            resultado += MAPA_ALTA_CONFIANZA[ch]
            sust_alta += 1
        elif not contexto_estricto and ch in MAPA_BAJA_CONFIANZA:
            resultado += MAPA_BAJA_CONFIANZA[ch]
            sust_baja += 1
        elif ch in RUIDO_DESCARTABLE:
            continue  # descarte silencioso — común en papeletas rotas
        else:
            irreconocibles += 1
 
    if not resultado:
        return None, 0.0, raw
 
    # Si el OCR capturó etiqueta + número juntos, tomar los últimos dígitos
    if len(resultado) > 6:
        resultado = resultado[-4:]
 
    valor = int(resultado)
 
    # Penalización más suave para actas dañadas:
    # alta confianza: -0.05 c/u | baja confianza: -0.10 | irreconocible: -0.12
    penalizacion = sust_alta * 0.05 + sust_baja * 0.10 + irreconocibles * 0.12
    confianza = max(0.0, 1.0 - penalizacion)
    return valor, round(confianza, 2), raw
 
 
def normalizar_campo_numerico_estricto(texto_crudo):
    """Alias para campos donde esperamos un número limpio (hora, mesa)."""
    return normalizar_campo_numerico(texto_crudo, contexto_estricto=True)