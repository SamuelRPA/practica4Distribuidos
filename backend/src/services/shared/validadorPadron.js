// Validador contra el padrón maestro (Postgres mesas_electorales).
// Verifica que el acta corresponda a una mesa real del padrón:
//   - La mesa existe
//   - El id_recinto inferido del codigo_mesa coincide con el padrón
//   - El campo "habilitados" del acta coincide con cantidad_habilitada del padrón
//
// Retorna un dict de hallazgos. NO bloquea — sólo reporta.
// Es el rrvService quien decide si penaliza la confianza o cambia el estado.

import { oficialRepo } from '../../repositories/oficialRepository.js';

/**
 * Convención del codigo_mesa (11 dígitos):
 *   AABCC RRR NNN — los primeros 8 son id_recinto, los últimos 3 son secuencia.
 * Esto permite inferir el recinto sin pedirlo aparte.
 */
function inferirRecintoDesdeCodigoMesa(codigoMesa) {
    const s = String(codigoMesa);
    if (s.length < 8) return null;
    return parseInt(s.slice(0, 8), 10);
}

export const validadorPadron = {
    /**
     * @param {object} datos { codigo_mesa, habilitados? }
     * @returns {Promise<{
     *    en_padron: boolean,
     *    info_padron: object|null,
     *    hallazgos: string[],          // códigos de cada hallazgo
     *    detalle: object,
     *    severidad: 'OK'|'ADVERTENCIA'|'CRITICO',
     * }>}
     */
    async validar(datos) {
        const codigoMesa = Number(datos.codigo_mesa);
        const hallazgos = [];
        const detalle = { codigo_mesa: codigoMesa };

        if (!codigoMesa || isNaN(codigoMesa)) {
            return {
                en_padron: false,
                info_padron: null,
                hallazgos: ['CODIGO_MESA_INVALIDO'],
                detalle: { codigo_mesa: codigoMesa },
                severidad: 'CRITICO',
            };
        }

        // 1. ¿Existe la mesa?
        let info = null;
        try {
            info = await oficialRepo.padronInfo(codigoMesa);
        } catch (err) {
            hallazgos.push('PADRON_INACCESIBLE');
            detalle.error_db = err.message;
            return { en_padron: false, info_padron: null, hallazgos, detalle, severidad: 'ADVERTENCIA' };
        }

        if (!info) {
            hallazgos.push('MESA_INEXISTENTE_EN_PADRON');
            detalle.codigo_mesa_buscado = codigoMesa;

            // ¿El recinto inferido sí existe pero la mesa no?
            const recintoInferido = inferirRecintoDesdeCodigoMesa(codigoMesa);
            if (recintoInferido) {
                detalle.recinto_inferido = recintoInferido;
                try {
                    const recintoOk = await oficialRepo.existeRecinto(recintoInferido);
                    if (recintoOk) {
                        hallazgos.push('RECINTO_VALIDO_MESA_INVALIDA');
                        detalle.observacion = 'El recinto sí existe pero la mesa con ese código no le corresponde';
                    } else {
                        hallazgos.push('RECINTO_INEXISTENTE');
                    }
                } catch { /* DB temporalmente no disponible */ }
            }

            return {
                en_padron: false,
                info_padron: null,
                hallazgos,
                detalle,
                severidad: 'CRITICO',
            };
        }

        // 2. Mesa existe — comparar con datos enviados
        detalle.recinto_padron = {
            id_recinto: info.id_recinto,
            nombre: info.recinto_nombre,
            departamento: info.departamento,
            municipio: info.municipio,
        };
        detalle.habilitados_padron = info.cantidad_habilitada;

        // 3. id_recinto inferido vs id_recinto del padrón
        const recintoInferido = inferirRecintoDesdeCodigoMesa(codigoMesa);
        if (recintoInferido && recintoInferido !== info.id_recinto) {
            hallazgos.push('RECINTO_INFERIDO_NO_COINCIDE');
            detalle.recinto_inferido = recintoInferido;
            detalle.recinto_real = info.id_recinto;
        }

        // 4. Habilitados del acta vs padrón (R3 del ADR)
        if (datos.habilitados != null) {
            const habilitadosActa = Number(datos.habilitados);
            if (habilitadosActa !== info.cantidad_habilitada) {
                hallazgos.push('HABILITADOS_NO_COINCIDE_PADRON');
                detalle.habilitados_acta = habilitadosActa;
                detalle.diferencia = Math.abs(habilitadosActa - info.cantidad_habilitada);
            }
        }

        // 5. Severidad consolidada
        let severidad = 'OK';
        if (hallazgos.includes('MESA_INEXISTENTE_EN_PADRON') ||
            hallazgos.includes('RECINTO_VALIDO_MESA_INVALIDA') ||
            hallazgos.includes('RECINTO_INEXISTENTE')) {
            severidad = 'CRITICO';
        } else if (hallazgos.length > 0) {
            severidad = 'ADVERTENCIA';
        }

        return {
            en_padron: true,
            info_padron: info,
            hallazgos,
            detalle,
            severidad,
        };
    },
};
