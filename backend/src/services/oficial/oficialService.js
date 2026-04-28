// Lógica del cómputo oficial.
// 1) Inserción de un acta única (CSV / form) — valida + clasifica.
// 2) Validación cruzada de 3 operadores (mayoría 2/3 o cuarentena).
// 3) Cuarentena de duplicados.
// 4) Comparación cruzada con RRV.
import { rrvRepo } from '../../repositories/rrvRepository.js';
import { oficialRepo } from '../../repositories/oficialRepository.js';
import { validarActa } from '../shared/validadores.js';

const CAMPOS_CONSENSO = ['votos_emitidos','ausentismo','p1','p2','p3','p4','votos_blancos','votos_nulos', 'apertura_hora', 'apertura_minutos', 'cierre_hora', 'cierre_minutos'];

export const oficialService = {
    /**
     * Procesa un acta oficial individual (vía CSV o formulario web).
     * @param {object} input
     *   { codigo_mesa, votos_emitidos, ausentismo, p1..p4, votos_blancos, votos_nulos,
     *     fuente: 'CSV'|'MANUAL'|'N8N', creado_por }
     */
    async procesarActaSimple(input) {
        const codigoMesa = Number(input.codigo_mesa);
        if (!codigoMesa) {
            return { status: 'RECHAZADA', motivo: 'codigo_mesa_requerido' };
        }

        // Validación de existencia
        const mesa = await oficialRepo.existeMesa(codigoMesa);
        if (!mesa) {
            await oficialRepo.logError({
                tipo_error: 'MESA_INEXISTENTE',
                codigo_mesa: codigoMesa,
                detalle: `codigo_mesa ${codigoMesa} no existe en padrón`,
                datos_entrada: input,
            });
            return { status: 'RECHAZADA', motivo: 'MESA_INEXISTENTE' };
        }

        // Validaciones aritméticas modo OFICIAL (bloqueantes)
        const actaConHabilitados = { ...input, habilitados: mesa.cantidad_habilitada };
        const validacion = validarActa(actaConHabilitados, 'OFICIAL');

        if (!validacion.aprobada) {
            await oficialRepo.logError({
                tipo_error: 'VALIDACION_FALLIDA',
                codigo_mesa: codigoMesa,
                detalle: `Errores: ${validacion.errores.join(', ')}`,
                datos_entrada: input,
            });
            return { status: 'RECHAZADA', motivo: validacion.errores };
        }

        // Calculo de duracion en minutos
        let duracion_minutos = null;
        if (input.apertura_hora != null && input.cierre_hora != null) {
            const apertura = Number(input.apertura_hora) * 60 + Number(input.apertura_minutos || 0);
            const cierre = Number(input.cierre_hora) * 60 + Number(input.cierre_minutos || 0);
            duracion_minutos = cierre - apertura;
            // Si el cierre es al día siguiente (poco probable pero posible)
            if (duracion_minutos < 0) duracion_minutos += 24 * 60;
        }

        // Validación de duplicados — si ya hay un acta, todas pasan a CUARENTENA
        const existentes = await oficialRepo.actasExistentesPorMesa(codigoMesa);

        if (existentes.length > 0) {
            const motivo = `DUPLICADO_DETECTADO: ${existentes.length + 1} actas para mesa ${codigoMesa}`;

            for (const e of existentes) {
                await oficialRepo.actualizarEstado(e.id, 'EN_CUARENTENA', motivo, input.creado_por || 'sistema');
            }

            const id = await oficialRepo.insertarActa({
                codigo_mesa: codigoMesa,
                habilitados: mesa.cantidad_habilitada,
                ...pick(actaConHabilitados, CAMPOS_CONSENSO),
                duracion_minutos,
                estado: 'EN_CUARENTENA',
                motivo_estado: motivo,
                fuente: input.fuente || 'CSV',
                creado_por: input.creado_por || 'sistema',
            });

            await oficialRepo.logError({
                tipo_error: 'CUARENTENA_DUPLICADO',
                codigo_mesa: codigoMesa,
                detalle: motivo,
                datos_entrada: input,
            });

            return { status: 'EN_CUARENTENA', acta_id: id, motivo };
        }

        // Comparación cruzada con RRV (no bloquea)
        let discrepanciaRrv = null;
        try {
            const actaRrv = await rrvRepo.actaPorMesa(codigoMesa);
            if (actaRrv) {
                const diffs = {};
                for (const campo of CAMPOS_CONSENSO) {
                    const valOf = actaConHabilitados[campo];
                    const valRrv = actaRrv.datos_interpretados?.[campo];
                    if (valOf !== valRrv && valRrv != null) {
                        diffs[campo] = { oficial: valOf, rrv: valRrv };
                    }
                }
                if (Object.keys(diffs).length > 0) discrepanciaRrv = diffs;
            }
        } catch (err) {
            // RRV indisponible no debe bloquear el cómputo oficial
            console.warn('[oficial] RRV indisponible para cross-check:', err.message);
        }

        const id = await oficialRepo.insertarActa({
            codigo_mesa: codigoMesa,
            habilitados: mesa.cantidad_habilitada,
            ...pick(actaConHabilitados, CAMPOS_CONSENSO),
            duracion_minutos,
            estado: 'APROBADA',
            discrepancia_rrv: discrepanciaRrv ? JSON.stringify(discrepanciaRrv) : null,
            fuente: input.fuente || 'CSV',
            creado_por: input.creado_por || 'sistema',
        });

        return { status: 'APROBADA', acta_id: id, discrepancia_rrv: discrepanciaRrv };
    },

    /**
     * Inserta una transcripción de un operador (MT1/MT2/MT3 o N8N 101/102/103).
     * Si ya hay 3, dispara la validación cruzada.
     */
    async insertarTranscripcion(sessionId, codigoMesa, operadorId, datos) {
        await oficialRepo.insertarTranscripcion(sessionId, codigoMesa, operadorId, datos);

        const todas = await oficialRepo.transcripcionesDeSesion(sessionId);
        if (todas.length < 3) {
            return { status: 'ESPERANDO_OPERADORES', recibidos: todas.length };
        }

        return await this.validarCruzado3Operadores(sessionId, todas);
    },

    async validarCruzado3Operadores(sessionId, transcripciones) {
        const [mt1, mt2, mt3] = transcripciones;
        const codigoMesa = Number(mt1.codigo_mesa);
        const mesa = await oficialRepo.existeMesa(codigoMesa);

        const consenso = {};
        const discrepancias = {};
        const cuarentenaCampos = [];

        for (const campo of CAMPOS_CONSENSO) {
            const valores = [mt1[campo], mt2[campo], mt3[campo]];
            const [v1, v2, v3] = valores;

            if (v1 === v2 && v2 === v3) {
                consenso[campo] = v1;
            } else if (v1 === v2 || v1 === v3 || v2 === v3) {
                const mayoria = (v1 === v2 || v1 === v3) ? v1 : v2;
                consenso[campo] = mayoria;
                const discordante = valores
                    .map((v, idx) => (v !== mayoria ? { operador: ['MT1','MT2','MT3'][idx], valor: v } : null))
                    .filter(Boolean);
                discrepancias[campo] = { consenso: mayoria, discordante, resolucion: 'MAYORIA_2_DE_3' };
            } else {
                discrepancias[campo] = { mt1: v1, mt2: v2, mt3: v3, resolucion: 'CUARENTENA_TOTAL_DESACUERDO' };
                consenso[campo] = null;
                cuarentenaCampos.push(campo);
            }
        }

        const estado = cuarentenaCampos.length > 0 ? 'EN_CUARENTENA' : 'APROBADA';

        let duracion_minutos = null;
        if (consenso.apertura_hora != null && consenso.cierre_hora != null) {
            const apertura = Number(consenso.apertura_hora) * 60 + Number(consenso.apertura_minutos || 0);
            const cierre = Number(consenso.cierre_hora) * 60 + Number(consenso.cierre_minutos || 0);
            duracion_minutos = cierre - apertura;
            if (duracion_minutos < 0) duracion_minutos += 24 * 60;
        }

        const id = await oficialRepo.insertarActa({
            codigo_mesa: codigoMesa,
            session_id: sessionId,
            habilitados: mesa.cantidad_habilitada,
            ...consenso,
            duracion_minutos,
            estado,
            motivo_estado: cuarentenaCampos.length > 0
                ? `Campos sin resolver: ${cuarentenaCampos.join(', ')}`
                : null,
            discrepancias_3way: Object.keys(discrepancias).length > 0
                ? JSON.stringify(discrepancias) : null,
            fuente: 'MANUAL',
            creado_por: 'validacion_cruzada',
        });

        await oficialRepo.cerrarSesion(sessionId, estado === 'APROBADA' ? 'RESUELTA' : 'EN_CUARENTENA');

        return { status: estado, acta_id: id, discrepancias, cuarentena_campos: cuarentenaCampos };
    },
};

function pick(obj, claves) {
    const r = {};
    for (const k of claves) r[k] = obj[k];
    return r;
}
