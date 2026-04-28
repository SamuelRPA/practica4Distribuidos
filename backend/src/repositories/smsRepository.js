// Persistencia de números autorizados y mensajes recibidos.
// Mongo es ideal acá: schema flexible (cada proveedor manda payload distinto),
// y el dashboard sólo necesita lecturas rápidas.
import { ObjectId } from 'mongodb';
import { getMongo } from '../config/mongo.js';

export const smsRepo = {
    // ---------- Números autorizados ----------
    async listarNumeros() {
        const db = getMongo();
        return db.collection('sms_numeros_autorizados')
            .find()
            .sort({ creado_en: -1 })
            .toArray();
    },

    async agregarNumero({ numero, etiqueta, recinto, proveedor }) {
        const db = getMongo();
        const doc = {
            numero,
            etiqueta: etiqueta || null,
            recinto: recinto || null,
            proveedor: proveedor || 'GENERICO', // 'TWILIO' | 'TELEGRAM' | 'WHATSAPP' | 'GENERICO'
            activo: true,
            creado_en: new Date(),
        };
        await db.collection('sms_numeros_autorizados').updateOne(
            { numero },
            { $set: doc },
            { upsert: true }
        );
        return doc;
    },

    async eliminarNumero(id) {
        const db = getMongo();
        return db.collection('sms_numeros_autorizados').deleteOne({ _id: new ObjectId(id) });
    },

    async toggleActivo(id, activo) {
        const db = getMongo();
        return db.collection('sms_numeros_autorizados').updateOne(
            { _id: new ObjectId(id) },
            { $set: { activo: !!activo, modificado_en: new Date() } }
        );
    },

    async numeroEstaAutorizado(numero) {
        const db = getMongo();
        const doc = await db.collection('sms_numeros_autorizados').findOne({ numero, activo: true });
        return !!doc;
    },

    // ---------- Mensajes recibidos (auditoría) ----------
    async registrarMensaje({ proveedor, numero_origen, texto, payload_raw, codigo_mesa, resultado }) {
        const db = getMongo();
        const doc = {
            proveedor,
            numero_origen,
            texto,
            payload_raw,
            codigo_mesa: codigo_mesa || null,
            resultado: resultado || null,
            timestamp: new Date(),
        };
        const r = await db.collection('sms_mensajes_recibidos').insertOne(doc);
        return r.insertedId;
    },

    async listarMensajesRecientes(limit = 50) {
        const db = getMongo();
        return db.collection('sms_mensajes_recibidos')
            .find()
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    },
};
