// Normalización de caracteres OCR — refleja la sección 3.5 del ADR.
// Los PDFs de actas vienen con fuentes atípicas. Antes de validar números, los
// reemplazamos por el dígito más probable y reportamos confianza.

export const MAPA_CARACTERES = {
    // 0
    'O': '0', 'o': '0', 'Ø': '0', 'ø': '0', 'θ': '0', 'Θ': '0', 'Q': '0', 'D': '0',
    // 1
    'I': '1', 'l': '1', 'i': '1', '|': '1', '!': '1',
    // 2
    'Z': '2', 'z': '2',
    // 3
    'E': '3',
    // 4
    'A': '4',
    // 5
    'S': '5', 's': '5',
    // 6
    'G': '6', 'b': '6',
    // 7
    '⌐': '7', 'T': '7',
    // 8
    'B': '8',
    // 9
    'g': '9', 'q': '9',
};

/**
 * Normaliza un campo numérico OCR.
 * @returns {{valor: number|null, confianza: number, raw: string}}
 */
export function normalizarCampoNumerico(textoCrudo) {
    if (textoCrudo == null) return { valor: null, confianza: 0.0, raw: '' };
    const raw = String(textoCrudo).trim();
    if (!raw) return { valor: null, confianza: 0.0, raw };

    let resultado = '';
    let sustituciones = 0;
    let irreconocibles = 0;

    for (const ch of raw) {
        if (/\d/.test(ch)) {
            resultado += ch;
        } else if (MAPA_CARACTERES[ch] !== undefined) {
            resultado += MAPA_CARACTERES[ch];
            sustituciones += 1;
        } else if (ch === ' ' || ch === '.' || ch === ',') {
            // Separadores visuales, ignoramos
        } else {
            irreconocibles += 1;
        }
    }

    if (!resultado) return { valor: null, confianza: 0.0, raw };

    const valor = parseInt(resultado, 10);
    const penalizacion = sustituciones * 0.1 + irreconocibles * 0.2;
    const confianza = Math.max(0.0, 1.0 - penalizacion);

    return { valor, confianza: Math.round(confianza * 100) / 100, raw };
}

export function confianzaGlobal(camposConfianza) {
    const valores = Object.values(camposConfianza).filter((v) => typeof v === 'number');
    if (valores.length === 0) return 0;
    const sum = valores.reduce((a, b) => a + b, 0);
    return Math.round((sum / valores.length) * 100) / 100;
}
