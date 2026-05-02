import fs from 'fs';
import path from 'path';
import { pgWrite } from '../src/config/postgres.js';

const DATA_DIR = path.join(process.cwd(), '..', 'Data');

async function main() {
    console.log('\n=== CARGANDO TRANSCRIPCIONES (INDIVIDUAL RESILIENTE) ===\n');
    const content = fs.readFileSync(path.join(DATA_DIR, '_Recursos Practica 4 - Transcripciones.csv'), 'utf8');
    const lines = content.trim().split('\n').slice(1);
    
    let cargados = 0;
    let omitidos = 0;

    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',').map(s => s.trim());
        
        const codigo_mesa = parts[7]; 
        const habilitados = parseInt(parts[10]) || 0;
        const ve = parseInt(parts[11]) || 0;
        const p1 = parseInt(parts[13]) || 0;
        const p2 = parseInt(parts[14]) || 0;
        const p3 = parseInt(parts[15]) || 0;
        const p4 = parseInt(parts[16]) || 0;
        const blancos = parseInt(parts[18]) || 0;
        const nulos = parseInt(parts[19]) || 0;
        const ap_h = parseInt(parts[22]) || 8;
        const ap_m = parseInt(parts[23]) || 0;
        const ci_h = parseInt(parts[24]) || 16;
        const ci_m = parseInt(parts[25]) || 0;
        const ausentismo = habilitados - ve;

        try {
            await pgWrite.query(`
                INSERT INTO votos_oficiales 
                (codigo_mesa, habilitados, votos_emitidos, ausentismo, p1, p2, p3, p4, votos_blancos, votos_nulos, 
                 apertura_hora, apertura_minutos, cierre_hora, cierre_minutos, estado, fuente, creado_por) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'APROBADA', 'N8N', 'antigravity')`,
                [codigo_mesa, habilitados, ve, ausentismo, p1, p2, p3, p4, blancos, nulos, ap_h, ap_m, ci_h, ci_m]
            );
            cargados++;
        } catch (err) {
            omitidos++;
        }
        
        if ((cargados + omitidos) % 500 === 0) {
            console.log(`  Procesadas ${cargados + omitidos} filas...`);
        }
    }

    console.log(`\n✓ ${cargados} actas cargadas.`);
    console.log(`✗ ${omitidos} omitidas (posible mesa inexistente en padrón).`);
    console.log('\n=== PROCESO FINALIZADO ===\n');
    await pgWrite.end();
    process.exit(0);
}

main();
