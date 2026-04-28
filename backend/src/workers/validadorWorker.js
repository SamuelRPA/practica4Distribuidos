// Worker que valida y clasifica el acta. Pasa todo a q_escritura.
import { config } from '../config/env.js';
import { connectMongo } from '../config/mongo.js';
import { connectRabbit, getChannel, publish } from '../config/rabbitmq.js';

async function start() {
    await connectMongo();
    await connectRabbit();
    const ch = getChannel();
    ch.prefetch(20);

    console.log('[validador-worker] Esperando mensajes en', config.rabbitmq.queues.validacion);

    ch.consume(config.rabbitmq.queues.validacion, async (msg) => {
        if (!msg) return;
        try {
            const payload = JSON.parse(msg.content.toString());
            // El servicio rrvService ya hace toda la validación + clasificación.
            // Aquí solo lo encolamos a la cola de escritura para que el worker batch lo persista.
            publish(config.rabbitmq.queues.escritura, payload, { priority: msg.properties.priority || 5 });
            ch.ack(msg);
        } catch (err) {
            console.error('[validador-worker] error:', err.message);
            ch.nack(msg, false, false);
        }
    });
}

start().catch((err) => {
    console.error('[validador-worker] FATAL:', err);
    process.exit(1);
});
