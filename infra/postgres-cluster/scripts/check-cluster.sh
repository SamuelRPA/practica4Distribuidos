#!/bin/bash
# Muestra el estado del cluster — quién es primary, quién standby, lag de replicación.

echo "===== Estado del cluster Postgres ====="
echo ""

for n in pg_primary pg_standby_1 pg_standby_2; do
    if ! docker ps --format '{{.Names}}' | grep -q "^${n}$"; then
        echo "  $n: DOWN (contenedor no corriendo)"
        continue
    fi

    IN_RECOVERY=$(docker exec "$n" psql -U oep_admin -d electoral_oficial -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "ERROR")

    case "$IN_RECOVERY" in
        f) echo "  $n: PRIMARY (acepta escrituras)" ;;
        t) echo "  $n: STANDBY (solo lectura)" ;;
        *) echo "  $n: $IN_RECOVERY" ;;
    esac
done

echo ""
echo "===== Replicación desde el primary actual ====="

# Buscar quién es primary
for n in pg_primary pg_standby_1 pg_standby_2; do
    IN_RECOVERY=$(docker exec "$n" psql -U oep_admin -d electoral_oficial -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "")
    if [ "$IN_RECOVERY" = "f" ]; then
        echo "Primary detectado: $n"
        docker exec "$n" psql -U oep_admin -d electoral_oficial -c "
            SELECT application_name, client_addr, state, sync_state,
                   EXTRACT(EPOCH FROM (now() - reply_time))::INT AS lag_segs
            FROM pg_stat_replication;"
        break
    fi
done
