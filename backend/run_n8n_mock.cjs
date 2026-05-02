const fs = require('fs');
const csv = require('csv-parser');

const url = 'http://localhost:3001/api/oficial/acta';

async function main() {
    const rows = [];
    fs.createReadStream('../Data/Recursos Practica 4 - Transcripciones.csv')
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', async () => {
          let count = 0;
          for (const row of rows) {
              try {
                  await fetch(url, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                              codigo_mesa: row.CodigoActa,
                              votos_emitidos: row.PapeletasAnfora,
                              ausentismo: Number(row.VotantesHabilitados) - Number(row.PapeletasAnfora),
                              p1: row.P1,
                              p2: row.P2,
                              p3: row.P3,
                              p4: row.P4,
                              votos_blancos: row.VotosBlancos,
                              votos_nulos: row.VotosNulos,
                              apertura_hora: row.AperturaHora,
                              apertura_minutos: row.AperturaMinutos,
                              cierre_hora: row.CierreHora,
                              cierre_minutos: row.CierreMinutos,
                              observaciones: row.Observaciones,
                              fuente: 'N8N',
                              creado_por: 'pas00034109@est.univalle.edu'
                          })
                  });
                  count++;
              } catch (e) {
                  console.error('Error posting', row.CodigoActa, e.message);
              }
              if (count % 500 === 0) console.log(`Processed ${count} rows...`);
          }
          console.log(`Finished! Successfully POSTed ${count} actas as N8N.`);
      });
}
main();
