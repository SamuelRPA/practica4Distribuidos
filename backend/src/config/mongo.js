import { MongoClient } from 'mongodb';
import { config } from './env.js';

let client = null;
let db = null;

export async function connectMongo() {
    if (client) return db;

    client = new MongoClient(config.mongo.uri, {
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(config.mongo.dbName);

    // Asegurar índices críticos
    await db.collection('actas_rrv').createIndex({ codigo_mesa: 1 });
    await db.collection('actas_rrv').createIndex({ hash_contenido: 1 }, { unique: false });
    await db.collection('actas_rrv').createIndex({ estado: 1 });
    await db.collection('actas_rrv').createIndex({ timestamp_recepcion: -1 });
    await db.collection('logs_rrv').createIndex({ timestamp: -1 });
    await db.collection('logs_rrv').createIndex({ tipo_error: 1 });

    console.log('[mongo] Conectado a Atlas — BD:', config.mongo.dbName);
    return db;
}

export function getMongo() {
    if (!db) throw new Error('Mongo no inicializado. Llama connectMongo() primero.');
    return db;
}

export async function closeMongo() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}
