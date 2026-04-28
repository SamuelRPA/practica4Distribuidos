// Lógica de ingesta del pipeline RRV.
// Maneja: clasificación de estado, duplicados (exactos y parciales), idempotencia.
import { config } from '../../config/env.js';
import { rrvRepo } from '../../repositories/rrvRepository.js';
import { hashContenidoActa } from '../shared/hash.js';
import { validarActa } from '../shared/validadores.js';
import { confianzaGlobal } from '../shared/normalizadorCaracteres.js';

const DUPLICADO_EXACTO = 'DUPLICADO_EXACTO_IGNORADO';
const DUPLICADO_PARCIAL = 'DUPLICADO_PARCIAL';

export const rrvService = {
    /**
     * Procesa una acta candidata para insertar en MongoDB RRV.
     * @param {object} input
     *   {
     *     codigo_mesa, fuente: 'PDF'|'SMS'|'MOVIL',
     *     datos_interpretados: {habilitados, votos_emitidos, ausentismo, p1..p4, votos_blancos, votos_nulos},
     *     datos_crudos_ocr?: object,
     *     confianza_por_campo?: object,
     *     hash_pdf?: string,
     *   }
     * @returns {Promise<{status: string, ingreso_id: any, estado: string, advertencias: string[]}>}
     */
    async procesar(input) {
        if (input?.codigo_mesa == null) {
            await rrvRepo.logEvento({
                tipo_error: 'OCR_IRRECUPERABLE',
                detalle: 'codigo_mesa irreconocible o ausente',
                datos_entrada: { fuente: input?.fuente, hash_pdf: input?.hash_pdf },
            });
            return { status: 'DESCARTADO', ingreso_id: null, estado: null, advertencias: ['OCR_IRRECUPERABLE'] };
        }

        const codigoMesa = Number(input.codigo_mesa);
        const datos = input.datos_interpretados || {};

        // Confianza global
        const confianza = input.confianza_por_campo
            ? confianzaGlobal(input.confianza_por_campo)
            : (input.confianza_global ?? 1.0);

        // Validaciones livianas (modo RRV → no bloquean)
        const validacion = validarActa({ ...datos, codigo_mesa: codigoMesa }, 'RRV');

        // Clasificación de estado
        let estado;
        if (confianza < config.rrv.confianzaBaja) {
            estado = 'BAJA_CONFIANZA';
        } else if (validacion.advertencias.length > 0 && confianza < config.rrv.confianzaAprobada) {
            estado = 'BAJA_CONFIANZA';
        } else if (validacion.advertencias.length > 0) {
            estado = 'DATOS_INCONSISTENTES';
        } else if (confianza >= config.rrv.confianzaAprobada) {
            estado = 'APROBADA';
        } else {
            estado = 'BAJA_CONFIANZA';
        }

        // Hash de contenido para detección de duplicados
        const hashContenido = hashContenidoActa({ codigo_mesa: codigoMesa, ...datos });

        // ¿Duplicado exacto?
        const yaExiste = await rrvRepo.existeHash(codigoMesa, hashContenido);
        if (yaExiste) {
            return {
                status: DUPLICADO_EXACTO,
                ingreso_id: yaExiste._id,
                estado: yaExiste.estado,
                advertencias: validacion.advertencias,
            };
        }

        // Duplicado parcial: misma mesa, contenido distinto
        const versionesPrevias = await rrvRepo.obtenerVersiones(codigoMesa);
        const ingresoNumero = versionesPrevias.length + 1;
        let nivelAlerta = null;

        if (versionesPrevias.length > 0) {
            estado = DUPLICADO_PARCIAL;
            nivelAlerta = versionesPrevias.length + 1 >= config.rrv.duplicadoCriticoUmbral
                ? 'CRITICO' : 'ADVERTENCIA';

            await rrvRepo.logEvento({
                tipo_error: 'DUPLICADO_PARCIAL',
                codigo_mesa: codigoMesa,
                detalle: `Acta #${ingresoNumero} con datos distintos para misma mesa`,
                nivel_alerta: nivelAlerta,
                datos_entrada: { hash_nuevo: hashContenido, total_versiones: versionesPrevias.length + 1 },
            });
        }

        // Insertar
        const ahora = new Date();
        const acta = {
            codigo_mesa: codigoMesa,
            fuente: input.fuente,
            estado,
            ingreso_numero: ingresoNumero,
            nivel_alerta: nivelAlerta,
            datos_interpretados: datos,
            datos_crudos_ocr: input.datos_crudos_ocr || null,
            confianza_por_campo: input.confianza_por_campo || null,
            confianza_global: confianza,
            hash_contenido: hashContenido,
            hash_pdf: input.hash_pdf || null,
            advertencias: validacion.advertencias,
            timestamp_recepcion: ahora,
            timestamp_procesado: ahora,
            es_version_activa: estado === 'APROBADA' && versionesPrevias.length === 0,
        };

        const ingresoId = await rrvRepo.insertarActa(acta);

        // Reelegir versión activa: la de mayor confianza queda como activa
        if (estado === 'APROBADA' || versionesPrevias.length > 0) {
            const todas = await rrvRepo.obtenerVersiones(codigoMesa);
            const mejor = todas.reduce(
                (best, cur) => (cur.confianza_global > (best?.confianza_global ?? -1) ? cur : best),
                null,
            );
            if (mejor) await rrvRepo.marcarComoActiva(codigoMesa, mejor._id);
        }

        return {
            status: 'INSERTADA',
            ingreso_id: ingresoId,
            estado,
            advertencias: validacion.advertencias,
            nivel_alerta: nivelAlerta,
        };
    },
};
