-- =============================================================================
-- E2E Foundational Test Data
-- =============================================================================
-- This file contains the base data required by ALL E2E tests (not just storage)
-- It mirrors what organizationManagement.cy.js and providerManagement.cy.js create
-- through the UI, but in SQL form for faster loading.
--
-- Usage: Loaded automatically by load-test-fixtures.sh before profile-specific fixture data
--
-- Data created:
--   - Provider: Optimus Prime (used in Order.json fixture)
--   - Organization: CAMES MAN (referring clinic, used in Order.json fixture)
--   - Organization: CEDRES (referral lab)
--   - Synthetic QA department: 9000102 under exact CAMES MAN 9000100
-- =============================================================================

-- =============================================================================
-- IDEMPOTENT: Do NOT delete existing foundational rows.
-- =============================================================================
-- This script is executed repeatedly by Cypress and should be safe to rerun.
-- In particular, deleting providers/persons by name is unsafe because some
-- environments may already contain those names as real seeded data referenced
-- by other tables (e.g., sample_human).
-- =============================================================================

-- =============================================================================
-- PROVIDER: Optimus Prime
-- =============================================================================
-- This is the same provider created by providerManagement.cy.js
-- Used in frontend/cypress/fixtures/Order.json as "requester"

-- Create person record for Optimus Prime
INSERT INTO person (id, first_name, last_name, lastupdated)
SELECT 9000001, 'Optimus', 'Prime', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM person WHERE first_name = 'Optimus' AND last_name = 'Prime'
);

-- Create provider record
INSERT INTO provider (id, person_id, lastupdated, fhir_uuid, active)
SELECT
  9000001,
  p.id,
  CURRENT_TIMESTAMP,
  gen_random_uuid(),
  true
FROM person p
WHERE p.first_name = 'Optimus' AND p.last_name = 'Prime'
AND NOT EXISTS (
  SELECT 1 FROM provider pr WHERE pr.person_id = p.id
);

-- =============================================================================
-- PROVIDER: Jim Jam (second provider from providerManagement.cy.js)
-- =============================================================================

INSERT INTO person (id, first_name, last_name, lastupdated)
SELECT 9000002, 'Jim', 'Jam', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM person WHERE first_name = 'Jim' AND last_name = 'Jam'
);

INSERT INTO provider (id, person_id, lastupdated, fhir_uuid, active)
SELECT
  9000002,
  p.id,
  CURRENT_TIMESTAMP,
  gen_random_uuid(),
  true
FROM person p
WHERE p.first_name = 'Jim' AND p.last_name = 'Jam'
AND NOT EXISTS (
  SELECT 1 FROM provider pr WHERE pr.person_id = p.id
);

-- =============================================================================
-- ORGANIZATION: CAMES MAN (Referring Clinic)
-- =============================================================================
-- This is the same organization created by organizationManagement.cy.js
-- Used in frontend/cypress/fixtures/Order.json as "siteName"
-- Properties: prefix=279, is_active=Y, referring_clinic=true

INSERT INTO organization (
  id,
  name,
  short_name,
  is_active,
  org_mlt_org_mlt_id,
  lastupdated,
  fhir_uuid
)
SELECT
  9000100,
  'CAMES MAN',
  '279',
  'Y',
  NULL,
  CURRENT_TIMESTAMP,
  gen_random_uuid()
WHERE NOT EXISTS (
  SELECT 1 FROM organization WHERE name = 'CAMES MAN'
);

-- Add organization type: referring clinic
INSERT INTO organization_organization_type (org_id, org_type_id)
SELECT o.id, ot.id
FROM organization o, organization_type ot
WHERE o.name = 'CAMES MAN'
AND ot.short_name = 'referring clinic'
AND NOT EXISTS (
  SELECT 1 FROM organization_organization_type oot
  JOIN organization org ON oot.org_id = org.id
  JOIN organization_type orgtype ON oot.org_type_id = orgtype.id
  WHERE org.name = 'CAMES MAN' AND orgtype.short_name = 'referring clinic'
);

