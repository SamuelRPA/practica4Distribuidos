// Worker que consume q_ingesta, llama al servicio OCR Python y publica en q_validacion.
import axios from 'axios';
import { config } from '../config/env.js';
import { connectMongo } from '../config/mongo.js';
import { connectRabbit, getChannel, publish } from '../config/rabbitmq.js';
import { banner, makeLogger } from '../lib/logger.js';
import { rrvRepo } from '../repositories/rrvRepository.js';

const log = makeLogger('ocr-worker');

async function start() {
    banner('OCR WORKER — consumiendo q_ingesta');
    await connectMongo();
    await connectRabbit();
    const ch = getChannel();
    ch.prefetch(5);

    log.info(`Esperando mensajes en ${config.rabbitmq.queues.ingesta}...`);

    ch.consume(config.rabbitmq.queues.ingesta, async (msg) => {
        if (!msg) return;
        let payload;
        try {
            payload = JSON.parse(msg.content.toString());
        } catch (err) {
            log.error('Payload inválido en cola, descartando', err);
            return ch.ack(msg);
        }

        const mesa = payload.codigo_mesa;
        log.recv(`Mensaje recibido — mesa ${mesa}, tipo=${payload.tipo}`);

        try {
            if (payload.tipo === 'SMS') {
                log.info(`SMS no necesita OCR — paso directo a q_validacion`);
                publish(config.rabbitmq.queues.validacion, payload, { priority: 10 });
                return ch.ack(msg);
            }

            log.cog(`Llamando a OCR Service (${config.ocr.url}/ocr) para mesa ${mesa}...`);
            const ocrResp = await axios.post(
                `${config.ocr.url}/ocr`,
                { pdf_b64: payload.pdf_b64, codigo_mesa: payload.codigo_mesa },
                { timeout: config.ocr.timeoutMs },
            );

            const conf = ocrResp.data.confianza_por_campo
                ? Object.values(ocrResp.data.confianza_por_campo).reduce((a, b) => a + b, 0) /
                  Math.max(1, Object.values(ocrResp.data.confianza_por_campo).length)
                : null;

            log.success(`OCR completado para mesa ${mesa}`, {
                confianza_promedio: conf?.toFixed(2),
                modo: ocrResp.data._mock ? 'MOCK' : 'TESSERACT',
                campos: Object.keys(ocrResp.data.datos_interpretados || {}).length,
            });

            const enriched = {
                ...payload,
                tipo: 'PDF_OCR',
                fuente: 'PDF',
                datos_interpretados: ocrResp.data.datos_interpretados,
                datos_crudos_ocr: ocrResp.data.datos_crudos,
                confianza_por_campo: ocrResp.data.confianza_por_campo,
            };
            delete enriched.pdf_b64;

            publish(config.rabbitmq.queues.validacion, enriched, { priority: 5 });
            log.send(`Publicado en q_validacion → mesa ${mesa}`);
            ch.ack(msg);
        } catch (err) {
            log.error(`OCR falló para mesa ${mesa}`, err);
            await rrvRepo.logEvento({
                tipo_error: 'OCR_FALLO',
                codigo_mesa: payload.codigo_mesa,
                detalle: err.message,
                datos_entrada: { hash_pdf: payload.hash_pdf },
            });
            ch.nack(msg, false, false);
        }
    });
}

start().catch((err) => {
    log.error('FATAL al iniciar worker', err);
    process.exit(1);
});
