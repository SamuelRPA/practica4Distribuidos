"""
validador_interno.py — Validador del OCR con referencia al padrón CSV.

v3.0 — Validación en dos modos:
  • CON PADRÓN: Si el codigo_mesa tiene registro en el CSV de Transcripciones,
    usa los valores oficiales como referencia exacta. La confianza final
    es alta si los números del OCR coinciden con los del CSV.
  • SIN PADRÓN (fallback): Validación aritmética interna clásica (v2.1).
    Más tolerante para actas dañadas.

Criterios con padrón:
  - habilitados del OCR debe coincidir con CSV (tolerancia ±TOLERANCIA_PADRON)
  - votos_emitidos del OCR debe coincidir con papeletas del CSV (tolerancia ±TOLERANCIA_PADRON)
  - Cuadre parciales: p1+p2+p3+p4+blancos+nulos == VotosValidos del CSV

Criterios sin padrón (aritmética interna):
  - VE + ausentismo == habilitados (tolerancia ±TOLERANCIA_CUADRE)
  - p1+p2+p3+p4+blancos+nulos == VE (tolerancia ±TOLERANCIA_CUADRE)
"""

from padron_lookup import buscar_mesa, disponible

# Tolerancias
TOLERANCIA_CUADRE = 5    # fallback aritmético
TOLERANCIA_PADRON = 10   # diferencia permitida vs CSV (OCR puede errar ±1 dígito)


