#!/bin/bash
#
# load-ci-fixtures.sh - Load the same test fixtures that CI loads (frontend-qa workflow)
#
# Usage:
#   OPENELIS_E2E_COMPOSE_PROJECT=openelis-cn-e2e \
#   OPENELIS_E2E_DB_CONTAINER=openelis-cn-e2e-database \
#     ./scripts/load-ci-fixtures.sh \
#       -f build.docker-compose.yml -f docker-compose.e2e.yml
#   OPENELIS_E2E_COMPOSE_PROJECT=openelis-cn-e2e \
#   OPENELIS_E2E_DB_CONTAINER=openelis-cn-e2e-database \
#     ./scripts/load-ci-fixtures.sh \
#       -f build.docker-compose.yml -f docker-compose.e2e.yml -n
#
# Loads:
#   src/test/resources/e2e-foundational-data.sql
#   src/test/resources/e2e-patient-entry-pagination.sql
#
# Prerequisites:
#   - Compose stack is up and db.openelis.org is healthy
#   - Run from repository root (or script resolves root)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_FILES=()
CHECK_ONLY=false
while getopts "f:nh" opt; do
  case $opt in
    f) COMPOSE_FILES+=("-f" "$OPTARG") ;;
    n) CHECK_ONLY=true ;;
    h)
      echo "Usage: OPENELIS_E2E_COMPOSE_PROJECT=PROJECT OPENELIS_E2E_DB_CONTAINER=NAME $0 -f COMPOSE_FILE [-f E2E_OVERRIDE] [-n]"
      echo "  -f COMPOSE_FILE  Compose file; repeat to include docker-compose.e2e.yml"
      echo "  -n               Verify the disposable database target without loading fixtures"
      echo ""
      echo "Loads same fixtures as CI (frontend-qa): foundational + patient-entry pagination"
      echo "The selected container must have Docker label org.openelisglobal.e2e.disposable=true."
      exit 0
      ;;
    *) exit 1 ;;
  esac
done

if [[ ${#COMPOSE_FILES[@]} -eq 0 ]]; then
  echo "ERROR: Explicit Compose files are required; include docker-compose.e2e.yml." >&2
  exit 2
fi

E2E_DB_CONTAINER="${OPENELIS_E2E_DB_CONTAINER:-}"
E2E_COMPOSE_PROJECT="${OPENELIS_E2E_COMPOSE_PROJECT:-}"
SVC="db.openelis.org"

if [[ -z "$E2E_DB_CONTAINER" ]]; then
  echo "ERROR: OPENELIS_E2E_DB_CONTAINER is required; refusing to select a database implicitly." >&2
  exit 2
fi
if [[ ! "$E2E_DB_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
  echo "ERROR: OPENELIS_E2E_DB_CONTAINER is not a valid Docker container name." >&2
  exit 2
fi
if [[ ! "$E2E_COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]{0,62}$ ]]; then
  echo "ERROR: OPENELIS_E2E_COMPOSE_PROJECT must be an explicit lowercase Compose project name." >&2
  exit 2
fi
if [[ "$E2E_COMPOSE_PROJECT" != "openelis-cn-e2e" && ! "$E2E_COMPOSE_PROJECT" =~ ^openelis-e2e-[a-z0-9_-]+$ ]]; then
  echo "ERROR: OPENELIS_E2E_COMPOSE_PROJECT must use the dedicated openelis-cn-e2e or openelis-e2e-* namespace." >&2
  exit 2
fi

COMPOSE=(docker compose -p "$E2E_COMPOSE_PROJECT" "${COMPOSE_FILES[@]}")

if ! TARGET_ID=$(docker inspect --format '{{.Id}}' "$E2E_DB_CONTAINER" 2>/dev/null); then
  echo "ERROR: Database container '$E2E_DB_CONTAINER' does not exist." >&2
  exit 2
fi
if ! COMPOSE_CONTAINER=$("${COMPOSE[@]}" ps -q "$SVC") || [[ -z "$COMPOSE_CONTAINER" ]]; then
  echo "ERROR: Compose service '$SVC' is not running for the selected Compose stack." >&2
  exit 2
fi
COMPOSE_ID=$(docker inspect --format '{{.Id}}' "$COMPOSE_CONTAINER")
if [[ "$TARGET_ID" != "$COMPOSE_ID" ]]; then
  echo "ERROR: '$E2E_DB_CONTAINER' is not the '$SVC' container from the selected Compose stack." >&2
  exit 2
fi

DISPOSABLE_VALUE=$(docker inspect --format '{{ index .Config.Labels "org.openelisglobal.e2e.disposable" }}' "$E2E_DB_CONTAINER")
TARGET_PROJECT=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$E2E_DB_CONTAINER")
TARGET_SERVICE=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$E2E_DB_CONTAINER")
if [[ "$DISPOSABLE_VALUE" != "true" || "$TARGET_PROJECT" != "$E2E_COMPOSE_PROJECT" || "$TARGET_SERVICE" != "$SVC" ]]; then
  echo "ERROR: '$E2E_DB_CONTAINER' is not the disposable $SVC container from project '$E2E_COMPOSE_PROJECT'; refusing database changes." >&2
  exit 2
fi

DATA_VOLUME=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$E2E_DB_CONTAINER")
if [[ -z "$DATA_VOLUME" ]]; then
  echo "ERROR: '$E2E_DB_CONTAINER' does not use a named database volume." >&2
  exit 2
fi
VOLUME_PROJECT=$(docker volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$DATA_VOLUME")
VOLUME_KEY=$(docker volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$DATA_VOLUME")
if [[ "$VOLUME_PROJECT" != "$E2E_COMPOSE_PROJECT" || "$VOLUME_KEY" != "e2e-db-data" ]]; then
  echo "ERROR: '$DATA_VOLUME' is not the dedicated e2e-db-data volume from project '$E2E_COMPOSE_PROJECT'." >&2
  exit 2
fi

echo "Verified disposable E2E database: $E2E_DB_CONTAINER."
if [[ "$CHECK_ONLY" == "true" ]]; then
  exit 0
fi

PSQL_OPTS=(-U clinlims -d clinlims --set=ON_ERROR_STOP=on)

echo "Loading CI fixtures into the verified disposable database..."
docker exec -i "$E2E_DB_CONTAINER" psql "${PSQL_OPTS[@]}" < src/test/resources/e2e-foundational-data.sql
docker exec -i "$E2E_DB_CONTAINER" psql "${PSQL_OPTS[@]}" < src/test/resources/e2e-patient-entry-pagination.sql
echo "CI fixtures loaded."
