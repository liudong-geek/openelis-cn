#!/bin/bash

# Reset Test Database for OpenELIS Global
# Resets test data ranges only (preserves production data)
# Supports both Docker and direct psql connections
# Usage: ./reset-test-database.sh [--force]

set -e

FORCE=false
if [ "$1" == "--force" ]; then
    FORCE=true
fi

echo "======================================"
echo "Reset Test Database"
echo "======================================"
echo ""
echo "This will reset test data ranges:"
echo "  - Storage: test-created rows only (IDs >= 1000 or TEST-* prefixes)"
echo "    (storage hierarchy + boxes are loaded by Liquibase with context=\"test\")"
echo "  - Samples: E2E* and TEST-* accession numbers"
echo "  - Patients: E2E-PAT-* external IDs"
echo "  - Sample items: IDs 10000-20000 (fixtures), 20000+ (test-created)"
echo ""

if [ "$FORCE" != true ]; then
    echo "⚠️  WARNING: This will delete test data!"
    echo "Press Ctrl+C to cancel, or Enter to continue..."
    read -r
fi

# Determine execution method: Docker or direct psql
USE_DOCKER=false
DB_CONTAINER=""
if command -v docker &> /dev/null; then
    if [ -n "${OPENELIS_TEST_DB_CONTAINER:-}" ]; then
        if [[ ! "$OPENELIS_TEST_DB_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
            echo "ERROR: OPENELIS_TEST_DB_CONTAINER is not a valid Docker container name."
            exit 2
        fi
        DB_CONTAINER=$(docker ps --filter "name=^/${OPENELIS_TEST_DB_CONTAINER}$" --format '{{.Names}}' | head -1)
        if [ "$DB_CONTAINER" != "$OPENELIS_TEST_DB_CONTAINER" ]; then
            echo "ERROR: Explicit test database container is not running: $OPENELIS_TEST_DB_CONTAINER"
            exit 2
        fi
    else
        DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^openelisglobal-database$|analyzer-harness.*-db-' | head -1)
    fi
    if [ -n "$DB_CONTAINER" ]; then
        if [ "${OPENELIS_REQUIRE_DISPOSABLE_DB:-false}" = "true" ]; then
            E2E_PROJECT="${OPENELIS_E2E_COMPOSE_PROJECT:-}"
            if [[ "$E2E_PROJECT" != "openelis-cn-e2e" && ! "$E2E_PROJECT" =~ ^openelis-e2e-[a-z0-9_-]+$ ]]; then
                echo "ERROR: Disposable reset requires a dedicated E2E Compose project."
                exit 2
            fi
            DISPOSABLE_LABEL=$(docker inspect --format '{{ index .Config.Labels "org.openelisglobal.e2e.disposable" }}' "$DB_CONTAINER")
            CONTAINER_PROJECT=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$DB_CONTAINER")
            CONTAINER_SERVICE=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$DB_CONTAINER")
            DATA_VOLUME=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$DB_CONTAINER")
            VOLUME_PROJECT=$(docker volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$DATA_VOLUME")
            VOLUME_KEY=$(docker volume inspect --format '{{ index .Labels "com.docker.compose.volume" }}' "$DATA_VOLUME")
            if [ "$DISPOSABLE_LABEL" != "true" ] || [ "$CONTAINER_PROJECT" != "$E2E_PROJECT" ] \
                || [ "$CONTAINER_SERVICE" != "db.openelis.org" ] || [ "$VOLUME_PROJECT" != "$E2E_PROJECT" ] \
                || [ "$VOLUME_KEY" != "e2e-db-data" ]; then
                echo "ERROR: Explicit reset target is not the verified disposable E2E database."
                exit 2
            fi
        elif [ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$DB_CONTAINER")" = "openelis-cn" ]; then
            echo "ERROR: Refusing to reset test ranges in the production openelis-cn project."
            exit 2
        fi
        USE_DOCKER=true
        echo "Using Docker container: $DB_CONTAINER"
    fi
fi

# SQL to reset test data ranges
RESET_SQL="
-- Reset test data ranges (preserves production data)
-- Delete in correct order to respect foreign key constraints

-- E2E test data (patients, samples, sample items, assignments, analyses, results)
DELETE FROM result WHERE analysis_id IN (
  SELECT id FROM analysis WHERE sampitem_id IN (
    SELECT id FROM sample_item WHERE samp_id IN (
      SELECT id FROM sample WHERE accession_number LIKE 'E2E%' OR accession_number LIKE 'TEST-%'
    )
  )
);

DELETE FROM analysis WHERE sampitem_id IN (
  SELECT id FROM sample_item WHERE samp_id IN (
    SELECT id FROM sample WHERE accession_number LIKE 'E2E%' OR accession_number LIKE 'TEST-%'
  )
);

DELETE FROM sample_storage_movement WHERE sample_item_id IN (
  SELECT id FROM sample_item WHERE samp_id IN (
    SELECT id FROM sample WHERE accession_number LIKE 'E2E%' OR accession_number LIKE 'TEST-%'
  )
);

DELETE FROM sample_storage_assignment WHERE sample_item_id IN (
  SELECT id FROM sample_item WHERE samp_id IN (
    SELECT id FROM sample WHERE accession_number LIKE 'E2E%' OR accession_number LIKE 'TEST-%'
  )
);

DELETE FROM sample_item WHERE samp_id IN (
  SELECT id FROM sample WHERE accession_number LIKE 'E2E%' OR accession_number LIKE 'TEST-%'
);

DELETE FROM sample_human WHERE samp_id IN (
  SELECT id FROM sample WHERE accession_number LIKE 'E2E%' OR accession_number LIKE 'TEST-%'
);

DELETE FROM sample WHERE accession_number LIKE 'E2E%' OR accession_number LIKE 'TEST-%';

-- Capture E2E person IDs before deleting patient rows (patient -> person FK)
CREATE TEMP TABLE tmp_e2e_person_ids AS
SELECT DISTINCT person_id FROM patient WHERE external_id LIKE 'E2E-%';

DELETE FROM patient_identity WHERE patient_id IN (
  SELECT id FROM patient WHERE external_id LIKE 'E2E-%'
);

DELETE FROM patient WHERE external_id LIKE 'E2E-%';

DELETE FROM person WHERE id IN (SELECT person_id FROM tmp_e2e_person_ids);
DROP TABLE tmp_e2e_person_ids;

-- Storage test-created data (preserve Liquibase foundation rows)
DELETE FROM storage_box WHERE id::integer >= 1000 OR label LIKE 'TEST-%' OR short_code LIKE 'TEST-%';
DELETE FROM storage_rack WHERE id::integer >= 1000 OR label LIKE 'TEST-%' OR short_code LIKE 'TEST-%';
DELETE FROM storage_shelf WHERE id::integer >= 1000 OR label LIKE 'TEST-%';
DELETE FROM storage_device WHERE id::integer >= 1000 OR code LIKE 'TEST-%';
DELETE FROM storage_room WHERE id::integer >= 1000 OR code LIKE 'TEST-%';

-- Reset sequences to avoid conflicts with test data
-- Use MAX(id) + 1 to ensure sequences are always ahead of existing data
-- Cast to BIGINT for setval compatibility
SELECT setval('storage_room_seq', CAST((SELECT COALESCE(MAX(id), 1000) + 1 FROM storage_room) AS BIGINT), false);
SELECT setval('storage_device_seq', CAST((SELECT COALESCE(MAX(id), 1000) + 1 FROM storage_device) AS BIGINT), false);
SELECT setval('storage_shelf_seq', CAST((SELECT COALESCE(MAX(id), 1000) + 1 FROM storage_shelf) AS BIGINT), false);
SELECT setval('storage_rack_seq', CAST((SELECT COALESCE(MAX(id), 1000) + 1 FROM storage_rack) AS BIGINT), false);
SELECT setval('storage_box_seq', CAST((SELECT COALESCE(MAX(id), 10000) + 1 FROM storage_box) AS BIGINT), false);
SELECT setval('sample_storage_assignment_seq', CAST((SELECT COALESCE(MAX(id), 10000) + 1 FROM sample_storage_assignment) AS BIGINT), false);
SELECT setval('sample_storage_movement_seq', CAST((SELECT COALESCE(MAX(id), 10000) + 1 FROM sample_storage_movement) AS BIGINT), false);
SELECT setval('person_seq', CAST((SELECT COALESCE(MAX(id), 2000) + 1 FROM person) AS BIGINT), false);
SELECT setval('patient_seq', CAST((SELECT COALESCE(MAX(id), 2000) + 1 FROM patient) AS BIGINT), false);
SELECT setval('sample_seq', CAST((SELECT COALESCE(MAX(id), 2000) + 1 FROM sample) AS BIGINT), false);
SELECT setval('sample_human_seq', CAST((SELECT COALESCE(MAX(id), 2000) + 1 FROM sample_human) AS BIGINT), false);
SELECT setval('sample_item_seq', CAST((SELECT COALESCE(MAX(id), 10100) + 1 FROM sample_item) AS BIGINT), false);
SELECT setval('analysis_seq', CAST((SELECT COALESCE(MAX(id), 20000) + 1 FROM analysis) AS BIGINT), false);
SELECT setval('result_seq', CAST((SELECT COALESCE(MAX(id), 30000) + 1 FROM result) AS BIGINT), false);
"

if [ "$USE_DOCKER" = true ]; then
    echo "Resetting test data via Docker..."
    echo "$RESET_SQL" | docker exec -i "$DB_CONTAINER" psql -U clinlims -d clinlims

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Test data reset successfully!"
        echo ""
    else
        echo ""
        echo "======================================"
        echo "❌ Error resetting test data"
        echo "======================================"
        exit 1
    fi
else
    # Use direct psql connection
    if [ "${OPENELIS_REQUIRE_DISPOSABLE_DB:-false}" = "true" ]; then
        echo "ERROR: A verified disposable Docker database is required for this reset."
        exit 2
    fi
    if [ "${OPENELIS_ALLOW_DIRECT_TEST_DATABASE:-}" != "I_UNDERSTAND_THIS_LOADS_TEST_FIXTURES" ]; then
        echo "ERROR: Direct database reset requires OPENELIS_ALLOW_DIRECT_TEST_DATABASE=I_UNDERSTAND_THIS_LOADS_TEST_FIXTURES."
        exit 2
    fi
    if ! command -v psql &> /dev/null; then
        echo "ERROR: psql not found. Please install PostgreSQL client."
        echo "Alternatively, ensure Docker is running with openelisglobal-database container."
        exit 1
    fi

    # Database connection parameters
    DB_USER="${DB_USER:-clinlims}"
    DB_NAME="${DB_NAME:-clinlims}"
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"

    echo "Using direct psql connection"
    echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
    echo "User: $DB_USER"
    echo ""
    echo "Resetting test data..."
    echo ""

    echo "$RESET_SQL" | psql -U "$DB_USER" -d "$DB_NAME" -h "$DB_HOST" -p "$DB_PORT"

    if [ $? -eq 0 ]; then
        echo ""
        echo "======================================"
        echo "✅ Test data reset successfully!"
        echo "======================================"
    else
        echo ""
        echo "======================================"
        echo "❌ Error resetting test data"
        echo "======================================"
        exit 1
    fi
fi