-- =============================================================================
-- SYNTHETIC ACCEPTANCE DEPARTMENT: fixed CAMES parent, not a hospital policy
-- =============================================================================
-- Original preprinted BatchOrderEntry verifies a real configured department.
-- Add one fixed QA child only; never repair or overwrite conflicting records.
DO $cames_department_fixture$
DECLARE
  department_type_id BIGINT;
  department_type_count INTEGER;
  inserted_organizations INTEGER;
  inserted_type_links INTEGER;
BEGIN
  IF (SELECT COUNT(*) FROM organization
      WHERE id = 9000100 AND name = 'CAMES MAN' AND short_name = '279'
        AND is_active = 'Y' AND org_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'CAMES QA department requires exact parent 9000100 / 279 / CAMES MAN';
  END IF;

  IF (SELECT COUNT(*) FROM organization_organization_type oot
      JOIN organization_type ot ON ot.id = oot.org_type_id
      WHERE oot.org_id = 9000100 AND ot.short_name = 'referring clinic') <> 1 THEN
    RAISE EXCEPTION 'CAMES QA parent must retain its existing referring-clinic type';
  END IF;

  SELECT COUNT(*), MIN(id) INTO department_type_count, department_type_id
  FROM organization_type WHERE short_name = 'dept';
  IF department_type_count <> 1 THEN
    RAISE EXCEPTION 'CAMES QA department requires one existing dept organization type';
  END IF;

  IF EXISTS (SELECT 1 FROM organization WHERE id = 9000102
      AND (name IS DISTINCT FROM 'CAMES合成验收科室'
        OR short_name IS DISTINCT FROM 'E2E-CAMES-DEPT'
        OR org_id IS DISTINCT FROM 9000100 OR is_active IS DISTINCT FROM 'Y'))
    OR EXISTS (SELECT 1 FROM organization WHERE org_id = 9000100
      AND id <> 9000102 AND (is_active = 'Y' OR name = 'CAMES合成验收科室')) THEN
    RAISE EXCEPTION 'CAMES QA department identity or active-child conflict; refusing replacement';
  END IF;

  IF EXISTS (SELECT 1 FROM organization_organization_type
      WHERE org_id = 9000102 AND org_type_id <> department_type_id) THEN
    RAISE EXCEPTION 'CAMES QA department has an unexpected organization type';
  END IF;

  INSERT INTO organization
    (id, name, short_name, is_active, org_id, org_mlt_org_mlt_id,
     lastupdated, fhir_uuid)
  SELECT 9000102, 'CAMES合成验收科室', 'E2E-CAMES-DEPT', 'Y', 9000100,
    NULL, CURRENT_TIMESTAMP, gen_random_uuid()
  WHERE NOT EXISTS (SELECT 1 FROM organization WHERE id = 9000102);
  GET DIAGNOSTICS inserted_organizations = ROW_COUNT;

  INSERT INTO organization_organization_type (org_id, org_type_id)
  SELECT 9000102, department_type_id
  WHERE NOT EXISTS (SELECT 1 FROM organization_organization_type
    WHERE org_id = 9000102 AND org_type_id = department_type_id);
  GET DIAGNOSTICS inserted_type_links = ROW_COUNT;

  IF (SELECT COUNT(*) FROM organization_organization_type
      WHERE org_id = 9000102) <> 1 THEN
    RAISE EXCEPTION 'CAMES QA department must retain exactly one dept type link';
  END IF;
  IF (SELECT COUNT(*) FROM organization
      WHERE org_id = 9000100 AND is_active = 'Y') <> 1 THEN
    RAISE EXCEPTION 'CAMES QA department must be the single active configured child';
  END IF;
  RAISE NOTICE 'CAMES synthetic preparation: organizationsInserted=%, typeLinksInserted=%; parent=9000100, department=9000102',
    inserted_organizations, inserted_type_links;
END;
$cames_department_fixture$;

-- =============================================================================
-- ORGANIZATION: CEDRES (Referral Lab)
-- =============================================================================
-- This is the second organization created by organizationManagement.cy.js
-- Properties: is_active=Y, referral_lab=true

INSERT INTO organization (
  id,
  name,
  is_active,
  org_mlt_org_mlt_id,
  lastupdated,
  fhir_uuid
)
SELECT
  9000101,
  'CEDRES',
  'Y',
  NULL,
  CURRENT_TIMESTAMP,
  gen_random_uuid()
WHERE NOT EXISTS (
  SELECT 1 FROM organization WHERE name = 'CEDRES'
);

-- Add organization type: referral lab
INSERT INTO organization_organization_type (org_id, org_type_id)
SELECT o.id, ot.id
FROM organization o, organization_type ot
WHERE o.name = 'CEDRES'
AND ot.short_name = 'referralLab'
AND NOT EXISTS (
  SELECT 1 FROM organization_organization_type oot
  JOIN organization org ON oot.org_id = org.id
  JOIN organization_type orgtype ON oot.org_type_id = orgtype.id
  WHERE org.name = 'CEDRES' AND orgtype.short_name = 'referralLab'
);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  provider_count INTEGER;
  org_count INTEGER;
  department_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO provider_count FROM provider pr
  JOIN person pe ON pr.person_id = pe.id
  WHERE pe.last_name IN ('Prime', 'Jam');

  SELECT COUNT(*) INTO org_count FROM organization
  WHERE name IN ('CAMES MAN', 'CEDRES');

  SELECT COUNT(*) INTO department_count FROM organization
  WHERE id = 9000102 AND org_id = 9000100 AND is_active = 'Y';

  RAISE NOTICE 'E2E Foundational Data Loaded:';
  RAISE NOTICE '  - Providers: % (expected: 2)', provider_count;
  RAISE NOTICE '  - Organizations: % (expected: 2)', org_count;
  RAISE NOTICE '  - Synthetic CAMES QA departments: % (expected: 1)', department_count;
END $$;

-- Synthetic E2E fixture only: explicit legacy ALPHA result definition.
-- Histopathology changeSet16 creates this exact test without a result definition.
-- Keep its existing ALPHA display type; do not alter clinical guards or components.
DO $pathology_alpha_fixture$
DECLARE
  primary_id VARCHAR;
  primary_count INTEGER;
  inserted_definitions INTEGER;
BEGIN
  IF (SELECT COUNT(*) FROM clinlims.test t JOIN clinlims.test_section s
      ON s.id = t.test_section_id
      WHERE t.id = 321 AND t.name = 'Histopathology examination'
        AND t.description = 'Histopathology examination'
        AND t.guid = 'fe92e08b-43ad-444e-9256-4ababc287560'
        AND t.is_active = 'Y' AND s.name = 'Pathology') <> 1 THEN
    RAISE EXCEPTION 'Pathology QA result definition requires exact seeded test 321';
  END IF;

  SELECT COUNT(*), MIN(id) INTO primary_count, primary_id
  FROM clinlims.test_result_component
  WHERE test_id = 321 AND is_active = 'Y';
  IF primary_count <> 1 OR NOT EXISTS (
      SELECT 1 FROM clinlims.test_result_component
      WHERE id = primary_id AND test_id = 321 AND is_primary = true
        AND code = 'PRIMARY' AND is_active = 'Y' AND result_type IS NULL) THEN
    RAISE EXCEPTION 'Pathology QA result definition requires the unchanged single legacy primary component';
  END IF;

  IF EXISTS (SELECT 1 FROM clinlims.test_result WHERE test_id = 321 AND id <> 9000321)
    OR EXISTS (SELECT 1 FROM clinlims.test_result WHERE id = 9000321
      AND (test_id IS DISTINCT FROM 321 OR tst_rslt_type IS DISTINCT FROM 'A'
        OR is_active IS DISTINCT FROM true OR component_id IS DISTINCT FROM primary_id
        OR sort_order IS DISTINCT FROM 0 OR value IS NOT NULL)) THEN
    RAISE EXCEPTION 'Pathology QA result definition identity conflict; refusing replacement';
  END IF;

  INSERT INTO clinlims.test_result
    (id, test_id, tst_rslt_type, is_active, component_id, sort_order, lastupdated)
  SELECT 9000321, 321, 'A', true, primary_id, 0, CURRENT_TIMESTAMP
  WHERE NOT EXISTS (SELECT 1 FROM clinlims.test_result WHERE id = 9000321);
  GET DIAGNOSTICS inserted_definitions = ROW_COUNT;

  IF (SELECT COUNT(*) FROM clinlims.test_result WHERE test_id = 321
      AND id = 9000321 AND tst_rslt_type = 'A' AND is_active = true
      AND component_id = primary_id AND sort_order = 0 AND value IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Pathology QA result definition must retain one exact ALPHA option';
  END IF;
  RAISE NOTICE 'Pathology synthetic preparation: definitionsInserted=%; test=321, definition=9000321',
    inserted_definitions;
END;
$pathology_alpha_fixture$;

-- CHG-117: explicitly synthetic E2E Cytology report, not a COVID test.
-- Same foundation serves both isolated acceptance profiles; production never loads it.
-- Original COVIDPCR(Fluid)302/Molecular136 and all pre-existing objects stay unchanged.
DO $e2e_cytology_report$
DECLARE
  inserted_count INTEGER := 0;
  row_count INTEGER;
  expected_localization JSONB := $json${"id":9000165,"description":"test name"}$json$::jsonb;
  expected_test JSONB := $json${"id":9000165,"guid":"ccec4c2b-9ece-5e64-806c-b729b01dd139","name":"e2e.cytology.report","loinc":null,"domain":"CLINICAL","uom_id":null,"label_id":null,"is_active":"Y","label_qty":null,"method_id":null,"orderable":true,"time_wait":null,"active_end":null,"local_code":"E2ECYTO","sort_order":0,"description":"E2E Synthetic Cytology Report","in_lab_only":false,"time_ta_max":null,"active_begin":null,"scriptlet_id":null,"time_holding":null,"is_reportable":"Y","notify_results":false,"test_format_id":null,"test_section_id":165,"test_trailer_id":null,"time_ta_average":null,"time_ta_warning":null,"sticker_req_flag":null,"name_localization_id":9000165,"reporting_description":null,"default_test_result_id":null,"normalized_description":"e2esyntheticcytologyreport","antimicrobial_resistance":false,"reporting_name_localization_id":9000165}$json$::jsonb;
  expected_sampletype_test JSONB := $json${"id":9000165,"test_id":9000165,"is_panel":false,"display_order":0,"sample_type_id":32}$json$::jsonb;
  expected_test_result_component JSONB := $json${"id":"f6d33d95-f34d-5372-83a3-5ea37d7d5238","code":"PRIMARY","label":"E2E Synthetic Cytology Report","uom_id":null,"test_id":9000165,"is_active":"Y","is_primary":true,"result_type":"A","display_order":0,"default_result":null,"show_on_report":true,"significant_digits":0,"allow_multiple_readings":false}$json$::jsonb;
  expected_test_result JSONB := $json${"id":9000165,"flags":null,"value":null,"test_id":9000165,"is_active":true,"is_normal":null,"cont_level":null,"sort_order":0,"quant_limit":null,"component_id":"f6d33d95-f34d-5372-83a3-5ea37d7d5238","result_group":null,"scriptlet_id":null,"tst_rslt_type":"A","is_quantifiable":false,"significant_digits":0}$json$::jsonb;
  expected_labels JSONB := $json$[{"id":90001651,"localization_id":9000165,"locale":"en","value":"E2E Synthetic Cytology Report"},{"id":90001652,"localization_id":9000165,"locale":"zh","value":"E2E 合成细胞学报告"},{"id":90001653,"localization_id":9000165,"locale":"zh_CN","value":"E2E 合成细胞学报告"}]$json$::jsonb;
  label_row JSONB;
BEGIN
  IF (SELECT count(*) FROM clinlims.program p JOIN clinlims.test_section ts ON ts.id=p.test_section_id
      WHERE p.id=5 AND p.name='Cytology' AND p.code='CYTO' AND ts.id=165
        AND ts.name='Cytology' AND ts.domain='CLINICAL' AND ts.is_active='Y') <> 1
     OR (SELECT count(*) FROM clinlims.type_of_sample WHERE id=32 AND description='Fluid'
        AND domain='CLINICAL' AND is_active=true) <> 1 THEN
    RAISE EXCEPTION 'CHG117 requires unchanged program5/Cytology165/Fluid32';
  END IF;
  IF EXISTS (SELECT 1 FROM clinlims.localization r WHERE r.id=9000165 AND to_jsonb(r) - 'lastupdated' IS DISTINCT FROM expected_localization) THEN
    RAISE EXCEPTION 'CHG117 full localization identity conflict; refusing update';
  END IF;
  IF EXISTS (SELECT 1 FROM clinlims.test r WHERE r.id=9000165 AND to_jsonb(r) - 'lastupdated' IS DISTINCT FROM expected_test) THEN
    RAISE EXCEPTION 'CHG117 full test identity conflict; refusing update';
  END IF;
  IF EXISTS (SELECT 1 FROM clinlims.sampletype_test r WHERE r.id=9000165 AND to_jsonb(r) IS DISTINCT FROM expected_sampletype_test) THEN
    RAISE EXCEPTION 'CHG117 full sampletype_test identity conflict; refusing update';
  END IF;
  IF EXISTS (SELECT 1 FROM clinlims.test_result_component r WHERE r.id='f6d33d95-f34d-5372-83a3-5ea37d7d5238' AND to_jsonb(r) - 'lastupdated' - 'last_updated' IS DISTINCT FROM expected_test_result_component) THEN
    RAISE EXCEPTION 'CHG117 full test_result_component identity conflict; refusing update';
  END IF;
  IF EXISTS (SELECT 1 FROM clinlims.test_result r WHERE r.id=9000165 AND to_jsonb(r) - 'lastupdated' IS DISTINCT FROM expected_test_result) THEN
    RAISE EXCEPTION 'CHG117 full test_result identity conflict; refusing update';
  END IF;
  IF EXISTS (SELECT 1 FROM clinlims.test WHERE id<>9000165 AND
      (guid='ccec4c2b-9ece-5e64-806c-b729b01dd139' OR name='e2e.cytology.report' OR description='E2E Synthetic Cytology Report' OR local_code='E2ECYTO'))
     OR EXISTS (SELECT 1 FROM clinlims.sampletype_test WHERE test_id=9000165 AND id<>9000165)
     OR EXISTS (SELECT 1 FROM clinlims.test_result_component WHERE test_id=9000165 AND id<>'f6d33d95-f34d-5372-83a3-5ea37d7d5238')
     OR EXISTS (SELECT 1 FROM clinlims.test_result WHERE test_id=9000165 AND id<>9000165)
     OR EXISTS (SELECT 1 FROM clinlims.test WHERE id<>9000165 AND
          (name_localization_id=9000165 OR reporting_name_localization_id=9000165)) THEN
    RAISE EXCEPTION 'CHG117 reserved identity or relationship conflict; refusing replacement';
  END IF;
  IF EXISTS (SELECT 1 FROM clinlims.localization_value r
      WHERE (r.id IN (90001651,90001652,90001653) OR r.localization_id=9000165) AND
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected_labels) e
          WHERE to_jsonb(r)-'last_updated'=e)) THEN
    RAISE EXCEPTION 'CHG117 full localized E2E label conflict; refusing update';
  END IF;
  INSERT INTO clinlims.localization SELECT (jsonb_populate_record(NULL::clinlims.localization,
      expected_localization || jsonb_build_object('lastupdated',CURRENT_TIMESTAMP))).*
    WHERE NOT EXISTS (SELECT 1 FROM clinlims.localization WHERE id=9000165);
  GET DIAGNOSTICS row_count = ROW_COUNT; inserted_count := inserted_count + row_count;
  FOR label_row IN SELECT value FROM jsonb_array_elements(expected_labels) LOOP
    INSERT INTO clinlims.localization_value SELECT (jsonb_populate_record(NULL::clinlims.localization_value,
        label_row || jsonb_build_object('last_updated',CURRENT_TIMESTAMP))).*
      WHERE NOT EXISTS (SELECT 1 FROM clinlims.localization_value WHERE id=(label_row->>'id')::numeric);
    GET DIAGNOSTICS row_count = ROW_COUNT; inserted_count := inserted_count + row_count;
  END LOOP;
  INSERT INTO clinlims.test SELECT (jsonb_populate_record(NULL::clinlims.test,expected_test || jsonb_build_object('lastupdated',CURRENT_TIMESTAMP))).*
    WHERE NOT EXISTS (SELECT 1 FROM clinlims.test WHERE id=9000165);
  GET DIAGNOSTICS row_count = ROW_COUNT; inserted_count := inserted_count + row_count;
  INSERT INTO clinlims.sampletype_test SELECT (jsonb_populate_record(NULL::clinlims.sampletype_test,expected_sampletype_test)).*
    WHERE NOT EXISTS (SELECT 1 FROM clinlims.sampletype_test WHERE id=9000165);
  GET DIAGNOSTICS row_count = ROW_COUNT; inserted_count := inserted_count + row_count;
  INSERT INTO clinlims.test_result_component SELECT (jsonb_populate_record(NULL::clinlims.test_result_component,expected_test_result_component || jsonb_build_object('lastupdated',CURRENT_TIMESTAMP,'last_updated',CURRENT_TIMESTAMP))).*
    WHERE NOT EXISTS (SELECT 1 FROM clinlims.test_result_component WHERE id='f6d33d95-f34d-5372-83a3-5ea37d7d5238');
  GET DIAGNOSTICS row_count = ROW_COUNT; inserted_count := inserted_count + row_count;
  INSERT INTO clinlims.test_result SELECT (jsonb_populate_record(NULL::clinlims.test_result,expected_test_result || jsonb_build_object('lastupdated',CURRENT_TIMESTAMP))).*
    WHERE NOT EXISTS (SELECT 1 FROM clinlims.test_result WHERE id=9000165);
  GET DIAGNOSTICS row_count = ROW_COUNT; inserted_count := inserted_count + row_count;
  IF (SELECT count(*) FROM clinlims.localization r WHERE r.id=9000165 AND to_jsonb(r) - 'lastupdated'=expected_localization) <> 1 THEN
    RAISE EXCEPTION 'CHG117 exact localization readback failed';
  END IF;
  IF (SELECT count(*) FROM clinlims.test r WHERE r.id=9000165 AND to_jsonb(r) - 'lastupdated'=expected_test) <> 1 THEN
    RAISE EXCEPTION 'CHG117 exact test readback failed';
  END IF;
  IF (SELECT count(*) FROM clinlims.sampletype_test r WHERE r.id=9000165 AND to_jsonb(r)=expected_sampletype_test) <> 1 THEN
    RAISE EXCEPTION 'CHG117 exact sampletype_test readback failed';
  END IF;
  IF (SELECT count(*) FROM clinlims.test_result_component r WHERE r.id='f6d33d95-f34d-5372-83a3-5ea37d7d5238' AND to_jsonb(r) - 'lastupdated' - 'last_updated'=expected_test_result_component) <> 1 THEN
    RAISE EXCEPTION 'CHG117 exact test_result_component readback failed';
  END IF;
  IF (SELECT count(*) FROM clinlims.test_result r WHERE r.id=9000165 AND to_jsonb(r) - 'lastupdated'=expected_test_result) <> 1 THEN
    RAISE EXCEPTION 'CHG117 exact test_result readback failed';
  END IF;
  IF (SELECT count(*) FROM clinlims.localization_value r
      WHERE r.localization_id=9000165 AND EXISTS
        (SELECT 1 FROM jsonb_array_elements(expected_labels) e WHERE to_jsonb(r)-'last_updated'=e)) <> 3 THEN
    RAISE EXCEPTION 'CHG117 exact E2E localized labels readback failed';
  END IF;
  RAISE NOTICE 'CHG117 synthetic Cytology report rowsInserted=%; test9000165/Fluid32/program5/section165', inserted_count;
END;
$e2e_cytology_report$;
