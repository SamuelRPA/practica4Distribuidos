const fs = require('fs');
const { Client } = require('pg');
const csv = require('csv-parser');

const client = new Client({user: 'postgres', host: '127.0.0.1', database: 'electoral_oficial', password: '123', port: 5432});

async function main() {
    await client.connect();
    // clear first
    await client.query('DELETE FROM votos_oficiales');
    const rows = [];
    fs.createReadStream('../Data/Recursos Practica 4 - Transcripciones.csv')
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', async () => {
          let count = 0;
          for (const row of rows) {
              const emitidos = parseInt(row.P1||0) + parseInt(row.P2||0) + parseInt(row.P3||0) + parseInt(row.P4||0) + parseInt(row.VotosBlancos||0) + parseInt(row.VotosNulos||0);
              const ah = parseInt(row.AperturaHora) || 8;
              const am = parseInt(row.AperturaMinutos) || 0;
              const ch = parseInt(row.CierreHora) || 16;
              const cm = parseInt(row.CierreMinutos) || 0;
              const dur = (ch * 60 + cm) - (ah * 60 + am);
              
              await client.query(`
                  INSERT INTO votos_oficiales 
                  (codigo_mesa, habilitados, votos_emitidos, ausentismo, p1, p2, p3, p4, votos_blancos, votos_nulos, apertura_hora, apertura_minutos, cierre_hora, cierre_minutos, duracion_minutos, estado, fuente, creado_por)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'APROBADA', 'MANUAL', 'SISTEMA')
              `, [
                  row.CodigoActa, row.VotantesHabilitados, emitidos, 
                  parseInt(row.VotantesHabilitados) - emitidos, 
                  row.P1, row.P2, row.P3, row.P4, row.VotosBlancos, row.VotosNulos,
                  ah, am, ch, cm, dur
              ]);
              count++;
          }
          console.log(`Loaded ${count} votes.`);
          await client.end();
      });
}
main();
