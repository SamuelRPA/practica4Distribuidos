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

    /**
     * Información completa del padrón para una mesa: nombre del recinto,
     * id_recinto, cantidad_habilitada del padrón, departamento, municipio.
     * Lo usa el validador para detectar mesa que no pertenece a su recinto.
     */
    async padronInfo(codigoMesa) {
        const r = await pgRead.query(
            `SELECT m.codigo_mesa, m.nro_mesa, m.cantidad_habilitada,
                    m.id_recinto, r.nombre AS recinto_nombre, r.codigo_territorial,
                    d.departamento, d.provincia, d.municipio
             FROM mesas_electorales m
             JOIN recintos_electorales r ON r.id_recinto = m.id_recinto
             JOIN distribucion_territorial d ON d.codigo_territorial = r.codigo_territorial
             WHERE m.codigo_mesa = $1`,
            [codigoMesa]
        );
        return r.rows[0] || null;
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
            'apertura_hora','apertura_minutos','cierre_hora','cierre_minutos','duracion_minutos',
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
              votos_emitidos, ausentismo, p1, p2, p3, p4, votos_blancos, votos_nulos,
              apertura_hora, apertura_minutos, cierre_hora, cierre_minutos)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
                sessionId, codigoMesa, operadorId,
                datos.votos_emitidos, datos.ausentismo,
                datos.p1, datos.p2, datos.p3, datos.p4,
                datos.votos_blancos, datos.votos_nulos,
                datos.apertura_hora, datos.apertura_minutos,
                datos.cierre_hora, datos.cierre_minutos
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

    async metricasTiempos(depto, provincia) {
        let whereClause = '';
        const params = [];
        const joinTables = `
            JOIN mesas_electorales me ON v.codigo_mesa = me.codigo_mesa
            JOIN recintos_electorales r ON me.id_recinto = r.id_recinto
            JOIN distribucion_territorial d ON r.codigo_territorial = d.codigo_territorial
        `;
        
        if (depto && provincia) {
            whereClause = 'WHERE d.departamento = $1 AND d.provincia = $2';
            params.push(depto, provincia);
        }

        // Recintos más lentos (Promedio)
        const mesaMasHoras = await pgRead.query(`
            SELECT r.id_recinto, r.nombre AS recinto_nombre, ROUND(AVG(v.duracion_minutos)) AS duracion_minutos
            FROM v_tiempos_mesas v
            ${joinTables}
            ${whereClause}
            GROUP BY r.id_recinto, r.nombre
            ORDER BY duracion_minutos DESC
            LIMIT 5
        `, params);
        
        // Recintos más rápidos (Promedio)
        const whereClauseRapidas = whereClause ? whereClause + ' AND v.duracion_minutos > 0' : 'WHERE v.duracion_minutos > 0';
        const mesaMenosHoras = await pgRead.query(`
            SELECT r.id_recinto, r.nombre AS recinto_nombre, ROUND(AVG(v.duracion_minutos)) AS duracion_minutos
            FROM v_tiempos_mesas v
            ${joinTables}
            ${whereClauseRapidas}
            GROUP BY r.id_recinto, r.nombre
            ORDER BY duracion_minutos ASC
            LIMIT 5
        `, params);
        
        // La última mesa en cerrar
        const ultimaEnCerrar = await pgRead.query(`
            SELECT v.codigo_mesa, v.nro_mesa, v.cierre_hora, v.cierre_minutos
            FROM v_tiempos_mesas v
            ${joinTables}
            ${whereClause}
            ORDER BY v.cierre_hora DESC, v.cierre_minutos DESC
            LIMIT 1
        `, params);
        
        return {
            mas_lentas: mesaMasHoras.rows,
            mas_rapidas: mesaMenosHoras.rows,
            ultima_mesa_en_cerrar: ultimaEnCerrar.rows[0] || null
        };
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

    // -------- CRUD: Listar / anular actas --------
    async listarActas({ limit = 50, estado, mesa } = {}) {
        const where = [];
        const params = [];
        if (estado) { params.push(estado); where.push(`vo.estado = $${params.length}`); }
        if (mesa) { params.push(mesa); where.push(`vo.codigo_mesa = $${params.length}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit);
        const r = await pgRead.query(
            `SELECT vo.id, vo.codigo_mesa, vo.habilitados, vo.votos_emitidos,
                    vo.p1, vo.p2, vo.p3, vo.p4, vo.votos_blancos, vo.votos_nulos,
                    vo.estado, vo.fuente, vo.creado_en, vo.creado_por,
                    me.nro_mesa, re.nombre AS recinto_nombre, dt.departamento
             FROM votos_oficiales vo
             JOIN mesas_electorales me ON me.codigo_mesa = vo.codigo_mesa
             JOIN recintos_electorales re ON re.id_recinto = me.id_recinto
             JOIN distribucion_territorial dt ON dt.codigo_territorial = re.codigo_territorial
             ${whereSql}
             ORDER BY vo.creado_en DESC
             LIMIT $${params.length}`,
            params
        );
        return r.rows;
    },

    async anularActa(id, motivo, modificadoPor) {
        const r = await pgWrite.query(
            `UPDATE votos_oficiales
             SET estado = 'ANULADA', motivo_estado = $1,
                 modificado_en = NOW(), modificado_por = $2
             WHERE id = $3
             RETURNING id, codigo_mesa, estado`,
            [motivo || 'Anulada manualmente desde panel', modificadoPor || 'admin_web', id]
        );
        return r.rows[0] || null;
    },

    // -------- CRUD: Mesas electorales --------
    async listarMesas({ limit = 100, recinto, q } = {}) {
        const where = [];
        const params = [];
        if (recinto) { params.push(recinto); where.push(`me.id_recinto = $${params.length}`); }
        if (q) {
            params.push(`%${q}%`);
            where.push(`(CAST(me.codigo_mesa AS TEXT) ILIKE $${params.length} OR re.nombre ILIKE $${params.length})`);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit);
        const r = await pgRead.query(
            `SELECT me.codigo_mesa, me.nro_mesa, me.cantidad_habilitada, me.id_recinto,
                    re.nombre AS recinto_nombre, dt.departamento, dt.provincia, dt.municipio,
                    (SELECT COUNT(*) FROM votos_oficiales vo
                     WHERE vo.codigo_mesa = me.codigo_mesa AND vo.estado != 'ANULADA') AS actas_activas
             FROM mesas_electorales me
             JOIN recintos_electorales re ON re.id_recinto = me.id_recinto
             JOIN distribucion_territorial dt ON dt.codigo_territorial = re.codigo_territorial
             ${whereSql}
             ORDER BY me.codigo_mesa
             LIMIT $${params.length}`,
            params
        );
        return r.rows;
    },

    async crearMesa({ codigo_mesa, nro_mesa, cantidad_habilitada, id_recinto }) {
        const r = await pgWrite.query(
            `INSERT INTO mesas_electorales (codigo_mesa, nro_mesa, cantidad_habilitada, id_recinto)
             VALUES ($1, $2, $3, $4)
             RETURNING codigo_mesa, nro_mesa, cantidad_habilitada, id_recinto`,
            [codigo_mesa, nro_mesa, cantidad_habilitada, id_recinto]
        );
        return r.rows[0];
    },

    async eliminarMesa(codigoMesa) {
        const actas = await pgRead.query(
            `SELECT COUNT(*)::int AS n FROM votos_oficiales
             WHERE codigo_mesa = $1 AND estado != 'ANULADA'`,
            [codigoMesa]
        );
        if (actas.rows[0].n > 0) {
            const err = new Error(`No se puede eliminar: tiene ${actas.rows[0].n} acta(s) activa(s). Anúlalas primero.`);
            err.code = 'MESA_CON_ACTAS';
            throw err;
        }
        const r = await pgWrite.query(
            `DELETE FROM mesas_electorales WHERE codigo_mesa = $1 RETURNING codigo_mesa`,
            [codigoMesa]
        );
        return r.rows[0] || null;
    },

    async listarRecintos() {
        const r = await pgRead.query(
            `SELECT re.id_recinto, re.nombre, re.cantidad_mesas,
                    dt.departamento, dt.provincia
             FROM recintos_electorales re
             JOIN distribucion_territorial dt ON dt.codigo_territorial = re.codigo_territorial
             ORDER BY dt.departamento, re.nombre
             LIMIT 500`
        );
        return r.rows;
    },
};
