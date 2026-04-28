// Worker que consume q_ingesta, llama al servicio OCR Python y publica en q_validacion.
import axios from 'axios';
import { config } from '../config/env.js';
import { connectMongo } from '../config/mongo.js';
import { connectRabbit, getChannel, publish } from '../config/rabbitmq.js';
import { rrvRepo } from '../repositories/rrvRepository.js';

async function start() {
    await connectMongo();
    await connectRabbit();
    const ch = getChannel();
    ch.prefetch(5);

    console.log('[ocr-worker] Esperando mensajes en', config.rabbitmq.queues.ingesta);

    ch.consume(config.rabbitmq.queues.ingesta, async (msg) => {
        if (!msg) return;
        let payload;
        try {
            payload = JSON.parse(msg.content.toString());
        } catch (err) {
            console.error('[ocr-worker] payload inválido, descartando:', err.message);
            return ch.ack(msg);
        }

        try {
            // Si el mensaje ya viene como SMS (texto), saltar OCR y mandar a validación
            if (payload.tipo === 'SMS') {
                publish(config.rabbitmq.queues.validacion, payload, { priority: 10 });
                return ch.ack(msg);
            }

            // Llamar al servicio OCR Python
            const ocrResp = await axios.post(
                `${config.ocr.url}/ocr`,
                { pdf_b64: payload.pdf_b64, codigo_mesa: payload.codigo_mesa },
                { timeout: config.ocr.timeoutMs },
            );

            const enriched = {
                ...payload,
                tipo: 'PDF_OCR',
                fuente: 'PDF',
                datos_interpretados: ocrResp.data.datos_interpretados,
                datos_crudos_ocr: ocrResp.data.datos_crudos,
                confianza_por_campo: ocrResp.data.confianza_por_campo,
            };
            delete enriched.pdf_b64; // ya no lo necesitamos en colas siguientes

            publish(config.rabbitmq.queues.validacion, enriched, { priority: 5 });
            ch.ack(msg);
        } catch (err) {
            console.error('[ocr-worker] error:', err.message);
            await rrvRepo.logEvento({
                tipo_error: 'OCR_FALLO',
                codigo_mesa: payload.codigo_mesa,
                detalle: err.message,
                datos_entrada: { hash_pdf: payload.hash_pdf },
            });
            // nack sin requeue → va a DLQ después de N intentos
            ch.nack(msg, false, false);
        }
    });
}

start().catch((err) => {
    console.error('[ocr-worker] FATAL:', err);
    process.exit(1);
});
