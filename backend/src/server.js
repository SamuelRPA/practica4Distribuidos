import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { connectMongo } from './config/mongo.js';
import { connectRabbit } from './config/rabbitmq.js';
import { pingPostgres } from './config/postgres.js';
import { banner, makeLogger } from './lib/logger.js';
import { rrvRouter } from './routes/rrv.routes.js';
import { oficialRouter } from './routes/oficial.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { smsRouter } from './routes/sms.routes.js';

const log = makeLogger('server');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
    if (req.path !== '/api/dashboard/health' && !req.path.startsWith('/_next')) {
        log.info(`${req.method} ${req.path}`);
    }
    next();
});

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
    log.error('Error no manejado', err);
    res.status(500).json({ error: err.message || 'error interno' });
});

async function start() {
    banner('BACKEND OEP — Sistema Nacional de Cómputo Electoral');

    try {
        await connectMongo();
        log.success('MongoDB Atlas conectado');
    } catch (err) {
        log.error('MongoDB no disponible', err);
    }
    try {
        await pingPostgres();
        log.success('PostgreSQL cluster conectado');
    } catch (err) {
        log.error('PostgreSQL no disponible', err);
    }
    try {
        await connectRabbit();
        log.success('RabbitMQ conectado, colas declaradas');
    } catch (err) {
        log.error('RabbitMQ no disponible', err);
    }

    app.listen(config.backend.port, () => {
        log.success(`API HTTP escuchando en :${config.backend.port} (env=${config.backend.nodeEnv})`);
        log.info('Endpoints:');
        log.info(`  POST  /api/rrv/acta-pdf         ← uploads desde la app móvil`);
        log.info(`  POST  /api/rrv/sms              ← SMS legacy directo`);
        log.info(`  POST  /api/sms/webhook/:proveedor ← webhook universal`);
        log.info(`  POST  /api/oficial/acta         ← cómputo oficial (CSV/n8n)`);
        log.info(`  GET   /api/rrv/resumen          ← lo lee el dashboard`);
    });
}

start();
