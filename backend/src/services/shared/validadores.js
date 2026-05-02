// Validadores R1–R7 compartidos entre RRV y Oficial.
// La diferencia: RRV solo agrega advertencias, Oficial bloquea con errores.
// v2.0 — Tolerancia de ±5 votos para actas fuente CSV/N8N (datos inmutables).

const TOLERANCIA_CSV = 5; // El CSV es verdad oficial, puede tener ±5 por redondeo/impresión

/**
 * @param {object} acta
 * @param {'RRV'|'OFICIAL'} modo
 */
export function validarActa(acta, modo) {
    const errores = [];
    const advertencias = [];

    const num = (v) => (v != null && v !== '' && !isNaN(v) ? Number(v) : 0);

    // Para actas provenientes del CSV oficial (N8N o CSV), se aplica tolerancia.
    // Estos datos son la fuente de verdad, no se rechazan por aritmética.
    const esFuenteOficial = acta.fuente === 'N8N' || acta.fuente === 'CSV';
    const tolerancia = esFuenteOficial ? TOLERANCIA_CSV : 0;

    // R1: votos_emitidos + ausentismo ≈ habilitados
    const diffR1 = Math.abs(num(acta.votos_emitidos) + num(acta.ausentismo) - num(acta.habilitados));
    if (diffR1 > tolerancia) {
        const code = 'Anulado por: Inconsistencia aritmética (Art. 177 Ley 026) - El total de votos y ausentismo no cuadra con habilitados.';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    // R2: suma de partidos + blancos + nulos ≈ votos_emitidos
    const sumaParciales =
        num(acta.p1) + num(acta.p2) + num(acta.p3) + num(acta.p4) +
        num(acta.votos_blancos) + num(acta.votos_nulos);
    const diffR2 = Math.abs(sumaParciales - num(acta.votos_emitidos));
    if (diffR2 > tolerancia) {
        const code = 'Anulado por: Inconsistencia aritmética (Art. 177 Ley 026) - La suma de votos parciales no iguala al total de votos emitidos.';
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

    // R5: votos_emitidos <= habilitados (con tolerancia)
    if (num(acta.votos_emitidos) - num(acta.habilitados) > tolerancia) {
        const code = 'Anulado por: Nulidad de Mesa (Art. 177 inciso c Ley 026) - El número de votos emitidos supera al número de inscritos en la mesa.';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    // R6: habilitados > 0
    if (num(acta.habilitados) <= 0) {
        const code = 'Anulado por: Inconsistencia en padrón (Art. 177 Ley 026) - Cantidad de habilitados es cero o menor.';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    // Validación por observación de anulado explícito
    if (acta.observaciones && acta.observaciones.toLowerCase().includes('anulado')) {
        const code = 'Anulado por: Anulación explícita registrada en observaciones del acta.';
        modo === 'OFICIAL' ? errores.push(code) : advertencias.push(code);
    }

    return {
        aprobada: errores.length === 0,
        errores,
        advertencias,
    };
}
