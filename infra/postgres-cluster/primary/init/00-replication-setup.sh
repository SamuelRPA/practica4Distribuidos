#!/bin/bash
# Crea el usuario de replicaciÃƒÂ³n. Postgres ejecuta cualquier *.sh y *.sql en
# /docker-entrypoint-initdb.d/ despuÃƒÂ©s de inicializar el cluster.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE ${POSTGRES_REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${POSTGRES_REPLICATION_PASSWORD}';

    -- Slots de replicaciÃƒÂ³n (uno por standby) Ã¢â‚¬â€ evitan que se pierda WAL
    SELECT pg_create_physical_replication_slot('standby_1_slot');
    SELECT pg_create_physical_replication_slot('standby_2_slot');
EOSQL

echo "[primary-init] Usuario de replicaciÃƒÂ³n y slots creados."
