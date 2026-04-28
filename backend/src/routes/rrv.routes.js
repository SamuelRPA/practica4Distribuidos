// Endpoints HTTP del pipeline RRV.
// /api/rrv/acta-pdf      — sube PDF, encola para OCR
// /api/rrv/acta-directa  — inserta acta ya parseada (modo manual o testing)
// /api/rrv/sms           — recibe SMS y lo encola
// /api/rrv/mesa/:codigo  — consulta el acta activa de una mesa

import { Router } from 'express';
import multer from 'multer';
import { config } from '../config/env.js';
import { publish } from '../config/rabbitmq.js';
import { rrvRepo } from '../repositories/rrvRepository.js';
import { rrvService } from '../services/rrv/rrvService.js';
import { parsearSms, smsAutorizado } from '../services/rrv/smsParser.js';
import { hashBuffer } from '../services/shared/hash.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const rrvRouter = Router();

/**
 * Sube un PDF de acta (canal app móvil).
 * Body multipart: file + codigo_mesa (lo selecciona el operador en la app).
 * El procesamiento real se hace asincrónicamente vía RabbitMQ.
 */
rrvRouter.post('/acta-pdf', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'archivo PDF requerido' });
    const codigoMesa = parseInt(req.body.codigo_mesa, 10);
    if (!codigoMesa) return res.status(400).json({ error: 'codigo_mesa requerido' });

    const hashPdf = hashBuffer(req.file.buffer);

    publish(config.rabbitmq.queues.ingesta, {
        tipo: 'PDF',
        codigo_mesa: codigoMesa,
        hash_pdf: hashPdf,
        // En producción guardarías el buffer en S3/disco; aquí lo embebemos en base64
        pdf_b64: req.file.buffer.toString('base64'),
        recibido_en: new Date().toISOString(),
    }, { priority: 5 });

    res.status(202).json({
        status: 'ENCOLADO',
        codigo_mesa: codigoMesa,
        hash_pdf: hashPdf,
    });
});

/**
 * Ruta de inyección directa — útil para testing y para cuando el OCR
 * ya se hizo en otro lado (n8n, app móvil con OCR local, etc.)
 */
rrvRouter.post('/acta-directa', async (req, res) => {
    const r = await rrvService.procesar(req.body);
    res.status(r.status === 'DESCARTADO' ? 422 : 200).json(r);
});

/**
 * Recepción de SMS — sin restricciones de horario, sin límite de intentos.
 * Body: { numero_origen, texto }
 */
rrvRouter.post('/sms', async (req, res) => {
    const { numero_origen, texto } = req.body || {};

    if (!smsAutorizado(numero_origen, config.sms.numerosAutorizados)) {
        await rrvRepo.logEvento({
            tipo_error: 'SMS_NUMERO_NO_AUTORIZADO',
            detalle: `Número ${numero_origen} no está en la lista blanca`,
        });
        return res.status(204).end(); // ignorado silenciosamente
    }

    const { datos, faltantes, reconocidos } = parsearSms(texto || '');

    if (faltantes.length > 0) {
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
        confianza_global: 0.95, // SMS es texto estructurado, alta confianza
        recibido_en: new Date().toISOString(),
    }, { priority: 10 });

    res.json({ status: 'SMS_ACEPTADO_PARA_PROCESAMIENTO', codigo_mesa: datos.codigo_mesa });
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
