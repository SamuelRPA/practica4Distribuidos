import { Client } from 'pg';
import { MongoClient } from 'mongodb';

// El script se debe ejecutar con node --env-file=../.env scripts/reset-all.js

async function resetPostgres() {
    console.log('[reset] Conectando a PostgreSQL...');
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123@127.0.0.1:5432/electoral_oficial'
    });
    
    try {
        await client.connect();
        console.log('[reset] Limpiando tablas de PostgreSQL...');
        await client.query('TRUNCATE TABLE votos_oficiales RESTART IDENTITY CASCADE');
        await client.query('TRUNCATE TABLE logs_oficial RESTART IDENTITY CASCADE');
        await client.query('TRUNCATE TABLE transcripciones_pendientes RESTART IDENTITY CASCADE');
        await client.query('TRUNCATE TABLE sesiones_transcripcion RESTART IDENTITY CASCADE');
        console.log('  ✓ PostgreSQL limpio.');
    } catch (err) {
        console.error('  ✗ Error en PostgreSQL:', err.message);
    } finally {
        await client.end();
    }
}

async function resetMongo() {
    console.log('[reset] Conectando a MongoDB Atlas...');
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('  ✗ MONGO_URI no definida en .env');
        return;
    }
    
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('electoral_rrv');
        console.log('[reset] Limpiando colecciones de MongoDB...');
        
        const collections = ['actas', 'sms_logs', 'ocr_results'];
        for (const col of collections) {
            await db.collection(col).deleteMany({});
            console.log(`  ✓ Colección "${col}" limpia.`);
        }
    } catch (err) {
        console.error('  ✗ Error en MongoDB:', err.message);
    } finally {
        await client.close();
    }
}

async function main() {
    console.log('\n=== REINICIO TOTAL DE BASES DE DATOS ===\n');
    await resetPostgres();
    console.log('----------------------------------------');
    await resetMongo();
    console.log('\n=== TODO LIMPIO Y LISTO PARA NUEVAS PRUEBAS ===\n');
}

main();
