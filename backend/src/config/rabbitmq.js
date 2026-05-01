import amqp from 'amqplib';
import { config } from './env.js';

let connection = null;
let channel = null;

export async function connectRabbit() {
    if (channel) return channel;

    connection = await amqp.connect(config.rabbitmq.url);
    channel = await connection.createChannel();

    // DLQ primero (las otras colas la referencian)
    await channel.assertQueue(config.rabbitmq.queues.dlq, { durable: true });

    // Colas con DLQ y prioridad para SMS > PDF
    const baseOpts = {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': config.rabbitmq.queues.dlq,
            'x-max-priority': 10,
        },
    };

    await channel.assertQueue(config.rabbitmq.queues.ingesta, baseOpts);
    await channel.assertQueue(config.rabbitmq.queues.validacion, baseOpts);
    await channel.assertQueue(config.rabbitmq.queues.escritura, baseOpts);

    console.log('[rabbit] Conectado y colas declaradas');
    return channel;
}

export function getChannel() {
    if (!channel) throw new Error('RabbitMQ no inicializado.');
    return channel;
}

export function isRabbitConnected() {
    return channel != null;
}

/**
 * Publica un mensaje en una cola con prioridad.
 * Devuelve true si se encoló, false si RabbitMQ no está disponible.
 * NO tira excepciones — el caller decide qué hacer.
 */
export function publish(queue, payload, opts = {}) {
    if (!channel) {
        console.error('[rabbit] publish() llamado pero el channel no está conectado');
        return false;
    }
    try {
        return channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
            persistent: true,
            priority: opts.priority ?? 5,
            ...opts,
        });
    } catch (err) {
        console.error('[rabbit] sendToQueue falló:', err.message);
        return false;
    }
}

export async function closeRabbit() {
    if (channel) await channel.close();
    if (connection) await connection.close();
    channel = null;
    connection = null;
}
