const fs = require('fs');
const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'electoral_oficial',
  password: '123',
  port: 5432,
});

async function run() {
  await client.connect();
  const sql = fs.readFileSync('../infra/postgres-cluster/primary/init/01-schema.sql', 'utf8');
  await client.query(sql);
  console.log("Schema created successfully.");
  await client.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
