// Centraliza el acceso a variables de entorno y valida lo crítico al arrancar.
// Si una variable obligatoria falta, fallar rápido con un mensaje claro.

function required(name) {
    const v = process.env[name];
    if (!v) {
        console.error(`[config] Variable de entorno faltante: ${name}`);
        console.error(`[config] Revisa que .env esté en la raíz del repo y que el script use --env-file=../.env`);
        process.exit(1);
    }
    return v;
}

function optional(name, fallback) {
    return process.env[name] ?? fallback;
}

export const config = {
    backend: {
        port: parseInt(optional('BACKEND_PORT', '3001'), 10),
        baseUrl: optional('BACKEND_BASE_URL', 'http://localhost:3001'),
        nodeEnv: optional('NODE_ENV', 'development'),
        logLevel: optional('LOG_LEVEL', 'info'),
    },
    mongo: {
        uri: required('MONGO_URI'),
        dbName: optional('MONGO_DB_NAME', 'electoral_rrv'),
    },
    postgres: {
        host: required('POSTGRES_HOST'),
        portWrite: parseInt(optional('POSTGRES_PORT_WRITE', '5432'), 10),
        portRead: parseInt(optional('POSTGRES_PORT_READ', '5433'), 10),
        user: required('POSTGRES_USER'),
        password: required('POSTGRES_PASSWORD'),
        database: required('POSTGRES_DB'),
    },
    rabbitmq: {
        url: optional('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        queues: {
            ingesta: optional('RABBITMQ_QUEUE_INGESTA', 'q_ingesta'),
            validacion: optional('RABBITMQ_QUEUE_VALIDACION', 'q_validacion'),
            escritura: optional('RABBITMQ_QUEUE_ESCRITURA', 'q_escritura'),
            dlq: optional('RABBITMQ_QUEUE_DLQ', 'q_dlq'),
        },
    },
    ocr: {
        url: optional('OCR_SERVICE_URL', 'http://localhost:5000'),
        timeoutMs: parseInt(optional('OCR_TIMEOUT_MS', '30000'), 10),
    },
    sms: {
        numerosAutorizados: optional('SMS_NUMEROS_AUTORIZADOS', '').split(',').filter(Boolean),
        gatewayMode: optional('SMS_GATEWAY_MODE', 'mock'),
    },
    rrv: {
        confianzaAprobada: parseFloat(optional('RRV_CONFIANZA_APROBADA', '0.80')),
        confianzaBaja: parseFloat(optional('RRV_CONFIANZA_BAJA', '0.50')),
        duplicadoCriticoUmbral: parseInt(optional('RRV_DUPLICADO_CRITICO_UMBRAL', '3'), 10),
    },
};
