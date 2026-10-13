-- Synthetic clinical workflow fixture. This file is loaded only by the
-- disposable E2E database loader after it verifies the container and volume.
-- The stock catalog has no active test that both accepts a result and may be
-- included in a formally issued patient report. Do not apply to a hospital DB.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  fixture_test clinlims.test%ROWTYPE;
  active_result_count integer;
  changed_count integer;
BEGIN
  SELECT * INTO fixture_test
  FROM clinlims.test
  WHERE id = '13'
  FOR UPDATE;

  -- The original master name is stable. Chinese is a translation, not a
  -- side effect that a preceding GET must have written to the master row.
  IF NOT FOUND
      OR fixture_test.name IS DISTINCT FROM 'Numération des globules blancs'
      OR fixture_test.description IS DISTINCT FROM 'Numération des globules blancs(Whole Blood)'
      OR fixture_test.test_section_id IS DISTINCT FROM 36
      OR fixture_test.local_code IS DISTINCT FROM 'White Blood Cells Count (WBC)-Blood'
      OR fixture_test.loinc IS NOT NULL
      OR fixture_test.name_localization_id IS DISTINCT FROM 27
      OR fixture_test.reporting_name_localization_id IS DISTINCT FROM 28
      OR fixture_test.domain IS DISTINCT FROM 'CLINICAL'
      OR fixture_test.is_active IS DISTINCT FROM 'Y'
      OR fixture_test.orderable IS DISTINCT FROM true
      OR fixture_test.is_reportable IS NULL
      OR fixture_test.is_reportable NOT IN ('N', 'Y') THEN
    RAISE EXCEPTION 'Synthetic WBC test 13 is absent or has unexpected master data';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clinlims.test_section WHERE id=36
        AND name='Hematology' AND name_localization_id=128)
      OR NOT EXISTS (SELECT 1 FROM clinlims.localization_value WHERE localization_id=27
        AND locale='en' AND value='White Blood Cells Count (WBC)')
      OR NOT EXISTS (SELECT 1 FROM clinlims.localization_value WHERE localization_id=27
        AND locale='zh' AND value='白细胞计数（WBC）')
      OR NOT EXISTS (SELECT 1 FROM clinlims.localization_value WHERE localization_id=28
        AND locale='en' AND value='White Blood Cells Count (WBC)')
      OR NOT EXISTS (SELECT 1 FROM clinlims.localization_value WHERE localization_id=28
        AND locale='zh' AND value='白细胞计数（WBC）') THEN
    RAISE EXCEPTION 'Synthetic WBC master identity and translations do not match';
  END IF;

  SELECT count(*) INTO active_result_count
  FROM clinlims.test_result
  WHERE id = 17 AND test_id = '13' AND is_active = true AND tst_rslt_type = 'N';
  IF active_result_count < 1 THEN
    RAISE EXCEPTION 'Synthetic WBC test 13 has no active result definition';
  END IF;

  IF fixture_test.is_reportable = 'N' THEN
    UPDATE clinlims.test
    SET is_reportable = 'Y', lastupdated = clock_timestamp()
    WHERE id = '13'
      AND name = fixture_test.name
      AND description = fixture_test.description
      AND test_section_id = 36
      AND local_code = 'White Blood Cells Count (WBC)-Blood'
      AND loinc IS NULL
      AND name_localization_id = 27
      AND reporting_name_localization_id = 28
      AND domain = 'CLINICAL'
      AND is_active = 'Y'
      AND orderable = true
      AND is_reportable = 'N';
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'Synthetic WBC reportability update affected % rows', changed_count;
    END IF;
  END IF;
END $$;

COMMIT;
