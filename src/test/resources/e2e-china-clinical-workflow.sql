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

  IF NOT FOUND
      OR fixture_test.name <> '白细胞计数（WBC）'
      OR fixture_test.domain <> 'CLINICAL'
      OR fixture_test.is_active <> 'Y'
      OR fixture_test.is_reportable NOT IN ('N', 'Y') THEN
    RAISE EXCEPTION 'Synthetic WBC test 13 is absent or has unexpected master data';
  END IF;

  SELECT count(*) INTO active_result_count
  FROM clinlims.test_result
  WHERE test_id = '13' AND is_active = 'Y';
  IF active_result_count < 1 THEN
    RAISE EXCEPTION 'Synthetic WBC test 13 has no active result definition';
  END IF;

  IF fixture_test.is_reportable = 'N' THEN
    UPDATE clinlims.test
    SET is_reportable = 'Y', lastupdated = clock_timestamp()
    WHERE id = '13'
      AND name = '白细胞计数（WBC）'
      AND domain = 'CLINICAL'
      AND is_active = 'Y'
      AND is_reportable = 'N';
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'Synthetic WBC reportability update affected % rows', changed_count;
    END IF;
  END IF;
END $$;

COMMIT;
