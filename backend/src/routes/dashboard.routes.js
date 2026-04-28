// Endpoints agregados que el dashboard usa para visualizaciones cruzadas RRV vs Oficial.
import { Router } from 'express';
import { rrvRepo } from '../repositories/rrvRepository.js';
import { oficialRepo } from '../repositories/oficialRepository.js';

export const dashboardRouter = Router();

dashboardRouter.get('/comparacion', async (_req, res) => {
    const [rrvTotales, oficialTotales] = await Promise.all([
        rrvRepo.totalesPorPartido(),
        oficialRepo.totalesPorCandidato(),
    ]);
    res.json({
        rrv: rrvTotales[0] || {},
        oficial: oficialTotales,
    });
});

dashboardRouter.get('/tiempos', async (_req, res) => {
    try {
        const metricas = await oficialRepo.metricasTiempos();
        res.json({ status: 'ok', data: metricas });
    } catch (error) {
        console.error('Error fetching tiempos:', error);
        res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
    }
});

dashboardRouter.get('/health', async (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});
