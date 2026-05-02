"""
Validador interno del OCR — antes de devolver el resultado.
Detecta inconsistencias en los números extraídos para subir/bajar la confianza global.

Criterios:
  - VE + ausentismo == habilitados
  - p1 + p2 + p3 + p4 + blancos + nulos == VE
  - Ningún campo negativo
  - Razonabilidad: VE <= habilitados, ningún partido > VE
  - Si la mesa típica boliviana tiene <1500 habilitados, alertar si > 2000
"""


def validar_interno(datos):
    """
    Recibe el dict de datos_interpretados.
    Retorna: {
        'cuadre_total':      bool,
        'cuadre_parciales':  bool,
        'sin_negativos':     bool,
        'razonable':         bool,
        'puntaje':           float (0..1, qué tan consistente está),
        'observaciones':     [str, ...]
    }
    """
    obs = []
    puntaje = 1.0

    def num(k):
        v = datos.get(k)
        return v if isinstance(v, (int, float)) else 0

    habilitados = num('habilitados')
    ve = num('votos_emitidos')
    ausentismo = num('ausentismo')
    p1 = num('p1'); p2 = num('p2'); p3 = num('p3'); p4 = num('p4')
    blancos = num('votos_blancos')
    nulos = num('votos_nulos')

    # 1. Cuadre total
    cuadre_total = (ve + ausentismo) == habilitados
    if not cuadre_total:
        diff = abs(ve + ausentismo - habilitados)
        obs.append(f'cuadre_total_falla: diff={diff} (VE+aus={ve + ausentismo}, hab={habilitados})')
        puntaje -= 0.25

    # 2. Cuadre de parciales
    suma_parciales = p1 + p2 + p3 + p4 + blancos + nulos
    cuadre_parciales = suma_parciales == ve
    if not cuadre_parciales:
        diff = abs(suma_parciales - ve)
        obs.append(f'cuadre_parciales_falla: diff={diff} (suma={suma_parciales}, VE={ve})')
        puntaje -= 0.25

    # 3. Sin negativos
    sin_negativos = all(
        (datos.get(k) is None or datos.get(k) >= 0)
        for k in ['habilitados', 'votos_emitidos', 'ausentismo', 'p1', 'p2', 'p3', 'p4',
                  'votos_blancos', 'votos_nulos']
    )
    if not sin_negativos:
        obs.append('valores_negativos_detectados')
        puntaje -= 0.15

    # 4. Razonabilidad
    razonable = True
    if ve > habilitados and habilitados > 0:
        obs.append(f've_mayor_que_habilitados: VE={ve}, hab={habilitados}')
        razonable = False
        puntaje -= 0.15

    for partido, val in [('p1', p1), ('p2', p2), ('p3', p3), ('p4', p4)]:
        if val > ve and ve > 0:
            obs.append(f'{partido}_supera_total_emitidos')
            razonable = False
            puntaje -= 0.05

    # 5. Tamaño típico de mesa boliviana
    if habilitados > 0 and habilitados > 2000:
        obs.append(f'habilitados_anormalmente_alto: {habilitados}')
        puntaje -= 0.05

    if habilitados > 0 and habilitados < 30:
        obs.append(f'habilitados_anormalmente_bajo: {habilitados}')
        puntaje -= 0.05

    return {
        'cuadre_total': cuadre_total,
        'cuadre_parciales': cuadre_parciales,
        'sin_negativos': sin_negativos,
        'razonable': razonable,
        'puntaje': max(0.0, round(puntaje, 2)),
        'observaciones': obs,
    }
