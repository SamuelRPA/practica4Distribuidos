import { getMongo } from '../config/mongo.js';

export const rrvRepo = {
    async insertarActa(acta) {
        const db = getMongo();
        const r = await db.collection('actas_rrv').insertOne(acta);
        return r.insertedId;
    },

    async obtenerVersiones(codigoMesa) {
        const db = getMongo();
        return db
            .collection('actas_rrv')
            .find({ codigo_mesa: codigoMesa })
            .sort({ ingreso_numero: 1 })
            .toArray();
    },

    async existeHash(codigoMesa, hash) {
        const db = getMongo();
        return db.collection('actas_rrv').findOne({ codigo_mesa: codigoMesa, hash_contenido: hash });
    },

    async marcarComoActiva(codigoMesa, actaId) {
        const db = getMongo();
        await db.collection('actas_rrv').updateMany(
            { codigo_mesa: codigoMesa },
            { $set: { es_version_activa: false } }
        );
        await db.collection('actas_rrv').updateOne(
            { _id: actaId },
            { $set: { es_version_activa: true } }
        );
    },

    async logEvento(evento) {
        const db = getMongo();
        await db.collection('logs_rrv').insertOne({
            ...evento,
            timestamp: new Date(),
        });
    },

    // Lecturas para dashboard
    async resumenEstados() {
        const db = getMongo();
        return db.collection('actas_rrv').aggregate([
            { $group: { _id: '$estado', cantidad: { $sum: 1 } } },
        ]).toArray();
    },

    async totalesPorPartido() {
        const db = getMongo();
        return db.collection('actas_rrv').aggregate([
            { $match: { estado: 'APROBADA', es_version_activa: { $ne: false } } },
            {
                $group: {
                    _id: null,
                    p1: { $sum: '$datos_interpretados.p1' },
                    p2: { $sum: '$datos_interpretados.p2' },
                    p3: { $sum: '$datos_interpretados.p3' },
                    p4: { $sum: '$datos_interpretados.p4' },
                    votos_blancos: { $sum: '$datos_interpretados.votos_blancos' },
                    votos_nulos: { $sum: '$datos_interpretados.votos_nulos' },
                    votos_emitidos: { $sum: '$datos_interpretados.votos_emitidos' },
                },
            },
        ]).toArray();
    },

    async ingresoPorHora() {
        const db = getMongo();
        return db.collection('actas_rrv').aggregate([
            {
                $group: {
                    _id: {
                        hora: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp_recepcion' } },
                        fuente: '$fuente',
                    },
                    cantidad: { $sum: 1 },
                },
            },
            { $sort: { '_id.hora': -1 } },
        ]).toArray();
    },

    async actaPorMesa(codigoMesa) {
        const db = getMongo();
        return db.collection('actas_rrv').findOne({
            codigo_mesa: codigoMesa,
            estado: 'APROBADA',
            es_version_activa: { $ne: false },
        });
    },

    // -------- CRUD / auditoría --------
    async listarActas({ limit = 50, estado, origen, mesa, soloActivas = false } = {}) {
        const db = getMongo();
        const filtro = {};
        if (estado) filtro.estado = estado;
        if (origen) filtro.fuente = origen;
        if (mesa) filtro.codigo_mesa = Number(mesa);
        if (soloActivas) filtro.es_version_activa = { $ne: false };

        return db.collection('actas_rrv')
            .find(filtro)
            .project({
                codigo_mesa: 1, fuente: 1, estado: 1,
                es_version_activa: 1, confianza_global: 1, motivo_estado: 1,
                timestamp_recepcion: 1, ingreso_numero: 1,
                'datos_interpretados.votos_emitidos': 1,
                'datos_interpretados.p1': 1, 'datos_interpretados.p2': 1,
                'datos_interpretados.p3': 1, 'datos_interpretados.p4': 1,
                'datos_interpretados.votos_blancos': 1,
                'datos_interpretados.votos_nulos': 1,
            })
            .sort({ timestamp_recepcion: -1 })
            .limit(limit)
            .toArray();
    },

    async cambiarEstadoActa(id, estado, motivo, modificadoPor) {
        const db = getMongo();
        const { ObjectId } = await import('mongodb');
        const _id = typeof id === 'string' ? new ObjectId(id) : id;
        const resultado = await db.collection('actas_rrv').findOneAndUpdate(
            { _id },
            { $set: {
                estado,
                motivo_estado: motivo || null,
                modificado_en: new Date(),
                modificado_por: modificadoPor || 'admin_web',
                ...(estado === 'RECHAZADA' || estado === 'EN_OBSERVACION' ? { es_version_activa: false } : {}),
            } },
            { returnDocument: 'after' }
        );
        // MongoDB driver v5+ retorna el documento directo; v4 lo envuelve en .value
        return resultado?.value ?? resultado ?? null;
    },

    async eventosRecientes(limit = 100, tipo) {
        const db = getMongo();
        const filtro = tipo ? { tipo_error: tipo } : {};
        return db.collection('logs_rrv')
            .find(filtro)
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    },

    async resumenPorOrigen() {
        const db = getMongo();
        return db.collection('actas_rrv').aggregate([
            { $group: { _id: { fuente: '$fuente', estado: '$estado' }, cantidad: { $sum: 1 } } },
        ]).toArray();
    },
};
