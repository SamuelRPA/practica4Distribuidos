// Endpoints agregados que el dashboard usa para visualizaciones cruzadas RRV vs Oficial.
import { Router } from 'express';
import { rrvRepo } from '../repositories/rrvRepository.js';
import { oficialRepo } from '../repositories/oficialRepository.js';

export const dashboardRouter = Router();
import { pgRead } from '../config/postgres.js';

dashboardRouter.get('/jerarquia/provincias', async (req, res) => {
    try {
        const { depto } = req.query;
        const r = await pgRead.query('SELECT DISTINCT d.provincia FROM distribucion_territorial d JOIN recintos_electorales r ON d.codigo_territorial = r.codigo_territorial WHERE d.departamento = $1 ORDER BY d.provincia', [depto]);
        res.json(r.rows.map(row => row.provincia));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

dashboardRouter.get('/jerarquia/recintos', async (req, res) => {
    try {
        const { depto, prov } = req.query;
        const r = await pgRead.query(`
            SELECT r.id_recinto, r.nombre, r.direccion, r.cantidad_mesas 
            FROM recintos_electorales r 
            JOIN distribucion_territorial d ON r.codigo_territorial = d.codigo_territorial 
            WHERE d.departamento = $1 AND d.provincia = $2
            ORDER BY r.nombre`, [depto, prov]);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

dashboardRouter.get('/jerarquia/mesas', async (req, res) => {
    try {
        const { recinto } = req.query;
        const r = await pgRead.query('SELECT codigo_mesa, nro_mesa, cantidad_habilitada FROM mesas_electorales WHERE id_recinto = $1 ORDER BY nro_mesa', [recinto]);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

dashboardRouter.get('/jerarquia/mesaDetalle', async (req, res) => {
    try {
        const { mesa } = req.query;
        const r = await pgRead.query('SELECT * FROM votos_oficiales WHERE codigo_mesa = $1 ORDER BY creado_en DESC LIMIT 1', [mesa]);
        res.json(r.rows[0] || null);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

dashboardRouter.get('/tiempos', async (req, res) => {
    try {
        const { depto, prov } = req.query;
        const metricas = await oficialRepo.metricasTiempos(depto, prov);
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
