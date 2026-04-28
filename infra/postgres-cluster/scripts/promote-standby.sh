#!/bin/bash
# Promueve un standby a primary.
# Uso: ./promote-standby.sh pg_standby_1
set -e

CONTAINER="${1:-pg_standby_1}"

echo "[promote] Promoviendo $CONTAINER a primary..."
docker exec "$CONTAINER" su - postgres -c "pg_ctl promote -D /var/lib/postgresql/data"

sleep 3

echo "[promote] Verificando..."
IN_RECOVERY=$(docker exec "$CONTAINER" psql -U oep_admin -d electoral_oficial -tAc "SELECT pg_is_in_recovery();")

if [ "$IN_RECOVERY" = "f" ]; then
    echo "[promote] OK — $CONTAINER ahora es primary."
    echo "[promote] Actualiza .env: POSTGRES_PORT_WRITE=5442 (o el puerto del nuevo primary)."
    echo "[promote] Reinicia el backend para tomar el cambio."
else
    echo "[promote] FALLO — el nodo todavía está en recovery."
    exit 1
fi
