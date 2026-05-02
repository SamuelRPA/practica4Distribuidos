// Worker que persiste actas en MongoDB. rrvService maneja la lógica de duplicados/clasificación.
import { config } from '../config/env.js';
import { connectMongo } from '../config/mongo.js';
import { connectRabbit, getChannel } from '../config/rabbitmq.js';
import { banner, makeLogger } from '../lib/logger.js';
import { rrvService } from '../services/rrv/rrvService.js';

const log = makeLogger('escritura');

async function start() {
    banner('ESCRITURA WORKER — consumiendo q_escritura → MongoDB');
    await connectMongo();
    await connectRabbit();
    const ch = getChannel();
    ch.prefetch(50);

    log.info(`Esperando mensajes en ${config.rabbitmq.queues.escritura}...`);

    ch.consume(config.rabbitmq.queues.escritura, async (msg) => {
        if (!msg) return;
        try {
            const payload = JSON.parse(msg.content.toString());
            const r = await rrvService.procesar(payload);

            if (r.status === 'INSERTADA') {
                log.db(`Mongo INSERT → mesa ${payload.codigo_mesa}, estado=${r.estado}`, {
                    ingreso_id: String(r.ingreso_id).slice(0, 12),
                    confianza: r.confianza_global,
                    nivel_alerta: r.nivel_alerta || null,
                });
                // Reportar hallazgos del padrón si hubo
                if (r.padron?.hallazgos?.length > 0) {
                    log.warn(`  Hallazgos padrón: ${r.padron.hallazgos.join(', ')}`,
                             r.padron.detalle);
                }
                if (r.advertencias?.length > 0) {
                    log.warn(`  Advertencias aritméticas: ${r.advertencias.length}`,
                             r.advertencias);
                }
            } else if (r.status === 'DUPLICADO_EXACTO_IGNORADO') {
                log.warn(`Mongo SKIP → mesa ${payload.codigo_mesa} (duplicado exacto, idempotencia OK)`);
            } else if (r.status === 'DESCARTADO') {
                log.error(`Mongo descartado → ${r.advertencias?.join(', ')}`);
            }

            ch.ack(msg);
        } catch (err) {
            log.error('Error escribiendo acta', err);
            ch.nack(msg, false, false);
        }
    });
}

start().catch((err) => {
    log.error('FATAL al iniciar worker', err);
    process.exit(1);
});
