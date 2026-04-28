// Endpoints del Cómputo Oficial.
import { Router } from 'express';
import { oficialRepo } from '../repositories/oficialRepository.js';
import { oficialService } from '../services/oficial/oficialService.js';

export const oficialRouter = Router();

/**
 * Inserta un acta oficial (vía CSV, n8n, o formulario web simple).
 * Body: { codigo_mesa, votos_emitidos, ausentismo, p1..p4, votos_blancos, votos_nulos,
 *         fuente?, creado_por? }
 */
oficialRouter.post('/acta', async (req, res) => {
    const r = await oficialService.procesarActaSimple(req.body);
    const code = r.status === 'APROBADA' ? 200
              : r.status === 'EN_CUARENTENA' ? 202
              : 422;
    res.status(code).json(r);
});

/**
 * Crea una sesión de transcripción (vía manual o N8N).
 * Body: { codigo_mesa, via: 'MANUAL'|'N8N' }
 */
oficialRouter.post('/sesion', async (req, res) => {
    const codigoMesa = Number(req.body?.codigo_mesa);
    const via = req.body?.via || 'MANUAL';

    if (!codigoMesa) return res.status(400).json({ error: 'codigo_mesa requerido' });
    const mesa = await oficialRepo.existeMesa(codigoMesa);
    if (!mesa) return res.status(404).json({ error: 'mesa no existe' });

    const sessionId = await oficialRepo.crearSesion(codigoMesa, via);
    res.json({ session_id: sessionId, codigo_mesa: codigoMesa, via });
});

/**
 * Inserta una transcripción de un operador en la sesión.
 * Body: { session_id, codigo_mesa, operador_id, ...datos }
 */
oficialRouter.post('/transcripcion', async (req, res) => {
    const { session_id, codigo_mesa, operador_id, ...datos } = req.body || {};
    if (!session_id || !codigo_mesa || !operador_id) {
        return res.status(400).json({ error: 'session_id, codigo_mesa, operador_id requeridos' });
    }
    const r = await oficialService.insertarTranscripcion(session_id, Number(codigo_mesa), Number(operador_id), datos);
    res.json(r);
});

oficialRouter.get('/mesa/:codigo', async (req, res) => {
    const acta = await oficialRepo.actaPorMesa(parseInt(req.params.codigo, 10));
    if (!acta) return res.status(404).json({ error: 'sin acta para esta mesa' });
    res.json(acta);
});

/**
 * Resumen oficial para el dashboard.
 */
oficialRouter.get('/resumen', async (_req, res) => {
    const [totales, participacion, estados, ingesta, errores] = await Promise.all([
        oficialRepo.totalesPorCandidato(),
        oficialRepo.participacionPorDepartamento(),
        oficialRepo.estadoActas(),
        oficialRepo.ingestaPorHora(),
        oficialRepo.topErrores(),
    ]);
    res.json({ totales, participacion, estados, ingesta, errores });
});
