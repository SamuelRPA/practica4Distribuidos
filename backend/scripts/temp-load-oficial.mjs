import { pgWrite } from '../src/config/postgres.js';

async function main() {
  const mesas = [1010200001001, 1010200001002, 1010200001003, 1010200001004, 1010200001005];
  for (const m of mesas) {
    try {
      const resMesa = await pgWrite.query('SELECT cantidad_habilitada FROM mesas_electorales WHERE codigo_mesa = $1', [m]);
      const hab = resMesa.rows[0]?.cantidad_habilitada || 200;

      await pgWrite.query(`
          INSERT INTO votos_oficiales 
          (codigo_mesa, habilitados, votos_emitidos, p1, p2, p3, p4, votos_blancos, votos_nulos, estado, fuente, creado_por) 
          VALUES ($1, $2, $3, 10, 20, 30, 40, 5, 5, 'APROBADA', 'MANUAL', 'antigravity') 
          ON CONFLICT DO NOTHING`, [m, hab, 110]);
      console.log(`[oficial] Mesa ${m} cargada.`);
    } catch (err) {
      console.error(`[oficial] Error mesa ${m}:`, err.message);
    }
  }
  console.log('✅ Datos oficiales cargados.');
  process.exit(0);
}

main();
