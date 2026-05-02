// Lógica de ingesta del pipeline RRV.
// Maneja: clasificación de estado, validación contra padrón Postgres,
// detección de duplicados (exacto + parcial + temporal), idempotencia.
import { config } from '../../config/env.js';
import { makeLogger } from '../../lib/logger.js';
import { rrvRepo } from '../../repositories/rrvRepository.js';
import { hashContenidoActa } from '../shared/hash.js';
import { confianzaGlobal } from '../shared/normalizadorCaracteres.js';
import { validarActa } from '../shared/validadores.js';
import { validadorPadron } from '../shared/validadorPadron.js';

const log = makeLogger('rrv-service');

const DUPLICADO_EXACTO = 'DUPLICADO_EXACTO_IGNORADO';
const DUPLICADO_PARCIAL = 'DUPLICADO_PARCIAL';

// Ventana temporal: si llega otro acta de la misma mesa dentro de 30s,
// es muy probable que sea un reenvío del mismo operador.
const VENTANA_TEMPORAL_MS = 30 * 1000;

export const rrvService = {
    /**
     * Procesa una acta candidata para insertar en MongoDB RRV.
     * @param {object} input
     * @returns {Promise<{status, ingreso_id, estado, advertencias, hallazgos_padron, validacion}>}
     */
    async procesar(input) {
        const codigoMesa = Number(input?.codigo_mesa);

        // ---------- 0. Sanity check ----------
        if (!codigoMesa || isNaN(codigoMesa)) {
            log.warn('Acta descartada: codigo_mesa irreconocible');
            await rrvRepo.logEvento({
                tipo_error: 'OCR_IRRECUPERABLE',
                detalle: 'codigo_mesa irreconocible o ausente',
                datos_entrada: { fuente: input?.fuente, hash_pdf: input?.hash_pdf },
            });
            return {
                status: 'DESCARTADO',
                ingreso_id: null,
                estado: null,
                advertencias: ['OCR_IRRECUPERABLE'],
            };
        }

        const datos = input.datos_interpretados || {};
        const fuente = input.fuente || 'DESCONOCIDA';

        log.cog(`Procesando acta — mesa ${codigoMesa}, fuente=${fuente}`);

        // ---------- 1. Validación contra el padrón Postgres ----------
        const padronCheck = await validadorPadron.validar({
            codigo_mesa: codigoMesa,
            habilitados: datos.habilitados,
        });

        if (padronCheck.severidad === 'CRITICO') {
            log.warn(`Validación de padrón CRÍTICA — ${padronCheck.hallazgos.join(', ')}`, padronCheck.detalle);
        } else if (padronCheck.hallazgos.length > 0) {
            log.warn(`Validación de padrón con observaciones — ${padronCheck.hallazgos.join(', ')}`);
        } else {
            log.info(`Padrón OK — recinto "${padronCheck.info_padron?.recinto_nombre}" en ${padronCheck.info_padron?.departamento}`);
        }

        // ---------- 2. Confianza global ----------
        let confianza = input.confianza_global ?? null;
        if (confianza == null && input.confianza_por_campo) {
            confianza = confianzaGlobal(input.confianza_por_campo);
        }
        if (confianza == null) confianza = 1.0;

        // ---------- 3. Validación aritmética RRV (no bloqueante) ----------
        const validacion = validarActa({ ...datos, codigo_mesa: codigoMesa }, 'RRV');

        // ---------- 4. Penalización por hallazgos de padrón ----------
        if (padronCheck.severidad === 'CRITICO') {
            confianza = Math.max(0.0, confianza - 0.3);
        } else if (padronCheck.severidad === 'ADVERTENCIA') {
            confianza = Math.max(0.0, confianza - 0.1);
        }
        confianza = Math.round(confianza * 100) / 100;

        // ---------- 5. Clasificación de estado ----------
        let estado;
        if (padronCheck.hallazgos.includes('MESA_INEXISTENTE_EN_PADRON')) {
            estado = 'MESA_FANTASMA'; // mesa no existe en padrón
        } else if (padronCheck.hallazgos.includes('RECINTO_VALIDO_MESA_INVALIDA')) {
            estado = 'MESA_RECINTO_DISCORDANTE';
        } else if (confianza < config.rrv.confianzaBaja) {
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

        log.info(`Estado preliminar: ${estado} (confianza=${confianza}, advertencias=${validacion.advertencias.length})`);

        // ---------- 6. Hash de contenido para detección de duplicados ----------
        const hashContenido = hashContenidoActa({ codigo_mesa: codigoMesa, ...datos });

        // ---------- 7. Duplicado EXACTO (idempotencia) ----------
        const yaExiste = await rrvRepo.existeHash(codigoMesa, hashContenido);
        if (yaExiste) {
            log.warn(`Duplicado EXACTO ignorado para mesa ${codigoMesa} (idempotencia)`, {
                ingreso_id: String(yaExiste._id),
            });
            return {
                status: DUPLICADO_EXACTO,
                ingreso_id: yaExiste._id,
                estado: yaExiste.estado,
                advertencias: validacion.advertencias,
                padron: padronCheck,
            };
        }

        // ---------- 8. Análisis de duplicados parciales ----------
        const versionesPrevias = await rrvRepo.obtenerVersiones(codigoMesa);
        const ingresoNumero = versionesPrevias.length + 1;
        let nivelAlerta = null;
        let scoreDuplicado = 0;

        if (versionesPrevias.length > 0) {
            // Calcular score de duplicado parcial
            const ahora = Date.now();
            for (const prev of versionesPrevias) {
                const prevTime = new Date(prev.timestamp_recepcion).getTime();
                const dt = ahora - prevTime;

                // Reenvío sospechoso (mismo dato, llegó hace muy poco)
                if (dt < VENTANA_TEMPORAL_MS) scoreDuplicado += 2;
                else if (dt < 5 * 60 * 1000) scoreDuplicado += 1;

                // Si hay diferencias menores en pocos campos, peso bajo
                if (prev.fuente === fuente) scoreDuplicado += 0.5;
            }

            // Clasificación por score y cantidad de versiones
            if (versionesPrevias.length + 1 >= config.rrv.duplicadoCriticoUmbral) {
                nivelAlerta = 'CRITICO';
            } else if (scoreDuplicado >= 2) {
                nivelAlerta = 'CRITICO';
            } else {
                nivelAlerta = 'ADVERTENCIA';
            }

            estado = DUPLICADO_PARCIAL;

            log.warn(`Duplicado PARCIAL detectado — versión #${ingresoNumero}/${versionesPrevias.length + 1} (alerta=${nivelAlerta})`, {
                score: scoreDuplicado,
                fuentes_previas: versionesPrevias.map((v) => v.fuente),
            });

            await rrvRepo.logEvento({
                tipo_error: 'DUPLICADO_PARCIAL',
                codigo_mesa: codigoMesa,
                detalle: `Acta #${ingresoNumero} con datos distintos para misma mesa (score=${scoreDuplicado})`,
                nivel_alerta: nivelAlerta,
                datos_entrada: {
                    hash_nuevo: hashContenido,
                    total_versiones: versionesPrevias.length + 1,
                    score_duplicado: scoreDuplicado,
                },
            });
        }

        // ---------- 9. Insertar acta enriquecida ----------
        const ahora = new Date();
        const acta = {
            codigo_mesa: codigoMesa,
            fuente,
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
            // Hallazgos de padrón guardados para auditoría
            padron_hallazgos: padronCheck.hallazgos,
            padron_severidad: padronCheck.severidad,
            recinto_padron: padronCheck.info_padron ? {
                id_recinto: padronCheck.info_padron.id_recinto,
                nombre: padronCheck.info_padron.recinto_nombre,
                departamento: padronCheck.info_padron.departamento,
                municipio: padronCheck.info_padron.municipio,
            } : null,
            score_duplicado: scoreDuplicado,
            // Trazabilidad del OCR
            ocr_meta: input.meta || null,
            validacion_interna_ocr: input.validacion_interna || null,
            timestamp_recepcion: ahora,
            timestamp_procesado: ahora,
            es_version_activa: estado === 'APROBADA' && versionesPrevias.length === 0,
        };

        const ingresoId = await rrvRepo.insertarActa(acta);

        log.success(`Insertada en Mongo — id=${String(ingresoId).slice(0,8)} estado=${estado}`);

        // ---------- 10. Re-elegir versión activa por mayor confianza ----------
        if (estado === 'APROBADA' || versionesPrevias.length > 0) {
            const todas = await rrvRepo.obtenerVersiones(codigoMesa);
            const aprobadas = todas.filter((v) => v.estado === 'APROBADA');
            if (aprobadas.length > 0) {
                const mejor = aprobadas.reduce(
                    (best, cur) => (cur.confianza_global > (best?.confianza_global ?? -1) ? cur : best),
                    null,
                );
                if (mejor) {
                    await rrvRepo.marcarComoActiva(codigoMesa, mejor._id);
                    log.info(`Versión activa re-elegida por mejor confianza: ${String(mejor._id).slice(0,8)} (conf=${mejor.confianza_global})`);
                }
            }
        }

        return {
            status: 'INSERTADA',
            ingreso_id: ingresoId,
            estado,
            advertencias: validacion.advertencias,
            nivel_alerta: nivelAlerta,
            padron: padronCheck,
            confianza_global: confianza,
        };
    },
};
