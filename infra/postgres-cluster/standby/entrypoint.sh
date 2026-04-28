#!/bin/bash
# Entrypoint custom para los nodos standby.
# 1. Si el data dir está vacío, hace pg_basebackup desde el primary.
# 2. Crea standby.signal para que arranque en modo standby.
# 3. Configura recovery (primary_conninfo).
# 4. Lanza el postgres normal.
set -e

DATA_DIR="/var/lib/postgresql/data"

# Determinar qué slot usar según hostname
SLOT_NAME="standby_$(echo $HOSTNAME | grep -o '[0-9]*$')_slot"

if [ -z "$(ls -A $DATA_DIR 2>/dev/null)" ]; then
    echo "[standby-entrypoint] Data dir vacío, ejecutando pg_basebackup desde ${PG_PRIMARY_HOST}..."

    # Esperar al primary
    until pg_isready -h "${PG_PRIMARY_HOST}" -U "${POSTGRES_REPLICATION_USER}"; do
        echo "[standby-entrypoint] Esperando al primary..."
        sleep 2
    done

    export PGPASSWORD="${POSTGRES_REPLICATION_PASSWORD}"
    pg_basebackup \
        --host="${PG_PRIMARY_HOST}" \
        --username="${POSTGRES_REPLICATION_USER}" \
        --pgdata="${DATA_DIR}" \
        --wal-method=stream \
        --slot="${SLOT_NAME}" \
        --write-recovery-conf \
        --progress \
        --verbose

    # Crear archivo standby.signal (Postgres 12+ usa esto en lugar de recovery.conf)
    touch "${DATA_DIR}/standby.signal"

    # Configurar conexión al primary
    cat >> "${DATA_DIR}/postgresql.auto.conf" <<EOF
primary_conninfo = 'host=${PG_PRIMARY_HOST} port=5432 user=${POSTGRES_REPLICATION_USER} password=${POSTGRES_REPLICATION_PASSWORD} application_name=${HOSTNAME}'
primary_slot_name = '${SLOT_NAME}'
hot_standby = on
EOF

    chmod 0700 "${DATA_DIR}"
    chown -R postgres:postgres "${DATA_DIR}"

    echo "[standby-entrypoint] Base backup completo. Iniciando como standby."
fi

# Lanzar postgres como usuario postgres
exec su postgres -c "postgres -D ${DATA_DIR}"
