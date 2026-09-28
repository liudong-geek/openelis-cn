#!/usr/bin/env bash

# Loads the synthetic Chinese tertiary-hospital showcase dataset.
# The target must be the explicitly named disposable E2E database.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_FILES=()
CHECK_ONLY=false
while getopts "f:nh" opt; do
  case "$opt" in
    f) COMPOSE_FILES+=("-f" "$OPTARG") ;;
    n) CHECK_ONLY=true ;;
    h)
      cat <<'USAGE'
Usage:
  OPENELIS_E2E_COMPOSE_PROJECT=openelis-cn-e2e \
  OPENELIS_E2E_DB_CONTAINER=openelis-cn-e2e-database \
    ./scripts/load-cn-showcase-data.sh \
      -f build.docker-compose.yml -f docker-compose.e2e.yml -f docker-compose.demo.yml

Options:
  -f FILE  Compose file; repeat for every file in the active stack
  -n       Verify the disposable target without loading data
USAGE
      exit 0
      ;;
    *) exit 2 ;;
  esac
done

if [[ ${#COMPOSE_FILES[@]} -eq 0 ]]; then
  echo "ERROR: explicit Compose files are required." >&2
  exit 2
fi

E2E_DB_CONTAINER="${OPENELIS_E2E_DB_CONTAINER:-}"
E2E_COMPOSE_PROJECT="${OPENELIS_E2E_COMPOSE_PROJECT:-}"
DB_SERVICE="db.openelis.org"

if [[ -z "$E2E_DB_CONTAINER" || ! "$E2E_DB_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
  echo "ERROR: OPENELIS_E2E_DB_CONTAINER must name the disposable database container." >&2
  exit 2
fi
if [[ "$E2E_COMPOSE_PROJECT" != "openelis-cn-e2e" ]]; then
  echo "ERROR: the showcase loader only accepts project openelis-cn-e2e." >&2
  exit 2
fi

COMPOSE=(docker compose -p "$E2E_COMPOSE_PROJECT" "${COMPOSE_FILES[@]}")

TARGET_ID="$(docker inspect --format '{{.Id}}' "$E2E_DB_CONTAINER" 2>/dev/null || true)"
COMPOSE_ID="$("${COMPOSE[@]}" ps -q "$DB_SERVICE" 2>/dev/null || true)"
if [[ -z "$TARGET_ID" || -z "$COMPOSE_ID" || "$TARGET_ID" != "$COMPOSE_ID" ]]; then
  echo "ERROR: selected container is not the database service from the active Compose stack." >&2
  exit 2
fi

DISPOSABLE_VALUE="$(docker inspect --format '{{ index .Config.Labels "org.openelisglobal.e2e.disposable" }}' "$E2E_DB_CONTAINER")"
TARGET_PROJECT="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$E2E_DB_CONTAINER")"
TARGET_SERVICE="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$E2E_DB_CONTAINER")"
DATA_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$E2E_DB_CONTAINER")"

if [[ "$DISPOSABLE_VALUE" != "true" || "$TARGET_PROJECT" != "$E2E_COMPOSE_PROJECT" \
    || "$TARGET_SERVICE" != "$DB_SERVICE" || -z "$DATA_VOLUME" ]]; then
  echo "ERROR: selected database is not the verified disposable E2E target." >&2
  exit 2
fi

VOLUME_PROJECT="$(docker volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$DATA_VOLUME")"
VOLUME_KEY="$(docker volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$DATA_VOLUME")"
if [[ "$VOLUME_PROJECT" != "$E2E_COMPOSE_PROJECT" || "$VOLUME_KEY" != "e2e-db-data" ]]; then
  echo "ERROR: database volume is not the dedicated e2e-db-data volume." >&2
  exit 2
fi

echo "Verified disposable showcase database: $E2E_DB_CONTAINER ($DATA_VOLUME)."
if [[ "$CHECK_ONLY" == true ]]; then
  exit 0
fi

SQL_FILE="src/test/resources/e2e-cn-tertiary-showcase.sql"
if [[ ! -f "$SQL_FILE" ]]; then
  echo "ERROR: showcase SQL is missing: $SQL_FILE" >&2
  exit 2
fi

docker exec -i "$E2E_DB_CONTAINER" \
  psql -U clinlims -d clinlims --set=ON_ERROR_STOP=on < "$SQL_FILE"

docker exec "$E2E_DB_CONTAINER" psql -U clinlims -d clinlims --tuples-only --no-align \
  -c "SELECT 'patients=' || count(*) FROM clinlims.patient WHERE external_id LIKE 'DEMO-MZ-%';"
docker exec "$E2E_DB_CONTAINER" psql -U clinlims -d clinlims --tuples-only --no-align \
  -c "SELECT 'applications=' || count(*) FROM clinlims.sample WHERE accession_number LIKE 'HMC%';"
docker exec "$E2E_DB_CONTAINER" psql -U clinlims -d clinlims --tuples-only --no-align   -c "SELECT 'electronic_orders=' || count(*) FROM clinlims.electronic_order WHERE external_id LIKE 'HIS-DEMO-%';"
docker exec "$E2E_DB_CONTAINER" psql -U clinlims -d clinlims --tuples-only --no-align   -c "SELECT 'multi_tube_applications=' || count(*) FROM (SELECT samp_id FROM clinlims.sample_item WHERE external_id LIKE 'HMC%' GROUP BY samp_id HAVING count(*) > 1) t;"
echo "Synthetic Chinese showcase data loaded. No real patient data is present."
