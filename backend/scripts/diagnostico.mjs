import fs from 'fs';
import path from 'path';
import { pgWrite } from '../src/config/postgres.js';

const DATA_DIR = path.join(process.cwd(), '..', 'Data');

const content = fs.readFileSync(
    path.join(DATA_DIR, '_Recursos Practica 4 - Transcripciones.csv'), 'utf8'
);
const lines = content.trim().split('\n').slice(1).filter(l => l.trim());

// Probar con la primera línea
const firstLine = lines[0];
console.log('Primera línea:', firstLine.substring(0, 120));
const parts = firstLine.split(',').map(s => s.trim());
console.log('Partes [7,8,9,10,11]:', parts[7], parts[8], parts[9], parts[10], parts[11]);

const codigo_mesa = parts[8]; // CodigoActa está en índice 8
const nro_mesa = parts[9];
const habilitados = parseInt(parts[10]) || 0;
const ve = parseInt(parts[11]) || 0;
const p1 = parseInt(parts[13]) || 0;
const p2 = parseInt(parts[14]) || 0;
const p3 = parseInt(parts[15]) || 0;
const p4 = parseInt(parts[16]) || 0;
const blancos = parseInt(parts[18]) || 0;
const nulos = parseInt(parts[19]) || 0;

console.log('codigo_mesa:', codigo_mesa, '| habilitados:', habilitados, '| ve:', ve);

try {
    await pgWrite.query(`
        INSERT INTO votos_oficiales 
        (codigo_mesa, habilitados, votos_emitidos, ausentismo, p1, p2, p3, p4,
         votos_blancos, votos_nulos, estado, fuente, creado_por) 
        VALUES ($1::bigint,$2,$3,$4,$5,$6,$7,$8,$9,$10,'APROBADA','CSV','test')`,
        [codigo_mesa, habilitados, ve, habilitados-ve, p1, p2, p3, p4, blancos, nulos]
    );
    console.log('✓ INSERT EXITOSO!');
} catch(e) {
    console.log('✗ Error:', e.message);
    console.log('  Detalle:', e.detail);
}

await pgWrite.end();
process.exit(0);
