import fs from 'fs';
import path from 'path';
import { pgWrite } from '../src/config/postgres.js';

const DATA_DIR = path.join(process.cwd(), '..', 'Data');

async function loadTerritory() {
    console.log('[load] Cargando Distribución Territorial...');
    const content = fs.readFileSync(path.join(DATA_DIR, '_Recursos Practica 4 - DistribucionTerritorial.csv'), 'utf8');
    const lines = content.trim().split('\n').slice(1);
    
    for (const line of lines) {
        if (!line.trim()) continue;
        const [codigo, depto, muni, prov] = line.split(',').map(s => s.trim());
        await pgWrite.query(
            'INSERT INTO distribucion_territorial (codigo_territorial, departamento, provincia, municipio) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [codigo, depto, prov, muni]
        );
    }
    console.log(`  ✓ ${lines.length} registros territoriales cargados.`);
}

async function loadRecintos() {
    console.log('[load] Cargando Recintos Electorales...');
    const content = fs.readFileSync(path.join(DATA_DIR, '_Recursos Practica 4 - RecintosElectorales.csv'), 'utf8');
    const lines = content.trim().split('\n').slice(1);
    
    for (const line of lines) {
        if (!line.trim()) continue;
        // recintoCode,CodigoTerritorial,CodigoRecinto,RecintoNombre,RecintoDireccion,NumMesas
        const parts = line.split(',').map(s => s.trim());
        const id_recinto = parts[2];
        const cod_territorial = parts[1];
        const nombre = parts[3];
        const direccion = parts[4];
        
        await pgWrite.query(
            'INSERT INTO recintos_electorales (id_recinto, codigo_territorial, nombre, direccion) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [id_recinto, cod_territorial, nombre, direccion]
        );
    }
    console.log(`  ✓ ${lines.length} recintos cargados.`);
}

async function loadMesas() {
    console.log('[load] Cargando Mesas Electorales...');
    const content = fs.readFileSync(path.join(DATA_DIR, '_Recursos Practica 4 - ActasImpresas.csv'), 'utf8');
    const lines = content.trim().split('\n').slice(1);
    
    for (const line of lines) {
        if (!line.trim()) continue;
        // CodigoRecinto,CodigoActa,NroMesa,VotantesHabilitados
        const [id_recinto, codigo_mesa, nro_mesa, habilitados] = line.split(',').map(s => s.trim());
        try {
            await pgWrite.query(
                'INSERT INTO mesas_electorales (codigo_mesa, id_recinto, nro_mesa, cantidad_habilitada) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                [codigo_mesa, id_recinto, nro_mesa, habilitados]
            );
        } catch (err) {
            console.error(`  ✗ Error en mesa ${codigo_mesa} (Recinto ${id_recinto}): ${err.message}`);
        }
    }
    console.log(`  ✓ ${lines.length} mesas cargadas.`);
}

async function main() {
    try {
        console.log('\n=== INICIANDO CARGA DE PADRÓN ELECTORAL ===\n');
        await loadTerritory();
        await loadRecintos();
        await loadMesas();
        console.log('\n=== CARGA COMPLETADA CON ÉXITO ===\n');
    } catch (err) {
        console.error('\n✗ Error durante la carga:', err.message);
    } finally {
        await pgWrite.end();
        process.exit(0);
    }
}

main();
