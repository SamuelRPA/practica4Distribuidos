// Validadores R1–R7 compartidos entre RRV y Oficial.
// La diferencia: RRV solo agrega advertencias, Oficial bloquea con errores.

/**
 * @param {object} acta
 * @param {'RRV'|'OFICIAL'} modo
 */
export function validarActa(acta, modo) {
    const errores = [];
    const advertencias = [];

    const num = (v) => (typeof v === 'number' ? v : 0);

    // R1: votos_emitidos + ausentismo = habilitados
    if (num(acta.votos_emitidos) + num(acta.ausentismo) !== num(acta.habilitados)) {
        const code = 'CUADRE_TOTAL_FAIL_R1';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    // R2: suma de partidos + blancos + nulos = votos_emitidos
    const sumaParciales =
        num(acta.p1) + num(acta.p2) + num(acta.p3) + num(acta.p4) +
        num(acta.votos_blancos) + num(acta.votos_nulos);
    if (sumaParciales !== num(acta.votos_emitidos)) {
        const code = 'CUADRE_PARCIALES_FAIL_R2';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    // R4: ningún campo numérico negativo
    const camposNumericos = ['p1','p2','p3','p4','votos_blancos','votos_nulos','votos_emitidos','ausentismo','habilitados'];
    for (const campo of camposNumericos) {
        const v = acta[campo];
        if (v != null && v < 0) {
            const code = `CAMPO_NEGATIVO_${campo.toUpperCase()}`;
            if (modo === 'OFICIAL') {
                errores.push(code);
            } else {
                advertencias.push(code);
                acta[campo] = 0;
            }
        }
    }

    // R5: votos_emitidos <= habilitados
    if (num(acta.votos_emitidos) > num(acta.habilitados)) {
        const code = 'VE_SUPERA_HABILITADOS_R5';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    // R6: habilitados > 0
    if (num(acta.habilitados) <= 0) {
        const code = 'HABILITADOS_CERO_R6';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    return {
        aprobada: errores.length === 0,
        errores,
        advertencias,
    };
}
