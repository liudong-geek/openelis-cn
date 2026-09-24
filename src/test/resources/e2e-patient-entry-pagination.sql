-- =============================================================================
-- Patient Entry E2E: 101-row quick-search pagination boundary
-- =============================================================================
-- patientEntry.cy.js searches for the fixture-only value
-- "E2EPagingBoundary" before it creates a patient.  The patient search endpoint
-- paginates these matches as 99 + 2, so the E2E database needs 101 real, joined
-- patient/person records that all match that query without depending on the
-- contents of any pre-existing rows.
--
-- This fixture owns the numeric ID range 9,100,001-9,100,101.  Reloading it is
-- safe: rows in that range are updated back to their canonical values.  A row
-- already using an owned ID without the fixture marker is treated as a hard
-- collision rather than being overwritten.
--
-- Only person and patient are populated.  Those are the only associated tables
-- read for these boundary rows by the default management list and quick-search
-- query.  The later identity searches in patientEntry.cy.js target the patient
-- created through the UI, whose patient_identity row is created by production
-- code.  Samples, addresses, and patient types are not read by this boundary.
--
-- Load this only into a disposable E2E database after Liquibase has completed.
-- The full patientEntry suite writes a run-unique patient, so restore the clean
-- database/volume before repeating the whole suite when strict run isolation is
-- required.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM clinlims.person
    WHERE id BETWEEN 9100001 AND 9100101
      AND (
        email IS NULL
        OR email NOT LIKE 'patient-entry-page-%@e2e.invalid'
      )
  ) THEN
    RAISE EXCEPTION
      'Patient-entry fixture person ID range 9100001-9100101 is already in use';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM clinlims.patient
    WHERE id BETWEEN 9100001 AND 9100101
      AND (
        national_id IS NULL
        OR national_id NOT LIKE 'E2E-PAGING-1-%'
      )
  ) THEN
    RAISE EXCEPTION
      'Patient-entry fixture patient ID range 9100001-9100101 is already in use';
  END IF;
END $$;

WITH fixture_rows AS (
  SELECT
    9100000 + fixture_number AS id,
    fixture_number,
    lpad(fixture_number::text, 3, '0') AS suffix
  FROM generate_series(1, 101) AS fixture_number
)
INSERT INTO clinlims.person (
  id,
  first_name,
  last_name,
  email,
  lastupdated
)
SELECT
  id,
  'Fixture' || suffix,
  'E2EPagingBoundary',
  'patient-entry-page-' || suffix || '@e2e.invalid',
  TIMESTAMP '2026-01-01 00:00:00'
FROM fixture_rows
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email,
  lastupdated = EXCLUDED.lastupdated;

WITH fixture_rows AS (
  SELECT
    9100000 + fixture_number AS id,
    fixture_number,
    lpad(fixture_number::text, 3, '0') AS suffix
  FROM generate_series(1, 101) AS fixture_number
)
INSERT INTO clinlims.patient (
  id,
  person_id,
  gender,
  birth_date,
  national_id,
  external_id,
  entered_birth_date,
  fhir_uuid,
  is_merged,
  merged_into_patient_id,
  merge_date,
  lastupdated
)
SELECT
  id,
  id,
  'F',
  TIMESTAMP '1980-01-01 00:00:00' + fixture_number * INTERVAL '1 day',
  'E2E-PAGING-1-' || suffix,
  'E2E-PAGING-EXT-' || suffix,
  to_char(DATE '1980-01-01' + fixture_number, 'YYYY/MM/DD'),
  ('e0100000-0000-4000-8000-' || lpad(fixture_number::text, 12, '0'))::uuid,
  false,
  NULL,
  NULL,
  TIMESTAMP '2026-01-01 00:00:00'
FROM fixture_rows
ON CONFLICT (id) DO UPDATE SET
  person_id = EXCLUDED.person_id,
  gender = EXCLUDED.gender,
  birth_date = EXCLUDED.birth_date,
  national_id = EXCLUDED.national_id,
  external_id = EXCLUDED.external_id,
  entered_birth_date = EXCLUDED.entered_birth_date,
  fhir_uuid = EXCLUDED.fhir_uuid,
  is_merged = EXCLUDED.is_merged,
  merged_into_patient_id = EXCLUDED.merged_into_patient_id,
  merge_date = EXCLUDED.merge_date,
  lastupdated = EXCLUDED.lastupdated;

DO $$
DECLARE
  fixture_count INTEGER;
  matching_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO fixture_count
  FROM clinlims.patient patient
  JOIN clinlims.person person ON person.id = patient.person_id
  WHERE patient.id BETWEEN 9100001 AND 9100101
    AND patient.national_id LIKE 'E2E-PAGING-1-%'
    AND person.email LIKE 'patient-entry-page-%@e2e.invalid';

  -- Count across the whole database so an accidental pre-existing marker
  -- cannot silently change the 99 + 2 paging boundary expected by Cypress.
  SELECT COUNT(*)
  INTO matching_count
  FROM clinlims.patient patient
  JOIN clinlims.person person ON person.id = patient.person_id
  WHERE person.last_name ILIKE '%E2EPagingBoundary%'
    OR person.first_name ILIKE '%E2EPagingBoundary%'
    OR patient.national_id ILIKE '%E2EPagingBoundary%'
    OR patient.external_id ILIKE '%E2EPagingBoundary%';

  IF fixture_count <> 101 OR matching_count <> 101 THEN
    RAISE EXCEPTION
      'Patient-entry pagination fixture verification failed: rows=%, quick matches=%',
      fixture_count,
      matching_count;
  END IF;
END $$;

COMMIT;
