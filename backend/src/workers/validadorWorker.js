// Worker que valida y clasifica el acta. Pasa todo a q_escritura.
import { config } from '../config/env.js';
import { connectMongo } from '../config/mongo.js';
import { connectRabbit, getChannel, publish } from '../config/rabbitmq.js';
import { banner, makeLogger } from '../lib/logger.js';

const log = makeLogger('validador');

async function start() {
    banner('VALIDADOR WORKER — consumiendo q_validacion');
    await connectMongo();
    await connectRabbit();
    const ch = getChannel();
    ch.prefetch(20);

    log.info(`Esperando mensajes en ${config.rabbitmq.queues.validacion}...`);

    ch.consume(config.rabbitmq.queues.validacion, async (msg) => {
        if (!msg) return;
        try {
            const payload = JSON.parse(msg.content.toString());
            log.recv(`Validando acta — mesa ${payload.codigo_mesa}, fuente=${payload.fuente}`);
            publish(config.rabbitmq.queues.escritura, payload, { priority: msg.properties.priority || 5 });
            log.send(`Publicado en q_escritura → mesa ${payload.codigo_mesa}`);
            ch.ack(msg);
        } catch (err) {
            log.error('Error procesando mensaje', err);
            ch.nack(msg, false, false);
        }
    });
}

start().catch((err) => {
    log.error('FATAL al iniciar worker', err);
    process.exit(1);
});
