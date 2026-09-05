-- ============================================================================
-- openelis-cn 演示/测试数据清理脚本（Sprint 1.3 测试数据隔离）
-- 目录：specs/018-lis-qa-remediation/demo-data-cleanup.sql
-- 版本：v2（基于 sample.accession_number 定位 DEV 数据）
--
-- 说明：
--   1) 清除本地开发/演示环境中功能测试产生的 DEV 数据：
--      - sample.accession_number 以 DEV 开头（DEV0126 系列订单/样本）
--      - 关联的 analysis / result / 样本子表 / 患者（流程甲/流程乙/流程患者）
--   2) 脚本在事务内执行；执行前请先运行【诊断查询】确认范围；
--      人工确认后执行 COMMIT，如需中止则 ROLLBACK（脚本已默认 ROLLBACK，可改 COMMIT）。
--   3) 正式/生产库严禁执行本脚本。
--
-- 执行：
--   docker exec -i openelis-cn-database psql -U clinlims -d clinlims -f - < demo-data-cleanup.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 第 0 步：诊断查询（只读）——确认将清理的数据范围
-- ----------------------------------------------------------------------------
-- SELECT 'DEV 样本' AS item, count(*) FROM clinlims.sample WHERE accession_number ILIKE 'DEV%'
-- UNION ALL SELECT 'DEV analysis', count(*) FROM clinlims.analysis a
--   JOIN clinlims.sample_item si ON si.id = a.sampitem_id
--   JOIN clinlims.sample s ON s.id = si.samp_id WHERE s.accession_number ILIKE 'DEV%'
-- UNION ALL SELECT 'DEV 患者', count(*) FROM clinlims.patient p
--   JOIN clinlims.person pn ON pn.id = p.person_id WHERE pn.last_name IN ('测试','接口测试');

BEGIN;

-- 收集受影响 id
CREATE TEMP TABLE tmp_dev_sample AS
  SELECT id FROM clinlims.sample WHERE accession_number ILIKE 'DEV%';

CREATE TEMP TABLE tmp_dev_sampitem AS
  SELECT si.id FROM clinlims.sample_item si JOIN tmp_dev_sample s ON si.samp_id = s.id;

CREATE TEMP TABLE tmp_dev_analysis AS
  SELECT a.id FROM clinlims.analysis a JOIN tmp_dev_sampitem si ON a.sampitem_id = si.id;

CREATE TEMP TABLE tmp_dev_patient AS
  SELECT p.id AS pid, p.person_id AS person_id
  FROM clinlims.patient p
  JOIN clinlims.person pn ON pn.id = p.person_id
  WHERE pn.last_name IN ('测试','接口测试');

-- 1) 深层子表：result / analysis 相关
DELETE FROM clinlims.result r USING tmp_dev_analysis a WHERE r.analysis_id = a.id;
DELETE FROM clinlims.analysis_qaevent q USING tmp_dev_analysis a WHERE q.analysis_id = a.id;
DELETE FROM clinlims.referral r USING tmp_dev_analysis a WHERE r.analysis_id = a.id;
DELETE FROM clinlims.analysis_notification_config c USING tmp_dev_analysis a WHERE c.analysis_id = a.id;
-- analysis 自引用（parent_analysis_id）先解除
UPDATE clinlims.analysis SET parent_analysis_id = NULL
  WHERE parent_analysis_id IN (SELECT id FROM tmp_dev_analysis);
DELETE FROM clinlims.analysis a USING tmp_dev_analysis t WHERE a.id = t.id;

-- 2) sample_item 及其子表
DELETE FROM clinlims.sample_item_barcode_info b USING tmp_dev_sampitem si WHERE b.sample_item_id = si.id;
DELETE FROM clinlims.referring_test_result r USING tmp_dev_sampitem si WHERE r.sample_item_id = si.id;
DELETE FROM clinlims.nce_specimen n USING tmp_dev_sampitem si WHERE n.sample_item_id = si.id;
DELETE FROM clinlims.sample_qaevent q USING tmp_dev_sampitem si WHERE q.sampleitem_id = si.id;
DELETE FROM clinlims.notebook_samples_list l USING tmp_dev_sampitem si WHERE l.sample_item_id = si.id;
DELETE FROM clinlims.notebook_samples n USING tmp_dev_sampitem si WHERE n.sample_item_id = si.id;
DELETE FROM clinlims.sample_item_aliquot_relationship r USING tmp_dev_sampitem si WHERE r.parent_sample_item_id = si.id OR r.child_sample_item_id = si.id;
DELETE FROM clinlims.sample_storage_assignment a USING tmp_dev_sampitem si WHERE a.sample_item_id = si.id;
DELETE FROM clinlims.sample_storage_movement m USING tmp_dev_sampitem si WHERE m.sample_item_id = si.id;
DELETE FROM clinlims.sample_type_request r USING tmp_dev_sampitem si WHERE r.sample_item_id = si.id;
UPDATE clinlims.sample_item SET parent_sample_item_id = NULL
  WHERE parent_sample_item_id IN (SELECT id FROM tmp_dev_sampitem);
