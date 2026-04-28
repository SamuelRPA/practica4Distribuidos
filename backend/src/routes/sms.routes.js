// Administración de SMS y webhook receiver para proveedores externos.
// Un solo endpoint /webhook/:proveedor acepta payload normalizado de
// Twilio, Telegram, WhatsApp Business o genérico.

import { Router } from 'express';
import { config } from '../config/env.js';
import { publish } from '../config/rabbitmq.js';
import { smsRepo } from '../repositories/smsRepository.js';
import { rrvRepo } from '../repositories/rrvRepository.js';
import { parsearSms } from '../services/rrv/smsParser.js';

export const smsRouter = Router();

// ============================================================
// CRUD de números autorizados
// ============================================================

smsRouter.get('/numeros', async (_req, res) => {
    const numeros = await smsRepo.listarNumeros();
    res.json(numeros);
});

smsRouter.post('/numeros', async (req, res) => {
    const { numero, etiqueta, recinto, proveedor } = req.body || {};
    if (!numero) return res.status(400).json({ error: 'numero requerido' });
    const doc = await smsRepo.agregarNumero({ numero, etiqueta, recinto, proveedor });
    res.status(201).json(doc);
});

smsRouter.delete('/numeros/:id', async (req, res) => {
    await smsRepo.eliminarNumero(req.params.id);
    res.status(204).end();
});

smsRouter.patch('/numeros/:id/toggle', async (req, res) => {
    await smsRepo.toggleActivo(req.params.id, req.body?.activo);
    res.json({ ok: true });
});

// ============================================================
// Webhook receiver — un solo endpoint por proveedor
// ============================================================

/**
 * Webhook universal. La URL completa es /api/sms/webhook/:proveedor
 * proveedor: 'twilio' | 'telegram' | 'whatsapp' | 'generico'
 *
 * Cada proveedor manda el payload con estructura distinta;
 * acá lo normalizamos a { numero_origen, texto } y lo metemos
 * al pipeline RRV como cualquier otro SMS.
 */
smsRouter.post('/webhook/:proveedor', async (req, res) => {
    const proveedor = req.params.proveedor.toLowerCase();
    const { numero_origen, texto } = normalizarPayload(proveedor, req.body);

    if (!numero_origen || !texto) {
        await smsRepo.registrarMensaje({
            proveedor, numero_origen: numero_origen || 'desconocido',
            texto: texto || '', payload_raw: req.body,
            resultado: 'PAYLOAD_INVALIDO',
        });
        return res.status(400).json({ error: 'no se pudo extraer numero_origen ni texto' });
    }

    // Verificación: ¿está autorizado?
    const autorizado = await smsRepo.numeroEstaAutorizado(numero_origen);
    if (!autorizado) {
        await smsRepo.registrarMensaje({
            proveedor, numero_origen, texto, payload_raw: req.body,
            resultado: 'NUMERO_NO_AUTORIZADO',
        });
        await rrvRepo.logEvento({
            tipo_error: 'SMS_NUMERO_NO_AUTORIZADO',
            detalle: `Número ${numero_origen} no está en la lista blanca`,
        });
        return res.status(204).end(); // ignorado silenciosamente, como dice el ADR
    }

    // Parsear el SMS
    const { datos, faltantes } = parsearSms(texto);

    if (faltantes.length > 0) {
        await smsRepo.registrarMensaje({
            proveedor, numero_origen, texto, payload_raw: req.body,
            resultado: `CAMPOS_FALTANTES: ${faltantes.join(',')}`,
        });
        return res.status(422).json({
            status: 'SMS_INCOMPLETO',
            faltantes,
            mensaje: `Faltan: ${faltantes.join(', ')}`,
        });
    }

    // Encolar al pipeline RRV con prioridad alta
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

    await smsRepo.registrarMensaje({
        proveedor, numero_origen, texto, payload_raw: req.body,
        codigo_mesa: datos.codigo_mesa,
        resultado: 'ENCOLADO_EN_RRV',
    });

    res.json({ status: 'SMS_ACEPTADO', codigo_mesa: datos.codigo_mesa });
});

// ============================================================
// Auditoría — qué mensajes han llegado
// ============================================================

smsRouter.get('/mensajes', async (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    const mensajes = await smsRepo.listarMensajesRecientes(limit);
    res.json(mensajes);
});

// ============================================================
// Endpoint de prueba — simula un SMS sin proveedor real
// ============================================================

smsRouter.post('/test', async (req, res) => {
    // Mismo flujo que el webhook genérico pero accesible desde el dashboard
    req.params = { proveedor: 'simulado' };
    return smsRouter.handle({ ...req, url: '/webhook/simulado', method: 'POST' }, res);
});

// ============================================================
// Helpers
// ============================================================

function normalizarPayload(proveedor, body) {
    if (!body) return { numero_origen: null, texto: null };

    switch (proveedor) {
        case 'twilio':
            // Twilio envía: { From, Body, To, MessageSid, ... }
            return { numero_origen: body.From, texto: body.Body };

        case 'telegram':
            // Telegram envía: { message: { from: { id, username }, text, chat: { id } } }
            const msg = body.message || body.edited_message;
            if (!msg) return { numero_origen: null, texto: null };
            const tgUser = msg.from?.username
                ? `@${msg.from.username}`
                : `tg:${msg.from?.id}`;
            return { numero_origen: tgUser, texto: msg.text };

        case 'whatsapp':
            // WhatsApp Cloud API envía: { entry: [{ changes: [{ value: { messages: [{ from, text: { body } }] }}]}]}
            const entry = body.entry?.[0]?.changes?.[0]?.value;
            const wm = entry?.messages?.[0];
            if (!wm) return { numero_origen: null, texto: null };
            return { numero_origen: `+${wm.from}`, texto: wm.text?.body };

        case 'generico':
        case 'simulado':
        default:
            // Esperamos { numero_origen, texto } directo
            return { numero_origen: body.numero_origen, texto: body.texto };
    }
}