def validar_interno(datos, codigo_mesa=None):
    """
    Recibe el dict de datos_interpretados y opcionalmente el codigo_mesa.
    Retorna: {
        'cuadre_total':      bool,
        'cuadre_parciales':  bool,
        'sin_negativos':     bool,
        'razonable':         bool,
        'puntaje':           float (0..1),
        'observaciones':     [str, ...],
        'modo_validacion':   'PADRON' | 'ARITMETICO',
        'coincide_padron':   bool | None,
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

    # ──────────────────────────────────────────────────────
    # MODO A: Validación con referencia al CSV del padrón
    # ──────────────────────────────────────────────────────
    ref = buscar_mesa(codigo_mesa) if codigo_mesa else None

    if ref:
        modo = 'PADRON'
        coincide = True

        # A1. Habilitados vs CSV
        ref_hab = ref['habilitados']
        if ref_hab is not None:
            diff_hab = abs(habilitados - ref_hab)
            cuadre_total = diff_hab <= TOLERANCIA_PADRON
            if not cuadre_total:
                obs.append(f'habilitados_difiere_csv: ocr={habilitados}, csv={ref_hab}, diff={diff_hab}')
                coincide = False
                puntaje -= 0.15 if diff_hab <= 50 else 0.25
        else:
            cuadre_total = True  # sin referencia, no penalizar

        # A2. Votos emitidos vs PapeletasAnfora del CSV
        ref_ve = ref['papeletas']  # PapeletasAnfora = papeletas usadas = votos emitidos
        if ref_ve is not None:
            diff_ve = abs(ve - ref_ve)
            if diff_ve > TOLERANCIA_PADRON:
                obs.append(f'votos_emitidos_difiere_csv: ocr={ve}, csv={ref_ve}, diff={diff_ve}')
                coincide = False
                puntaje -= 0.10 if diff_ve <= 50 else 0.20

        # A3. Cuadre parciales vs VotosValidos del CSV
        ref_vv = ref['votos_validos']
        suma_parciales = p1 + p2 + p3 + p4 + blancos + nulos
        if ref_vv is not None:
            diff_parc = abs(suma_parciales - ref_vv)
            cuadre_parciales = diff_parc <= TOLERANCIA_PADRON
            if not cuadre_parciales:
                obs.append(f'parciales_difieren_csv: suma_ocr={suma_parciales}, csv_vv={ref_vv}, diff={diff_parc}')
                coincide = False
                puntaje -= 0.10 if diff_parc <= 50 else 0.18
        else:
            # Fallback: cuadre aritmético
            diff_parc_arit = abs(suma_parciales - ve)
            cuadre_parciales = diff_parc_arit <= TOLERANCIA_CUADRE
            if not cuadre_parciales:
                obs.append(f'cuadre_parciales_falla: diff={diff_parc_arit}')
                puntaje -= 0.08

        # A4. Sin negativos
        sin_negativos = all(
            (datos.get(k) is None or datos.get(k) >= 0)
            for k in ['habilitados', 'votos_emitidos', 'ausentismo',
                      'p1', 'p2', 'p3', 'p4', 'votos_blancos', 'votos_nulos']
        )
        if not sin_negativos:
            obs.append('valores_negativos_detectados')
            puntaje -= 0.10

        # A5. Razonabilidad básica
        razonable = True
        if ve > habilitados and habilitados > 0 and (ve - habilitados) > TOLERANCIA_PADRON:
            obs.append(f've_mayor_que_habilitados: ve={ve}, hab={habilitados}')
            razonable = False
            puntaje -= 0.10

        # Bonus: si coincide perfectamente con el CSV, subir confianza
        if coincide:
            puntaje = min(1.0, puntaje + 0.05)
            obs.append('coincide_con_padron_csv')

        return {
            'cuadre_total': cuadre_total,
            'cuadre_parciales': cuadre_parciales,
            'sin_negativos': sin_negativos,
            'razonable': razonable,
            'puntaje': max(0.0, round(puntaje, 2)),
            'observaciones': obs,
            'modo_validacion': modo,
            'coincide_padron': coincide,
        }

    # ──────────────────────────────────────────────────────
    # MODO B: Validación aritmética interna (fallback v2.1)
    # ──────────────────────────────────────────────────────
    modo = 'ARITMETICO'

    # B1. Cuadre total
    diff_total = abs(ve + ausentismo - habilitados)
    cuadre_total = diff_total <= TOLERANCIA_CUADRE
    if not cuadre_total:
        obs.append(f'cuadre_total_falla: diff={diff_total}')
        puntaje -= 0.08 if diff_total <= 20 else (0.12 if diff_total <= 100 else 0.18)

    # B2. Cuadre de parciales
    suma_parciales = p1 + p2 + p3 + p4 + blancos + nulos
    diff_parc = abs(suma_parciales - ve)
    cuadre_parciales = diff_parc <= TOLERANCIA_CUADRE
    if not cuadre_parciales:
        obs.append(f'cuadre_parciales_falla: diff={diff_parc}')
        puntaje -= 0.08 if diff_parc <= 20 else (0.12 if diff_parc <= 100 else 0.18)

    # B3. Sin negativos
    sin_negativos = all(
        (datos.get(k) is None or datos.get(k) >= 0)
        for k in ['habilitados', 'votos_emitidos', 'ausentismo',
                  'p1', 'p2', 'p3', 'p4', 'votos_blancos', 'votos_nulos']
    )
    if not sin_negativos:
        obs.append('valores_negativos_detectados')
        puntaje -= 0.12

    # B4. Razonabilidad
    razonable = True
    if ve > habilitados and habilitados > 0 and (ve - habilitados) > TOLERANCIA_CUADRE:
        obs.append(f've_mayor_que_habilitados')
        razonable = False
        puntaje -= 0.12

    for partido, val in [('p1', p1), ('p2', p2), ('p3', p3), ('p4', p4)]:
        if val > ve and ve > 0 and (val - ve) > TOLERANCIA_CUADRE:
            obs.append(f'{partido}_supera_total_emitidos')
            razonable = False
            puntaje -= 0.05

    # B5. Tamaño típico
    if habilitados > 3000:
        obs.append(f'habilitados_alto: {habilitados}')
        puntaje -= 0.03
    if 0 < habilitados < 10:
        obs.append(f'habilitados_bajo: {habilitados}')
        puntaje -= 0.03

    return {
        'cuadre_total': cuadre_total,
        'cuadre_parciales': cuadre_parciales,
        'sin_negativos': sin_negativos,
        'razonable': razonable,
        'puntaje': max(0.0, round(puntaje, 2)),
        'observaciones': obs,
        'modo_validacion': modo,
        'coincide_padron': None,
    }