DELETE FROM clinlims.sample_item si USING tmp_dev_sampitem t WHERE si.id = t.id;
DELETE FROM clinlims.sample_human h USING tmp_dev_sample s WHERE h.samp_id = s.id;
DELETE FROM clinlims.sample_environmental e USING tmp_dev_sample s WHERE e.samp_id = s.id;
DELETE FROM clinlims.sample_organization o USING tmp_dev_sample s WHERE o.samp_id = s.id;
DELETE FROM clinlims.sample_projects p USING tmp_dev_sample s WHERE p.samp_id = s.id;
DELETE FROM clinlims.cytology_sample c USING tmp_dev_sample s WHERE c.sample_id = s.id;
DELETE FROM clinlims.immunohistochemistry_sample i USING tmp_dev_sample s WHERE i.sample_id = s.id;
DELETE FROM clinlims.pathology_sample p USING tmp_dev_sample s WHERE p.sample_id = s.id;
DELETE FROM clinlims.program_sample p USING tmp_dev_sample s WHERE p.sample_id = s.id;
DELETE FROM clinlims.sample_additional_fields f USING tmp_dev_sample s WHERE f.sample_id = s.id;
DELETE FROM clinlims.sample_barcode_info b USING tmp_dev_sample s WHERE b.sample_id = s.id;
DELETE FROM clinlims.sample_eqa q USING tmp_dev_sample s WHERE q.sample_id = s.id;
DELETE FROM clinlims.sample_qa_checklist c USING tmp_dev_sample s WHERE c.sample_id = s.id;
DELETE FROM clinlims.sample_type_request r USING tmp_dev_sample s WHERE r.sample_id = s.id;
DELETE FROM clinlims.observation_history h USING tmp_dev_sample s WHERE h.sample_id = s.id;
DELETE FROM clinlims.order_attachment a USING tmp_dev_sample s WHERE a.sample_id = s.id;
DELETE FROM clinlims.order_label_request l USING tmp_dev_sample s WHERE l.parent_sample_id = s.id;
DELETE FROM clinlims.fhir_intake_receipt f USING tmp_dev_sample s WHERE f.sample_id = s.id;

-- 3) sample 本体
DELETE FROM clinlims.sample s USING tmp_dev_sample t WHERE s.id = t.id;

-- 4) 电子订单（关联 DEV 患者或 DEV 样本）
DELETE FROM clinlims.electronic_order e USING tmp_dev_patient p WHERE e.patient_id = p.pid;

-- 5) 患者与 person
DELETE FROM clinlims.patient_identity i USING tmp_dev_patient t WHERE i.patient_id = t.pid;
DELETE FROM clinlims.patient_merge_audit m USING tmp_dev_patient t WHERE m.merged_patient_id = t.pid OR m.primary_patient_id = t.pid;
DELETE FROM clinlims.patient_patient_type pt USING tmp_dev_patient t WHERE pt.patient_id = t.pid;
DELETE FROM clinlims.patient_relations r USING tmp_dev_patient t WHERE r.pat_id = t.pid OR r.pat_id_source = t.pid;
DELETE FROM clinlims.patient_report_release rr USING tmp_dev_patient t WHERE rr.patient_id = t.pid;
DELETE FROM clinlims.result_calculation rc USING tmp_dev_patient t WHERE rc.patient_id = t.pid;
UPDATE clinlims.patient SET merged_into_patient_id = NULL
  WHERE merged_into_patient_id IN (SELECT pid FROM tmp_dev_patient);
DELETE FROM clinlims.patient p USING tmp_dev_patient t WHERE p.id = t.pid;
-- person 子表（person_address 等）
DELETE FROM clinlims.person_address a USING tmp_dev_patient t WHERE a.person_id = t.person_id;
DELETE FROM clinlims.external_connection_contact c USING tmp_dev_patient t WHERE c.person_id = t.person_id;
DELETE FROM clinlims.provider pr USING tmp_dev_patient t WHERE pr.person_id = t.person_id;
DELETE FROM clinlims.person pn USING tmp_dev_patient t
  WHERE pn.id = t.person_id
    AND NOT EXISTS (SELECT 1 FROM clinlims.patient p WHERE p.person_id = pn.id);

-- 6) 清理临时表
DROP TABLE tmp_dev_sample, tmp_dev_sampitem, tmp_dev_analysis, tmp_dev_patient;

-- 提交前请人工核对影响行数；确认无误后取消注释 COMMIT：
-- COMMIT;
ROLLBACK;
