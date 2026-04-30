import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { connectMongo } from './config/mongo.js';
import { connectRabbit } from './config/rabbitmq.js';
import { pingPostgres } from './config/postgres.js';
import { rrvRouter } from './routes/rrv.routes.js';
import { oficialRouter } from './routes/oficial.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { smsRouter } from './routes/sms.routes.js';

const app = express();

app.use(cors());

// JSON normal
app.use(express.json({ limit: '10mb' }));

// IMPORTANTE PARA TWILIO
// Twilio envía From y Body como application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.get('/', (_req, res) => {
    res.json({
        servicio: 'Sistema Nacional de Cómputo Electoral',
        practica: 4,
        rutas: ['/api/rrv', '/api/oficial', '/api/dashboard', '/api/sms'],
    });
});

app.use('/api/rrv', rrvRouter);
app.use('/api/oficial', oficialRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/sms', smsRouter);

app.use((err, _req, res, _next) => {
    console.error('[server] error no manejado:', err);
    res.status(500).json({ error: err.message || 'error interno' });
});

async function start() {
    try {
        await connectMongo();
    } catch (err) {
        console.error('[server] AVISO: Mongo no disponible —', err.message);
    }

    try {
        await pingPostgres();
    } catch (err) {
        console.error('[server] AVISO: Postgres no disponible —', err.message);
    }

    try {
        await connectRabbit();
    } catch (err) {
        console.error('[server] AVISO: RabbitMQ no disponible —', err.message);
    }

    app.listen(config.backend.port, () => {
        console.log(`[server] escuchando en :${config.backend.port} (env=${config.backend.nodeEnv})`);
    });
}

start();