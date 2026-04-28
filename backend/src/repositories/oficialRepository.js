import { pgRead, pgWrite } from '../config/postgres.js';

export const oficialRepo = {
    async existeMesa(codigoMesa) {
        const r = await pgRead.query(
            'SELECT cantidad_habilitada FROM mesas_electorales WHERE codigo_mesa = $1',
            [codigoMesa]
        );
        return r.rows[0] || null;
    },

    async existeRecinto(idRecinto) {
        const r = await pgRead.query(
            'SELECT id_recinto FROM recintos_electorales WHERE id_recinto = $1',
            [idRecinto]
        );
        return r.rowCount > 0;
    },

    async actasExistentesPorMesa(codigoMesa) {
        const r = await pgRead.query(
            `SELECT id, estado FROM votos_oficiales
             WHERE codigo_mesa = $1 AND estado != 'ANULADA'`,
            [codigoMesa]
        );
        return r.rows;
    },

    async insertarActa(acta) {
        const cols = [
            'codigo_mesa','session_id','habilitados','votos_emitidos','ausentismo',
            'p1','p2','p3','p4','votos_blancos','votos_nulos',
            'estado','motivo_estado','discrepancia_rrv','discrepancias_3way','fuente','creado_por',
        ];
        const values = cols.map((c) => acta[c] ?? null);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');

        const r = await pgWrite.query(
            `INSERT INTO votos_oficiales (${cols.join(',')})
             VALUES (${placeholders})
             RETURNING id`,
            values
        );
        return r.rows[0].id;
    },

    async actualizarEstado(id, estado, motivo, modificadoPor) {
        await pgWrite.query(
            `UPDATE votos_oficiales
             SET estado = $1, motivo_estado = $2,
                 modificado_en = NOW(), modificado_por = $3
             WHERE id = $4`,
            [estado, motivo, modificadoPor, id]
        );
    },

    async logError(log) {
        await pgWrite.query(
            `INSERT INTO logs_oficial (codigo_mesa, tipo_error, detalle, datos_entrada, operador_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [log.codigo_mesa ?? null, log.tipo_error, log.detalle, log.datos_entrada ?? null, log.operador_id ?? null]
        );
    },

    // -------- Sesiones de transcripción (vía manual o N8N) --------
    async crearSesion(codigoMesa, via = 'MANUAL') {
        const r = await pgWrite.query(
            `INSERT INTO sesiones_transcripcion (codigo_mesa, via)
             VALUES ($1, $2)
             RETURNING session_id`,
            [codigoMesa, via]
        );
        return r.rows[0].session_id;
    },

    async insertarTranscripcion(sessionId, codigoMesa, operadorId, datos) {
        await pgWrite.query(
            `INSERT INTO transcripciones_pendientes
             (session_id, codigo_mesa, operador_id,
              votos_emitidos, ausentismo, p1, p2, p3, p4, votos_blancos, votos_nulos)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                sessionId, codigoMesa, operadorId,
                datos.votos_emitidos, datos.ausentismo,
                datos.p1, datos.p2, datos.p3, datos.p4,
                datos.votos_blancos, datos.votos_nulos,
            ]
        );
    },

    async transcripcionesDeSesion(sessionId) {
        const r = await pgRead.query(
            `SELECT * FROM transcripciones_pendientes WHERE session_id = $1
             ORDER BY operador_id`,
            [sessionId]
        );
        return r.rows;
    },

    async cerrarSesion(sessionId, estado) {
        await pgWrite.query(
            `UPDATE sesiones_transcripcion
             SET estado = $1, cerrada_en = NOW()
             WHERE session_id = $2`,
            [estado, sessionId]
        );
    },

    // -------- Vistas para dashboard --------
    async totalesPorCandidato() {
        const r = await pgRead.query('SELECT * FROM v_totales_candidato');
        return r.rows[0] || {};
    },

    async participacionPorDepartamento() {
        const r = await pgRead.query('SELECT * FROM v_participacion_departamento ORDER BY departamento');
        return r.rows;
    },

    async estadoActas() {
        const r = await pgRead.query('SELECT * FROM v_estado_actas');
        return r.rows;
    },

    async ingestaPorHora() {
        const r = await pgRead.query('SELECT * FROM v_ingesta_por_hora LIMIT 24');
        return r.rows;
    },

    async topErrores() {
        const r = await pgRead.query('SELECT * FROM v_top_errores LIMIT 10');
        return r.rows;
    },

    async actaPorMesa(codigoMesa) {
        const r = await pgRead.query(
            `SELECT * FROM votos_oficiales
             WHERE codigo_mesa = $1 AND estado IN ('APROBADA','PENDIENTE')
             ORDER BY creado_en DESC LIMIT 1`,
            [codigoMesa]
        );
        return r.rows[0] || null;
    },
};
