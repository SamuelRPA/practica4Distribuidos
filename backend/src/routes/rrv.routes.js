// Endpoints HTTP del pipeline RRV.
// /api/rrv/acta-pdf      — sube PDF, encola para OCR
// /api/rrv/acta-directa  — inserta acta ya parseada (modo manual o testing)
// /api/rrv/sms           — recibe SMS y lo encola
// /api/rrv/mesa/:codigo  — consulta el acta activa de una mesa

import { Router } from 'express';
import multer from 'multer';
import { config } from '../config/env.js';
import { publish } from '../config/rabbitmq.js';
import { makeLogger } from '../lib/logger.js';
import { rrvRepo } from '../repositories/rrvRepository.js';
import { rrvService } from '../services/rrv/rrvService.js';
import { parsearSms, smsAutorizado } from '../services/rrv/smsParser.js';
import { hashBuffer } from '../services/shared/hash.js';

const log = makeLogger('rrv-routes');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const rrvRouter = Router();

/**
 * Sube un PDF de acta (canal app móvil).
 * Body multipart: file + codigo_mesa (lo selecciona el operador en la app).
 * El procesamiento real se hace asincrónicamente vía RabbitMQ.
 */
rrvRouter.post('/acta-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            log.warn('Foto rechazada: archivo no presente en multipart');
            return res.status(400).json({ error: 'archivo PDF requerido' });
        }
        const codigoMesa = parseInt(req.body.codigo_mesa, 10);
        if (!codigoMesa) {
            log.warn('Foto rechazada: codigo_mesa ausente');
            return res.status(400).json({ error: 'codigo_mesa requerido' });
        }

        const hashPdf = hashBuffer(req.file.buffer);
        const sizeKb = Math.round(req.file.size / 1024);
        const userAgent = req.headers['user-agent'] || 'desconocido';

        log.photo(`Foto recibida desde móvil — mesa ${codigoMesa}`, {
            hash: hashPdf.slice(0, 16) + '...',
            size_kb: sizeKb,
            mime: req.file.mimetype,
            origen: userAgent.includes('Expo') ? 'Expo Go' : userAgent.slice(0, 40),
        });

        const ok = publish(config.rabbitmq.queues.ingesta, {
            tipo: 'PDF',
            codigo_mesa: codigoMesa,
            hash_pdf: hashPdf,
            pdf_b64: req.file.buffer.toString('base64'),
            recibido_en: new Date().toISOString(),
        }, { priority: 5 });

        if (!ok) {
            log.error('No se pudo encolar — RabbitMQ no disponible');
            return res.status(503).json({
                status: 'RABBIT_NO_DISPONIBLE',
                codigo_mesa: codigoMesa,
                hash_pdf: hashPdf,
            });
        }

        log.send(`Encolada en q_ingesta (priority=5) — esperando OCR worker`);

        res.status(202).json({
            status: 'ENCOLADO',
            codigo_mesa: codigoMesa,
            hash_pdf: hashPdf,
        });
    } catch (err) {
        log.error('Error en /acta-pdf', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Ruta de inyección directa — útil para testing y para cuando el OCR
 * ya se hizo en otro lado (n8n, app móvil con OCR local, etc.)
 */
rrvRouter.post('/acta-directa', async (req, res) => {
    log.recv(`Acta directa recibida — mesa ${req.body?.codigo_mesa}`);
    const r = await rrvService.procesar(req.body);
    if (r.status === 'INSERTADA') {
        log.success(`Acta insertada en MongoDB — estado=${r.estado}`, {
            ingreso_id: String(r.ingreso_id),
            advertencias: r.advertencias?.length || 0,
        });
    }
    res.status(r.status === 'DESCARTADO' ? 422 : 200).json(r);
});

/**
 * Recepción de SMS — sin restricciones de horario, sin límite de intentos.
 * Body: { numero_origen, texto }
 */
rrvRouter.post('/sms', async (req, res) => {
  try {
    const { numero_origen, texto } = req.body || {};

    log.sms(`SMS legacy recibido de ${numero_origen}`, {
        texto: texto?.slice(0, 80),
    });

    if (!smsAutorizado(numero_origen, config.sms.numerosAutorizados)) {
        log.warn(`Número ${numero_origen} NO autorizado — ignorado silenciosamente`);
        await rrvRepo.logEvento({
            tipo_error: 'SMS_NUMERO_NO_AUTORIZADO',
            detalle: `Número ${numero_origen} no está en la lista blanca`,
        }).catch((e) => log.error('logEvento falló', e));
        return res.status(204).end();
    }

    const { datos, faltantes, reconocidos } = parsearSms(texto || '');

    if (faltantes.length > 0) {
        log.warn(`SMS de ${numero_origen} incompleto`, { faltantes, reconocidos });
        await rrvRepo.logEvento({
            tipo_error: 'SMS_CAMPOS_FALTANTES',
            detalle: `Campos faltantes: ${faltantes.join(', ')}`,
            datos_entrada: { numero_origen, texto, reconocidos },
        });
        return res.status(422).json({
            status: 'SMS_INCOMPLETO',
            faltantes,
            mensaje: `Faltan: ${faltantes.join(', ')}. Reenvía con todos los campos.`,
        });
    }

    log.success(`SMS parseado OK — mesa ${datos.codigo_mesa}`, {
        campos_reconocidos: reconocidos,
    });

    // SMS prioridad alta — ya viene como texto, se procesa más rápido que un PDF
    publish(config.rabbitmq.queues.validacion, {
        tipo: 'SMS',
        codigo_mesa: datos.codigo_mesa,
        fuente: 'SMS',
        datos_interpretados: {
            habilitados: datos.habilitados ?? null,
            votos_emitidos: datos.votos_emitidos,
            ausentismo: datos.ausentismo,
            p1: datos.p1, p2: datos.p2, p3: datos.p3, p4: datos.p4,
            votos_blancos: datos.votos_blancos,
            votos_nulos: datos.votos_nulos,
        },
        confianza_global: 0.95,
        recibido_en: new Date().toISOString(),
    }, { priority: 10 });

    log.send(`SMS encolado en q_validacion (priority=10) — mesa ${datos.codigo_mesa}`);
    res.json({ status: 'SMS_ACEPTADO_PARA_PROCESAMIENTO', codigo_mesa: datos.codigo_mesa });
  } catch (err) {
    log.error('Error en /sms', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Consulta del acta activa de una mesa.
 */
rrvRouter.get('/mesa/:codigo', async (req, res) => {
    const codigo = parseInt(req.params.codigo, 10);
    const acta = await rrvRepo.actaPorMesa(codigo);
    if (!acta) return res.status(404).json({ error: 'sin acta APROBADA para esta mesa' });
    res.json(acta);
});

/**
 * Resumen RRV para el dashboard.
 */
rrvRouter.get('/resumen', async (_req, res) => {
    const [estados, totales, ingestaHora] = await Promise.all([
        rrvRepo.resumenEstados(),
        rrvRepo.totalesPorPartido(),
        rrvRepo.ingresoPorHora(),
    ]);
    res.json({ estados, totales: totales[0] || {}, ingestaPorHora: ingestaHora });
});

/**
 * Listar actas RRV con filtros.
 * GET /api/rrv/actas?limit=&estado=&origen=&mesa=&soloActivas=
 */
rrvRouter.get('/actas', async (req, res, next) => {
    try {
        const { limit, estado, origen, mesa, soloActivas } = req.query;
        const actas = await rrvRepo.listarActas({
            limit: limit ? parseInt(limit, 10) : 200,
            estado: estado || undefined,
            origen: origen || undefined,
            mesa: mesa ? parseInt(mesa, 10) : undefined,
            soloActivas: soloActivas === 'true',
        });
        res.json(actas);
    } catch (err) { next(err); }
});

/**
 * Cambiar estado de un acta RRV (aprobar / rechazar / observar).
 * PATCH /api/rrv/acta/:id/estado
 * Body: { estado, motivo?, modificado_por? }
 */
rrvRouter.patch('/acta/:id/estado', async (req, res, next) => {
    try {
        const { estado, motivo, modificado_por } = req.body || {};
        const validos = ['APROBADA', 'EN_VERIFICACION', 'EN_OBSERVACION', 'RECHAZADA'];
        if (!validos.includes(estado)) {
            return res.status(400).json({ error: `estado debe ser: ${validos.join(', ')}` });
        }
        const r = await rrvRepo.cambiarEstadoActa(req.params.id, estado, motivo, modificado_por);
        if (!r) return res.status(404).json({ error: 'acta RRV no encontrada' });
        res.json({ status: 'OK', ...r });
    } catch (err) { next(err); }
});

/**
 * Eliminar (borrar físicamente) un acta RRV.
 * DELETE /api/rrv/acta/:id
 */
rrvRouter.delete('/acta/:id', async (req, res, next) => {
    try {
        const db = (await import('../config/mongo.js')).getMongo();
        const { ObjectId } = await import('mongodb');
        const _id = new ObjectId(req.params.id);
        const r = await db.collection('actas_rrv').findOneAndDelete({ _id });
        if (!r) return res.status(404).json({ error: 'acta RRV no encontrada' });
        res.json({ status: 'ELIMINADA', id: req.params.id });
    } catch (err) { next(err); }
});

/**
 * Eventos / log de auditoría RRV.
 */
rrvRouter.get('/eventos', async (req, res, next) => {
    try {
        const { limit, tipo } = req.query;
        const evs = await rrvRepo.eventosRecientes(limit ? parseInt(limit, 10) : 100, tipo);
        res.json(evs);
    } catch (err) { next(err); }
});

/**
 * Resumen agrupado por origen (fuente).
 */
rrvRouter.get('/por-origen', async (_req, res, next) => {
    try {
        const data = await rrvRepo.resumenPorOrigen();
        res.json(data);
    } catch (err) { next(err); }
});


