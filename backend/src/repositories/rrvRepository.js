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
};
