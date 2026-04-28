// Parser SMS flexible — sección 3.3 del ADR.
// Acepta cualquier orden y separadores comunes. Reconoce variantes de las claves.

const ALIASES = {
    codigo_mesa:    /\b(?:mesa|m|cod_mesa)\s*[:=]\s*([0-9]+)/i,
    votos_emitidos: /\b(?:ve|emitidos|votaron)\s*[:=]\s*([0-9]+)/i,
    ausentismo:     /\b(?:vn|pnu|vnu|ausentes|ausentismo)\s*[:=]\s*([0-9]+)/i,
    p1:             /\b(?:p1|partido1)\s*[:=]\s*([0-9]+)/i,
    p2:             /\b(?:p2|partido2)\s*[:=]\s*([0-9]+)/i,
    p3:             /\b(?:p3|partido3)\s*[:=]\s*([0-9]+)/i,
    p4:             /\b(?:p4|partido4)\s*[:=]\s*([0-9]+)/i,
    votos_blancos:  /\b(?:vb|blancos?)\s*[:=]\s*([0-9]+)/i,
    votos_nulos:    /\b(?:nu|nulos?)\s*[:=]\s*([0-9]+)/i,
    observaciones:  /\b(?:obs|observacion)\s*[:=]\s*([^\n;,]+)/i,
};

const CAMPOS_NUMERICOS = ['codigo_mesa','votos_emitidos','ausentismo','p1','p2','p3','p4','votos_blancos','votos_nulos'];
const CAMPOS_VOTOS_PARTIDOS = ['p1','p2','p3','p4','votos_blancos','votos_nulos'];

/**
 * Parsea texto de SMS y devuelve los campos reconocidos + qué falta.
 * @returns {{datos: object, faltantes: string[], reconocidos: number}}
 */
export function parsearSms(texto) {
    if (!texto || typeof texto !== 'string') {
        return { datos: {}, faltantes: ['texto_vacio'], reconocidos: 0 };
    }

    const datos = {};
    let reconocidos = 0;

    for (const [campo, regex] of Object.entries(ALIASES)) {
        const m = texto.match(regex);
        if (m) {
            const valor = CAMPOS_NUMERICOS.includes(campo) ? parseInt(m[1], 10) : m[1].trim();
            datos[campo] = valor;
            reconocidos += 1;
        }
    }

    const faltantes = [];

    // codigo_mesa es crítico
    if (datos.codigo_mesa == null) faltantes.push('codigo_mesa');

    // Al menos 4 campos de votos (de los 6 de partidos/blancos/nulos)
    const camposVotosPresentes = CAMPOS_VOTOS_PARTIDOS.filter((c) => datos[c] != null).length;
    if (camposVotosPresentes < 4) {
        faltantes.push(`solo_${camposVotosPresentes}_de_6_campos_votos`);
    }

    return { datos, faltantes, reconocidos };
}

/**
 * @param {string} numeroOrigen p.ej. "+59170000001"
 * @param {string[]} listaAutorizada
 */
export function smsAutorizado(numeroOrigen, listaAutorizada) {
    if (!listaAutorizada || listaAutorizada.length === 0) return true; // dev mode
    return listaAutorizada.includes(numeroOrigen);
}
