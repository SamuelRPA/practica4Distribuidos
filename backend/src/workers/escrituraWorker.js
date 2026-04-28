// Worker que persiste actas en MongoDB. Procesa de a 1 (rrvService maneja la lógica).
import { config } from '../config/env.js';
import { connectMongo } from '../config/mongo.js';
import { connectRabbit, getChannel } from '../config/rabbitmq.js';
import { rrvService } from '../services/rrv/rrvService.js';

async function start() {
    await connectMongo();
    await connectRabbit();
    const ch = getChannel();
    ch.prefetch(50);

    console.log('[escritura-worker] Esperando mensajes en', config.rabbitmq.queues.escritura);

    ch.consume(config.rabbitmq.queues.escritura, async (msg) => {
        if (!msg) return;
        try {
            const payload = JSON.parse(msg.content.toString());
            await rrvService.procesar(payload);
            ch.ack(msg);
        } catch (err) {
            console.error('[escritura-worker] error:', err.message);
            ch.nack(msg, false, false);
        }
    });
}

start().catch((err) => {
    console.error('[escritura-worker] FATAL:', err);
    process.exit(1);
});
