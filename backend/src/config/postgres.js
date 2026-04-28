// Dos pools: escrituras al primary, lecturas a los standbys (CQRS).
import pkg from 'pg';
import { config } from './env.js';

const { Pool } = pkg;

export const pgWrite = new Pool({
    host: config.postgres.host,
    port: config.postgres.portWrite,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

export const pgRead = new Pool({
    host: config.postgres.host,
    port: config.postgres.portRead,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pgWrite.on('error', (err) => console.error('[pg-write] error:', err.message));
pgRead.on('error', (err) => console.error('[pg-read] error:', err.message));

export async function pingPostgres() {
    const w = await pgWrite.query('SELECT pg_is_in_recovery() AS recovery, current_database() AS db');
    const r = await pgRead.query('SELECT pg_is_in_recovery() AS recovery');
    console.log(`[postgres] write -> recovery=${w.rows[0].recovery} db=${w.rows[0].db}`);
    console.log(`[postgres] read  -> recovery=${r.rows[0].recovery}`);
}
