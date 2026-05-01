// Administración de SMS y webhook receiver para proveedores externos.
// Un solo endpoint /webhook/:proveedor acepta payload normalizado de
// Twilio, Telegram, WhatsApp Business o genérico.

import { Router } from 'express';
import { config } from '../config/env.js';
import { publish } from '../config/rabbitmq.js';
import { makeLogger } from '../lib/logger.js';
import { smsRepo } from '../repositories/smsRepository.js';
import { rrvRepo } from '../repositories/rrvRepository.js';
import { parsearSms } from '../services/rrv/smsParser.js';

const log = makeLogger('sms-routes');

export const smsRouter = Router();

// ============================================================
// CRUD de números autorizados
// ============================================================

smsRouter.get('/numeros', async (_req, res, next) => {
    try {
        const numeros = await smsRepo.listarNumeros();
        res.json(numeros);
    } catch (err) { next(err); }
});

smsRouter.post('/numeros', async (req, res, next) => {
    try {
        const { numero, etiqueta, recinto, proveedor } = req.body || {};
        if (!numero) return res.status(400).json({ error: 'numero requerido' });
        const doc = await smsRepo.agregarNumero({ numero, etiqueta, recinto, proveedor });
        log.success(`Número agregado a la lista blanca: ${numero} (${proveedor || 'GENERICO'})`, {
            etiqueta: etiqueta || '—',
        });
        res.status(201).json(doc);
    } catch (err) { next(err); }
});

smsRouter.delete('/numeros/:id', async (req, res, next) => {
    try {
        await smsRepo.eliminarNumero(req.params.id);
        log.warn(`Número eliminado: id=${req.params.id}`);
        res.status(204).end();
    } catch (err) { next(err); }
});

smsRouter.patch('/numeros/:id/toggle', async (req, res, next) => {
    try {
        await smsRepo.toggleActivo(req.params.id, req.body?.activo);
        log.info(`Número toggle: id=${req.params.id} activo=${req.body?.activo}`);
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// ============================================================
// Webhook receiver — un solo endpoint por proveedor
// ============================================================

smsRouter.post('/webhook/:proveedor', async (req, res) => {
    const proveedor = req.params.proveedor.toLowerCase();

    try {
        const { numero_origen, texto } = normalizarPayload(proveedor, req.body);

        log.sms(`SMS entrante por ${proveedor.toUpperCase()} desde ${numero_origen || 'desconocido'}`, {
            texto: texto?.slice(0, 100) || '(vacío)',
        });

        if (!numero_origen || !texto) {
            log.warn(`Payload inválido del proveedor ${proveedor}`);
            await safeRegistrar({
                proveedor, numero_origen: numero_origen || 'desconocido',
                texto: texto || '', payload_raw: req.body,
                resultado: 'PAYLOAD_INVALIDO',
            });
            return res.status(400).json({ error: 'no se pudo extraer numero_origen ni texto' });
        }

        const autorizado = await smsRepo.numeroEstaAutorizado(numero_origen);
        if (!autorizado) {
            log.warn(`Número ${numero_origen} NO está en lista blanca — IGNORADO`);
            await safeRegistrar({
                proveedor, numero_origen, texto, payload_raw: req.body,
                resultado: 'NUMERO_NO_AUTORIZADO',
            });
            await safeLogRrv({
                tipo_error: 'SMS_NUMERO_NO_AUTORIZADO',
                detalle: `Número ${numero_origen} no está en la lista blanca`,
            });
            return res.status(204).end();
        }

        log.info(`Número ${numero_origen} autorizado ✓ — parseando SMS...`);

        const { datos, faltantes, reconocidos } = parsearSms(texto);

        if (faltantes.length > 0) {
            log.warn(`SMS incompleto de ${numero_origen} — faltan: ${faltantes.join(', ')}`);
            await safeRegistrar({
                proveedor, numero_origen, texto, payload_raw: req.body,
                resultado: `CAMPOS_FALTANTES: ${faltantes.join(',')}`,
            });
            return res.status(422).json({
                status: 'SMS_INCOMPLETO',
                faltantes,
                mensaje: `Faltan: ${faltantes.join(', ')}`,
            });
        }

        log.success(`SMS parseado — mesa ${datos.codigo_mesa}, ${reconocidos} campos reconocidos`, {
            VE: datos.votos_emitidos, P1: datos.p1, P2: datos.p2, P3: datos.p3, P4: datos.p4,
            VB: datos.votos_blancos, VN: datos.votos_nulos,
        });

        const publicado = safePublish(config.rabbitmq.queues.validacion, {
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

        if (!publicado) {
            log.error('No se pudo publicar en RabbitMQ — ¿está corriendo?');
            await safeRegistrar({
                proveedor, numero_origen, texto, payload_raw: req.body,
                codigo_mesa: datos.codigo_mesa,
                resultado: 'RABBIT_NO_DISPONIBLE',
            });
            return res.status(503).json({
                status: 'RABBIT_NO_DISPONIBLE',
                mensaje: 'Mensaje recibido pero RabbitMQ no está conectado',
            });
        }

        log.send(`Encolado en q_validacion (priority=10)`);

        await safeRegistrar({
            proveedor, numero_origen, texto, payload_raw: req.body,
            codigo_mesa: datos.codigo_mesa,
            resultado: 'ENCOLADO_EN_RRV',
        });

        res.json({ status: 'SMS_ACEPTADO', codigo_mesa: datos.codigo_mesa });
    } catch (err) {
        log.error(`Error procesando webhook ${proveedor}`, err);
        res.status(500).json({
            error: 'error procesando webhook',
            detalle: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        });
    }
});

// ============================================================
// Auditoría
// ============================================================

smsRouter.get('/mensajes', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit || '50', 10);
        const mensajes = await smsRepo.listarMensajesRecientes(limit);
        res.json(mensajes);
    } catch (err) { next(err); }
});

// ============================================================
// Helpers — defensivos: nunca tiran
// ============================================================

async function safeRegistrar(args) {
    try {
        await smsRepo.registrarMensaje(args);
    } catch (err) {
        log.error('Falló registrarMensaje (no crítico)', err);
    }
}

async function safeLogRrv(args) {
    try {
        await rrvRepo.logEvento(args);
    } catch (err) {
        log.error('Falló logEvento (no crítico)', err);
    }
}

function safePublish(queue, payload, opts) {
    try {
        return publish(queue, payload, opts);
    } catch (err) {
        log.error('Publish a RabbitMQ falló', err);
        return false;
    }
}

function normalizarPayload(proveedor, body) {
    if (!body) return { numero_origen: null, texto: null };

    switch (proveedor) {
        case 'twilio':
            return { numero_origen: body.From, texto: body.Body };

        case 'telegram': {
            const msg = body.message || body.edited_message;
            if (!msg) return { numero_origen: null, texto: null };
            const tgUser = msg.from?.username ? `@${msg.from.username}` : `tg:${msg.from?.id}`;
            return { numero_origen: tgUser, texto: msg.text };
        }

        case 'whatsapp': {
            const entry = body.entry?.[0]?.changes?.[0]?.value;
            const wm = entry?.messages?.[0];
            if (!wm) return { numero_origen: null, texto: null };
            return { numero_origen: `+${wm.from}`, texto: wm.text?.body };
        }

        case 'generico':
        case 'simulado':
        default:
            return { numero_origen: body.numero_origen, texto: body.texto };
    }
}
