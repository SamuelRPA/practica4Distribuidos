/**
 * carga-completa.mjs — Script maestro de carga electoral
 * 
 * Ejecuta en orden:
 *   1. Limpia PostgreSQL y MongoDB
 *   2. Carga Distribución Territorial
 *   3. Carga Recintos Electorales
 *   4. Carga Mesas Electorales (padrón)
 *   5. Carga Votos Oficiales (Transcripciones CSV)
 *   6. [Opcional] Lanza carga de PDFs al pipeline OCR
 * 
 * Uso:
 *   node --env-file=../.env scripts/carga-completa.mjs
 *   node --env-file=../.env scripts/carga-completa.mjs --sin-pdfs
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { MongoClient } from 'mongodb';
import { pgWrite } from '../src/config/postgres.js';

const DATA_DIR = path.join(process.cwd(), '..', 'Data');
const ARGS = process.argv.slice(2);
const SIN_PDFS = ARGS.includes('--sin-pdfs');

// ─── Colores para la consola ─────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m', magenta: '\x1b[35m',
};

function titulo(n, txt) {
    console.log(`\n${C.bold}${C.cyan}━━━━ PASO ${n}: ${txt} ━━━━${C.reset}`);
}
function ok(txt) { console.log(`  ${C.green}✓${C.reset} ${txt}`); }
function err(txt) { console.log(`  ${C.red}✗${C.reset} ${txt}`); }
function info(txt) { console.log(`  ${C.gray}→${C.reset} ${txt}`); }

function barra(actual, total, ancho = 30) {
    const pct = total > 0 ? actual / total : 0;
    const lleno = Math.round(pct * ancho);
    const bar = '█'.repeat(lleno) + '░'.repeat(ancho - lleno);
    const pctStr = (pct * 100).toFixed(1).padStart(5);
    return `[${bar}] ${pctStr}% (${actual}/${total})`;
}

// ─── PASO 1: Limpiar bases de datos ──────────────────────────────────────────
async function limpiarPostgres() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123@127.0.0.1:5432/electoral_oficial'
    });
    await client.connect();
    await client.query('TRUNCATE TABLE votos_oficiales RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE logs_oficial RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE transcripciones_pendientes RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE sesiones_transcripcion RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE mesas_electorales RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE recintos_electorales RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE distribucion_territorial RESTART IDENTITY CASCADE');
    await client.end();
}

async function limpiarMongo() {
    const uri = process.env.MONGO_URI;
    if (!uri) { err('MONGO_URI no definida'); return; }
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('electoral_rrv');
    for (const col of ['actas_rrv', 'logs_rrv', 'sms_mensajes_recibidos', 'sms_numeros_autorizados']) {
        await db.collection(col).deleteMany({});
        info(`Colección "${col}" vaciada`);
    }
    await client.close();
}

// ─── PASO 2: Distribución Territorial ────────────────────────────────────────
async function cargarTerritorial() {
    const content = fs.readFileSync(
        path.join(DATA_DIR, '_Recursos Practica 4 - DistribucionTerritorial.csv'), 'utf8'
    );
    const lines = content.trim().split('\n').slice(1).filter(l => l.trim());
    let n = 0;
    for (const line of lines) {
        const [codigo, depto, muni, prov] = line.split(',').map(s => s.trim());
        await pgWrite.query(
            'INSERT INTO distribucion_territorial (codigo_territorial, departamento, provincia, municipio) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [codigo, depto, prov, muni]
        );
        n++;
    }
    return n;
}

// ─── PASO 3: Recintos Electorales ────────────────────────────────────────────
async function cargarRecintos() {
    const content = fs.readFileSync(
        path.join(DATA_DIR, '_Recursos Practica 4 - RecintosElectorales.csv'), 'utf8'
    );
    const lines = content.trim().split('\n').slice(1).filter(l => l.trim());
    let n = 0;
    for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        await pgWrite.query(
            'INSERT INTO recintos_electorales (id_recinto, codigo_territorial, nombre, direccion) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [parts[2], parts[1], parts[3], parts[4]]
        );
        n++;
    }
    return n;
}

// ─── PASO 4: Mesas Electorales ───────────────────────────────────────────────
async function cargarMesas() {
    const content = fs.readFileSync(
        path.join(DATA_DIR, '_Recursos Practica 4 - ActasImpresas.csv'), 'utf8'
    );
    const lines = content.trim().split('\n').slice(1).filter(l => l.trim());
    let ok_n = 0, skip = 0;
    for (const line of lines) {
        const [id_recinto, codigo_mesa, nro_mesa, habilitados] = line.split(',').map(s => s.trim());
        try {
            await pgWrite.query(
                'INSERT INTO mesas_electorales (codigo_mesa, id_recinto, nro_mesa, cantidad_habilitada) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                [codigo_mesa, id_recinto, nro_mesa, habilitados]
            );
            ok_n++;
        } catch { skip++; }
    }
    return { ok: ok_n, skip };
}

// ─── PASO 5: Votos Oficiales (Transcripciones) ───────────────────────────────
async function cargarTranscripciones() {
    const content = fs.readFileSync(
        path.join(DATA_DIR, '_Recursos Practica 4 - Transcripciones.csv'), 'utf8'
    );
    const lines = content.trim().split('\n').slice(1).filter(l => l.trim());
    const TOTAL = lines.length;
    let cargados = 0, omitidos = 0;
    
    process.stdout.write(`\r  ${barra(0, TOTAL)}`);

    for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        const codigo_mesa = parts[8];
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
                (codigo_mesa, habilitados, votos_emitidos, ausentismo, p1, p2, p3, p4,
                 votos_blancos, votos_nulos, apertura_hora, apertura_minutos,
                 cierre_hora, cierre_minutos, estado, fuente, creado_por) 
                VALUES ($1::bigint,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'APROBADA','CSV','carga-completa')`,
                [codigo_mesa, habilitados, ve, ausentismo, p1, p2, p3, p4,
                 blancos, nulos, ap_h, ap_m, ci_h, ci_m]
            );
            cargados++;
        } catch { omitidos++; }

        if ((cargados + omitidos) % 50 === 0) {
            process.stdout.write(`\r  ${barra(cargados + omitidos, TOTAL)}`);
        }
    }
    process.stdout.write(`\r  ${barra(TOTAL, TOTAL)}\n`);
    return { cargados, omitidos };
}

// ─── PASO 6: PDFs → Pipeline OCR ─────────────────────────────────────────────
async function cargarPDFs() {
    const PDF_DIR = path.join(DATA_DIR, 'pdf');
    const BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:3001';
    
    if (!fs.existsSync(PDF_DIR)) {
        err(`Directorio PDF no encontrado: ${PDF_DIR}`);
        return { total: 0, enviados: 0, errores: 0 };
    }

    const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
    const TOTAL = files.length;
    let enviados = 0, errores = 0;
    
    process.stdout.write(`\r  ${barra(0, TOTAL)}`);

    for (const file of files) {
        const mesaMatch = file.match(/acta_(\d+)\.pdf/);
        if (!mesaMatch) continue;

        const codigoMesa = mesaMatch[1];
        const filePath = path.join(PDF_DIR, file);

        try {
            const blob = new Blob([fs.readFileSync(filePath)], { type: 'application/pdf' });
            const fd = new FormData();
            fd.append('file', blob, file);
            fd.append('codigo_mesa', codigoMesa);

            const res = await fetch(`${BASE_URL}/api/rrv/acta-pdf`, { method: 'POST', body: fd });
            if (res.status === 202 || res.status === 200) enviados++;
            else errores++;
        } catch { errores++; }

        if ((enviados + errores) % 10 === 0) {
            process.stdout.write(`\r  ${barra(enviados + errores, TOTAL)} | OK:${enviados} ERR:${errores}`);
        }
    }
    process.stdout.write(`\r  ${barra(TOTAL, TOTAL)} | OK:${enviados} ERR:${errores}\n`);
    return { total: TOTAL, enviados, errores };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
    const inicio = Date.now();
    console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════╗`);
    console.log(`║   CARGA COMPLETA — Sistema Electoral Bolivia         ║`);
    console.log(`╚══════════════════════════════════════════════════════╝${C.reset}`);
    if (SIN_PDFS) info('Modo: sin carga de PDFs (--sin-pdfs)');

    try {
        // PASO 1: Limpieza
        titulo(1, 'Limpiando bases de datos');
        await limpiarPostgres();
        ok('PostgreSQL vaciado');
        await limpiarMongo();
        ok('MongoDB vaciado');

        // PASO 2: Territorio
        titulo(2, 'Distribución Territorial');
        const nTerr = await cargarTerritorial();
        ok(`${nTerr} registros territoriales`);

        // PASO 3: Recintos
        titulo(3, 'Recintos Electorales');
        const nRec = await cargarRecintos();
        ok(`${nRec} recintos`);

        // PASO 4: Mesas
        titulo(4, 'Mesas Electorales (Padrón)');
        const { ok: nMesas, skip: skMesas } = await cargarMesas();
        ok(`${nMesas} mesas insertadas`);
        if (skMesas > 0) info(`${skMesas} mesas omitidas (recinto sin FK)`);

        // PASO 5: Cómputo Oficial
        titulo(5, 'Cómputo Oficial — Transcripciones CSV');
        const { cargados, omitidos } = await cargarTranscripciones();
        ok(`${cargados} actas oficiales cargadas`);
        if (omitidos > 0) info(`${omitidos} omitidas (mesas no en padrón)`);

        // PASO 6: Cómputo Rápido (PDFs)
        if (!SIN_PDFS) {
            titulo(6, 'Cómputo Rápido — PDFs → Pipeline OCR');
            info('Asegúrate de que el OCR service esté corriendo en :5000');
            info('Asegúrate de que el Backend esté corriendo en :3001');
            const { total, enviados, errores } = await cargarPDFs();
            ok(`${enviados}/${total} PDFs enviados al pipeline OCR`);
            if (errores > 0) err(`${errores} PDFs fallaron (¿está corriendo el backend?)`);
            info('Los PDFs se procesarán en segundo plano vía RabbitMQ + OCR service');
        }

        const seg = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`\n${C.bold}${C.green}╔══════════════════════════════════════════════════════╗`);
        console.log(`║   ✓ CARGA COMPLETA FINALIZADA en ${String(seg + 's').padEnd(18)} ║`);
        console.log(`╚══════════════════════════════════════════════════════╝${C.reset}\n`);

    } catch (e) {
        console.error(`\n${C.red}✗ Error fatal: ${e.message}${C.reset}`);
        console.error(e.stack);
        process.exit(1);
    } finally {
        await pgWrite.end();
        process.exit(0);
    }
})();
