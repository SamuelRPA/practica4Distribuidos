import { MongoClient } from 'mongodb';

async function main() {
    console.log('[reset] Conectando a MongoDB Atlas para limpieza rápida...');
    const uri = process.env.MONGO_URI || 'mongodb+srv://samuelito45:10n4XFfT8Kx5V3Q7@cluster0.dzwxwhk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('electoral_rrv');
        
        const collections = ['actas_rrv', 'logs_rrv', 'sms_mensajes_recibidos', 'sms_numeros_autorizados'];
        for (const col of collections) {
            await db.collection(col).deleteMany({});
            console.log(`  ✓ Colección "${col}" limpia.`);
        }
    } catch (err) {
        console.error('  ✗ Error en MongoDB:', err.message);
    } finally {
        await client.close();
        console.log('[reset] MongoDB ha sido completamente vaciado.');
    }
}

main();
