-- Chinese tertiary general hospital showcase data for the disposable local E2E stack.
-- All people, identifiers, organizations and clinical values in this file are synthetic.
-- Never load this file into a hospital or production database.

BEGIN;

SET LOCAL search_path TO clinlims;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF current_database() <> 'clinlims' THEN
    RAISE EXCEPTION 'Showcase data may only be loaded into the clinlims database';
  END IF;
  IF EXISTS (SELECT 1 FROM patient) OR EXISTS (SELECT 1 FROM sample) THEN
    RAISE EXCEPTION 'Showcase loader requires a freshly initialized database with no patients or samples';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM system_user WHERE id = 1 AND login_name = 'admin') THEN
    RAISE EXCEPTION 'Expected baseline administrator is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM test WHERE id = 13)
      OR NOT EXISTS (SELECT 1 FROM type_of_sample WHERE id IN (1, 2, 3, 4, 25, 30, 31)) THEN
    RAISE EXCEPTION 'Required baseline test and specimen dictionaries are missing';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Site identity and a focused Chinese clinical catalog.
-- ---------------------------------------------------------------------------

UPDATE site_information SET value = '华东医学中心附属医院（演示）', lastupdated = clock_timestamp()
WHERE lower(name) = 'sitename';
UPDATE site_information SET value = 'HMC-DEMO', lastupdated = clock_timestamp()
WHERE name = 'siteNumber';
UPDATE site_information SET value = '林远航（演示）', lastupdated = clock_timestamp()
WHERE lower(name) = 'lab director';
UPDATE site_information SET value = '合成演示数据·禁止用于临床诊疗', lastupdated = clock_timestamp()
WHERE lower(name) = 'additional site info';

UPDATE organization
SET name = '华东医学中心附属医院（演示）', short_name = 'HMC-DEMO', code = 'HMC-DEMO',
    city = '海州市', state = '华东', street_address = '健康大道100号（演示地址）',
    lastupdated = clock_timestamp()
WHERE id = 7;

UPDATE test_section SET name = '临床化学', description = '生化、糖脂代谢和肝肾功能', sort_order = 10, is_active = 'Y' WHERE id = 56;
UPDATE test_section SET name = '临床血液学', description = '血细胞分析及血液学检验', sort_order = 20, is_active = 'Y' WHERE id = 36;
UPDATE test_section SET name = '临床免疫学', description = '感染免疫与血清学检验', sort_order = 30, is_active = 'Y' WHERE id = 117;
UPDATE test_section SET name = '分子诊断', description = '病原体核酸与分子检测', sort_order = 40, is_active = 'Y' WHERE id = 136;
UPDATE test_section SET name = '临床微生物学', description = '培养、鉴定与药敏试验', sort_order = 50, is_active = 'Y' WHERE id = 57;
UPDATE test_section SET name = '病理学', description = '组织病理与细胞病理', sort_order = 60, is_active = 'Y' WHERE id = 163;

UPDATE type_of_sample SET description = '尿液', local_abbrev = '尿液', sort_order = 30, is_active = true WHERE id = 1;
UPDATE type_of_sample SET description = '血清', local_abbrev = '血清', sort_order = 10, is_active = true WHERE id = 2;
UPDATE type_of_sample SET description = '血浆', local_abbrev = '血浆', sort_order = 20, is_active = true WHERE id = 3;
UPDATE type_of_sample SET description = '全血', local_abbrev = '全血', sort_order = 40, is_active = true WHERE id = 4;
UPDATE type_of_sample SET description = '无抗凝管', local_abbrev = '无抗凝管', sort_order = 50, is_active = true WHERE id = 24;
UPDATE type_of_sample SET description = 'EDTA抗凝全血', local_abbrev = 'EDTA全血', sort_order = 60, is_active = true WHERE id = 25;
UPDATE type_of_sample SET description = '呼吸道拭子', local_abbrev = '呼吸道拭子', sort_order = 70, is_active = true WHERE id = 30;
UPDATE type_of_sample SET description = '痰液', local_abbrev = '痰液', sort_order = 80, is_active = true WHERE id = 31;
UPDATE type_of_sample SET description = '体液', local_abbrev = '体液', sort_order = 90, is_active = true WHERE id = 32;
UPDATE type_of_sample SET description = '病理组织', local_abbrev = '病理组织', sort_order = 100, is_active = true WHERE id = 34;

UPDATE test SET is_active = 'N', is_reportable = 'N', orderable = false, lastupdated = clock_timestamp();

UPDATE test SET name = '丙氨酸氨基转移酶（ALT）', reporting_description = 'ALT', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 10 WHERE id = 1;
UPDATE test SET name = '天门冬氨酸氨基转移酶（AST）', reporting_description = 'AST', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 20 WHERE id = 2;
UPDATE test SET name = '葡萄糖（GLU）', reporting_description = 'GLU', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 30 WHERE id = 3;
UPDATE test SET name = '肌酐（CREA）', reporting_description = 'CREA', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 40 WHERE id = 4;
UPDATE test SET name = '白蛋白（ALB）', reporting_description = 'ALB', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 50 WHERE id = 6;
UPDATE test SET name = '总胆固醇（TC）', reporting_description = 'TC', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 60 WHERE id = 7;
UPDATE test SET name = '高密度脂蛋白胆固醇（HDL-C）', reporting_description = 'HDL-C', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 70 WHERE id = 8;
UPDATE test SET name = '甘油三酯（TG）', reporting_description = 'TG', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 80 WHERE id = 9;
UPDATE test SET name = '白细胞计数（WBC）', reporting_description = 'WBC', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 10 WHERE id = 13;
UPDATE test SET name = '红细胞计数（RBC）', reporting_description = 'RBC', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 20 WHERE id = 14;
UPDATE test SET name = '血红蛋白（HGB）', reporting_description = 'HGB', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 30 WHERE id = 15;
UPDATE test SET name = '红细胞压积（HCT）', reporting_description = 'HCT', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 40 WHERE id = 16;
UPDATE test SET name = '平均红细胞体积（MCV）', reporting_description = 'MCV', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 50 WHERE id = 17;
UPDATE test SET name = '平均红细胞血红蛋白量（MCH）', reporting_description = 'MCH', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 60 WHERE id = 18;
UPDATE test SET name = '平均红细胞血红蛋白浓度（MCHC）', reporting_description = 'MCHC', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 70 WHERE id = 19;
UPDATE test SET name = '血小板计数（PLT）', reporting_description = 'PLT', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 80 WHERE id = 20;
UPDATE test SET name = '中性粒细胞百分比（NEU%）', reporting_description = 'NEU%', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 90 WHERE id = 21;
UPDATE test SET name = '中性粒细胞绝对值（NEU#）', reporting_description = 'NEU#', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 100 WHERE id = 22;
UPDATE test SET name = '淋巴细胞百分比（LYM%）', reporting_description = 'LYM%', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 110 WHERE id = 27;
UPDATE test SET name = '淋巴细胞绝对值（LYM#）', reporting_description = 'LYM#', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 120 WHERE id = 28;
UPDATE test SET name = '单核细胞百分比（MON%）', reporting_description = 'MON%', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 130 WHERE id = 29;
UPDATE test SET name = '单核细胞绝对值（MON#）', reporting_description = 'MON#', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 140 WHERE id = 30;
UPDATE test SET name = '乙型肝炎表面抗原（HBsAg）', reporting_description = 'HBsAg', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 10 WHERE id = 36;
UPDATE test SET name = '新型冠状病毒核酸检测', reporting_description = 'SARS-CoV-2 RNA', is_active = 'Y', is_reportable = 'Y', orderable = true, sort_order = 10 WHERE id = 300;

-- ---------------------------------------------------------------------------
-- Clinical departments and synthetic requesting clinicians.
-- ---------------------------------------------------------------------------

INSERT INTO organization (id, name, short_name, code, is_active, org_mlt_org_mlt_id, lastupdated, fhir_uuid)
VALUES
  (9200100, '急诊医学科', '急诊', 'ED', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200101, '呼吸与危重症医学科', '呼吸', 'PCCM', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200102, '心血管内科', '心内', 'CARD', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200103, '消化内科', '消化', 'GI', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200104, '肾脏内科', '肾内', 'NEPH', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200105, '内分泌科', '内分泌', 'ENDO', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200106, '血液科', '血液', 'HEMA', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200107, '肿瘤科', '肿瘤', 'ONCO', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200108, '神经内科', '神内', 'NEUR', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200109, '普通外科', '普外', 'GS', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200110, '妇产科', '妇产', 'OBGY', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200111, '儿科', '儿科', 'PED', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200112, '重症医学科', 'ICU', 'ICU', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200113, '感染性疾病科', '感染', 'ID', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200114, '老年医学科', '老年', 'GERI', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200115, '全科医学科', '全科', 'GP', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200116, '健康管理中心', '健管', 'HMC', 'Y', NULL, clock_timestamp(), gen_random_uuid()),
  (9200117, '医学检验科', '检验科', 'LAB', 'Y', NULL, clock_timestamp(), gen_random_uuid());

INSERT INTO organization_organization_type (org_id, org_type_id)
SELECT id, 11 FROM organization WHERE id BETWEEN 9200100 AND 9200117;

WITH clinicians(seq, family_name, given_name, department_code) AS (
  VALUES
    (1, '赵', '文博', 'ED'), (2, '钱', '思远', 'PCCM'), (3, '孙', '明哲', 'CARD'),
    (4, '李', '雅宁', 'GI'), (5, '周', '海峰', 'NEPH'), (6, '吴', '雨桐', 'ENDO'),
    (7, '郑', '子涵', 'HEMA'), (8, '王', '嘉怡', 'ONCO'), (9, '冯', '俊杰', 'NEUR'),
    (10, '陈', '安然', 'GS'), (11, '褚', '若琳', 'OBGY'), (12, '卫', '天佑', 'PED')
)
INSERT INTO person (id, last_name, first_name, email, lastupdated)
SELECT 9300000 + seq, family_name, given_name,
       'demo-doctor-' || lpad(seq::text, 2, '0') || '@example.invalid', clock_timestamp()
FROM clinicians;

INSERT INTO provider (id, person_id, external_id, provider_type, lastupdated, fhir_uuid, active)
SELECT id, id, 'DEMO-DOC-' || lpad((id - 9300000)::text, 3, '0'), 'D',
       clock_timestamp(), gen_random_uuid(), true
FROM person WHERE id BETWEEN 9300001 AND 9300012;

-- ---------------------------------------------------------------------------
-- Forty-eight synthetic Chinese patient records.
-- ---------------------------------------------------------------------------

WITH patients(seq, family_name, given_name, gender, birth_date) AS (
  VALUES
    (1,'张','伟','M',DATE '1982-03-16'), (2,'王','芳','F',DATE '1976-11-08'),
    (3,'李','娜','F',DATE '1990-06-21'), (4,'刘','洋','M',DATE '1968-01-12'),
    (5,'陈','静','F',DATE '1988-09-03'), (6,'杨','勇','M',DATE '1971-12-27'),
    (7,'赵','敏','F',DATE '1995-04-18'), (8,'黄','磊','M',DATE '1985-07-30'),
    (9,'周','婷','F',DATE '1962-02-14'), (10,'吴','军','M',DATE '1979-05-06'),
    (11,'徐','倩','F',DATE '2001-10-22'), (12,'孙','杰','M',DATE '1958-08-09'),
    (13,'胡','秀英','F',DATE '1949-01-26'), (14,'朱','强','M',DATE '1992-11-15'),
    (15,'高','雪','F',DATE '1984-03-02'), (16,'林','浩然','M',DATE '1974-06-11'),
    (17,'何','欣怡','F',DATE '1998-12-05'), (18,'郭','建国','M',DATE '1965-09-19'),
    (19,'马','慧','F',DATE '1987-07-07'), (20,'罗','宇轩','M',DATE '2006-02-28'),
    (21,'梁','婉清','F',DATE '1993-05-17'), (22,'宋','志远','M',DATE '1980-10-10'),
    (23,'郑','晓燕','F',DATE '1970-04-25'), (24,'谢','承泽','M',DATE '1989-01-31'),
    (25,'韩','佳宁','F',DATE '2003-08-13'), (26,'唐','国华','M',DATE '1955-12-20'),
    (27,'冯','雨欣','F',DATE '1996-06-04'), (28,'于','凯','M',DATE '1977-03-09'),
    (29,'董','丽华','F',DATE '1960-11-29'), (30,'萧','铭','M',DATE '1991-09-16'),
    (31,'程','雅雯','F',DATE '1983-02-07'), (32,'曹','俊峰','M',DATE '1969-05-23'),
    (33,'袁','心怡','F',DATE '1999-10-01'), (34,'邓','博文','M',DATE '1975-07-12'),
    (35,'许','梦洁','F',DATE '1986-04-06'), (36,'傅','晨阳','M',DATE '2008-01-18'),
    (37,'沈','桂兰','F',DATE '1952-08-24'), (38,'曾','海涛','M',DATE '1981-12-02'),
    (39,'彭','诗涵','F',DATE '1994-03-27'), (40,'吕','嘉豪','M',DATE '1973-06-15'),
    (41,'苏','月','F',DATE '2000-09-09'), (42,'卢','振华','M',DATE '1966-02-19'),
    (43,'蒋','思琪','F',DATE '1985-11-04'), (44,'蔡','宏宇','M',DATE '1997-05-28'),
    (45,'贾','兰','F',DATE '1959-07-17'), (46,'丁','睿','M',DATE '1988-10-26'),
    (47,'魏','安琪','F',DATE '2012-04-08'), (48,'薛','鹏','M',DATE '1972-01-05')
)
INSERT INTO person (id, last_name, first_name, city, state, country, primary_phone, email, lastupdated)
SELECT 9200000 + seq, family_name, given_name, '海州市', '华东省', '中国',
       'DEMO-PHONE-' || lpad(seq::text, 4, '0'),
       'demo-patient-' || lpad(seq::text, 3, '0') || '@example.invalid', clock_timestamp()
FROM patients;

WITH patients(seq, gender, birth_date) AS (
  VALUES
    (1,'M',DATE '1982-03-16'),(2,'F',DATE '1976-11-08'),(3,'F',DATE '1990-06-21'),(4,'M',DATE '1968-01-12'),
    (5,'F',DATE '1988-09-03'),(6,'M',DATE '1971-12-27'),(7,'F',DATE '1995-04-18'),(8,'M',DATE '1985-07-30'),
    (9,'F',DATE '1962-02-14'),(10,'M',DATE '1979-05-06'),(11,'F',DATE '2001-10-22'),(12,'M',DATE '1958-08-09'),
    (13,'F',DATE '1949-01-26'),(14,'M',DATE '1992-11-15'),(15,'F',DATE '1984-03-02'),(16,'M',DATE '1974-06-11'),
    (17,'F',DATE '1998-12-05'),(18,'M',DATE '1965-09-19'),(19,'F',DATE '1987-07-07'),(20,'M',DATE '2006-02-28'),
    (21,'F',DATE '1993-05-17'),(22,'M',DATE '1980-10-10'),(23,'F',DATE '1970-04-25'),(24,'M',DATE '1989-01-31'),
    (25,'F',DATE '2003-08-13'),(26,'M',DATE '1955-12-20'),(27,'F',DATE '1996-06-04'),(28,'M',DATE '1977-03-09'),
    (29,'F',DATE '1960-11-29'),(30,'M',DATE '1991-09-16'),(31,'F',DATE '1983-02-07'),(32,'M',DATE '1969-05-23'),
    (33,'F',DATE '1999-10-01'),(34,'M',DATE '1975-07-12'),(35,'F',DATE '1986-04-06'),(36,'M',DATE '2008-01-18'),
    (37,'F',DATE '1952-08-24'),(38,'M',DATE '1981-12-02'),(39,'F',DATE '1994-03-27'),(40,'M',DATE '1973-06-15'),
    (41,'F',DATE '2000-09-09'),(42,'M',DATE '1966-02-19'),(43,'F',DATE '1985-11-04'),(44,'M',DATE '1997-05-28'),
    (45,'F',DATE '1959-07-17'),(46,'M',DATE '1988-10-26'),(47,'F',DATE '2012-04-08'),(48,'M',DATE '1972-01-05')
)
INSERT INTO patient (id, person_id, gender, birth_date, national_id, external_id, chart_number,
                     entered_birth_date, fhir_uuid, is_merged, lastupdated)
SELECT 9200000 + seq, 9200000 + seq, gender, birth_date,
       'DEMO-ID-' || lpad(seq::text, 4, '0'),
       'DEMO-MZ-' || lpad(seq::text, 6, '0'),
       'D' || lpad(seq::text, 7, '0'), to_char(birth_date, 'YYYY/MM/DD'),
       gen_random_uuid(), false, clock_timestamp()
FROM patients;

-- Eight synthetic HIS orders remain pending so the electronic-order list opens with data.
INSERT INTO electronic_order (id, external_id, patient_id, status_id, order_timestamp, data,
                              lastupdated, type, order_priority)
SELECT 9901000 + seq,
       'HIS-DEMO-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(seq::text, 3, '0'),
       9200000 + seq, 21,
       clock_timestamp() - (seq * interval '18 minutes'),
       json_build_object('resourceType','ServiceRequest','status','active','intent','order',
                         'subject',json_build_object('reference','Patient/DEMO-' || lpad(seq::text,4,'0')),
                         'note',json_build_array(json_build_object('text','合成演示电子申请')))::text,
       clock_timestamp(), 'FHIR',
       CASE WHEN seq IN (1, 5) THEN 'STAT' ELSE 'ROUTINE' END
FROM generate_series(1, 8) AS seq;

-- ---------------------------------------------------------------------------
-- Forty-eight applications, including nine multi-tube orders and mixed states.
-- Six finalized applications stay on the current day; the remaining finalized
-- applications span prior months so the dashboard and annual statistics both
-- have meaningful data.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE demo_order_plan AS
SELECT seq,
       CASE
         WHEN seq <= 24 THEN clock_timestamp() - ((seq - 1) * interval '22 minutes')
         WHEN seq <= 30 THEN clock_timestamp() - ((seq - 24) * interval '35 minutes')
         ELSE clock_timestamp() - ((seq - 30) * interval '20 days')
       END AS order_time,
       CASE WHEN seq <= 12 OR seq >= 45 THEN 1 WHEN seq <= 24 THEN 2 ELSE 3 END AS order_status,
       CASE WHEN seq <= 12 OR seq >= 45 THEN 4 WHEN seq <= 24 THEN 15 WHEN seq <= 42 THEN 6 ELSE 13 END AS analysis_status,
       CASE WHEN seq % 7 = 0 OR seq IN (1, 45) THEN 'STAT' ELSE 'ROUTINE' END AS priority,
       CASE (seq % 6)
         WHEN 0 THEN 13 WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 4 WHEN 4 THEN 14 ELSE 15 END AS first_test_id,
       CASE (seq % 6)
         WHEN 0 THEN 20 WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 3 WHEN 4 THEN 15 ELSE 13 END AS second_test_id,
       (seq % 5 = 0) AS multi_tube
FROM generate_series(1, 48) AS seq;

INSERT INTO sample (id, accession_number, domain, next_item_sequence, revision, entered_date, received_date,
                    collection_date, status_id, sys_user_id, barcode, lastupdated, priority, fhir_uuid,
                    order_priority, storage_skipped, is_confirmation)
SELECT 9400000 + seq,
       'HMC' || to_char(current_date, 'YYMMDD') || lpad(seq::text, 5, '0'),
       'H', CASE WHEN multi_tube THEN 3 ELSE 2 END, 0,
       order_time, order_time + interval '8 minutes', order_time + interval '3 minutes',
       order_status, 1,
       'HMC' || to_char(current_date, 'YYMMDD') || lpad(seq::text, 5, '0'),
       clock_timestamp(), CASE WHEN priority = 'STAT' THEN 1 ELSE 0 END,
       gen_random_uuid(), priority, true, false
FROM demo_order_plan;

INSERT INTO sample_human (id, provider_id, samp_id, patient_id, lastupdated)
SELECT 9400000 + seq, 9300000 + (((seq - 1) % 12) + 1), 9400000 + seq,
       9200000 + (((seq - 1) % 48) + 1), clock_timestamp()
FROM demo_order_plan;

INSERT INTO sample_organization (id, org_id, samp_id, samp_org_type, lastupdated)
SELECT 9500000 + seq, 9200100 + ((seq - 1) % 17), 9400000 + seq, 'R', clock_timestamp()
FROM demo_order_plan;

INSERT INTO sample_item (id, sort_order, samp_id, typeosamp_id, quantity, remaining_quantity,
                         external_id, collection_date, received_date, status_id, collector,
                         fhir_uuid, rejected, voided, collection_method, specimen_origin, lastupdated)
SELECT 9600000 + seq * 10 + 1, 1, 9400000 + seq,
       CASE WHEN first_test_id BETWEEN 13 AND 30 THEN 25 ELSE 2 END,
       CASE WHEN first_test_id BETWEEN 13 AND 30 THEN 3.0 ELSE 5.0 END,
       CASE WHEN first_test_id BETWEEN 13 AND 30 THEN 1.8 ELSE 3.5 END,
       'HMC' || to_char(current_date, 'YYMMDD') || lpad(seq::text, 5, '0') || '-1',
       order_time + interval '3 minutes', order_time + interval '8 minutes',
       CASE WHEN analysis_status = 13 THEN 27 WHEN analysis_status = 6 THEN 3 ELSE 1 END,
       '采集员' || (((seq - 1) % 6) + 1), gen_random_uuid(), analysis_status = 13, false,
       '静脉采血', CASE WHEN seq % 3 = 0 THEN '住院' ELSE '门诊' END, clock_timestamp()
FROM demo_order_plan;

INSERT INTO sample_item (id, sort_order, samp_id, typeosamp_id, quantity, remaining_quantity,
                         external_id, collection_date, received_date, status_id, collector,
                         fhir_uuid, rejected, voided, collection_method, specimen_origin, lastupdated)
SELECT 9600000 + seq * 10 + 2, 2, 9400000 + seq,
       CASE WHEN first_test_id BETWEEN 13 AND 30 THEN 2 ELSE 25 END,
       CASE WHEN first_test_id BETWEEN 13 AND 30 THEN 5.0 ELSE 3.0 END,
       CASE WHEN first_test_id BETWEEN 13 AND 30 THEN 3.5 ELSE 1.8 END,
       'HMC' || to_char(current_date, 'YYMMDD') || lpad(seq::text, 5, '0') || '-2',
       order_time + interval '4 minutes', order_time + interval '9 minutes',
       CASE WHEN analysis_status = 6 THEN 3 ELSE 1 END,
       '采集员' || (((seq - 1) % 6) + 1), gen_random_uuid(), false, false,
       '静脉采血', CASE WHEN seq % 3 = 0 THEN '住院' ELSE '门诊' END, clock_timestamp()
FROM demo_order_plan WHERE multi_tube;

CREATE TEMP TABLE demo_analysis_plan AS
SELECT seq, 1 AS slot, first_test_id AS test_id,
       9600000 + seq * 10 + 1 AS item_id, analysis_status, order_time
FROM demo_order_plan
UNION ALL
SELECT seq, 2 AS slot, second_test_id AS test_id,
       CASE WHEN multi_tube THEN 9600000 + seq * 10 + 2 ELSE 9600000 + seq * 10 + 1 END AS item_id,
       analysis_status, order_time
FROM demo_order_plan;

INSERT INTO analysis (id, sampitem_id, test_sect_id, test_id, revision, status_id, started_date,
                      completed_date, released_date, is_reportable, analysis_type, lastupdated,
                      entry_date, referred_out, corrected, fhir_uuid, result_calculated)
SELECT 9700000 + seq * 10 + slot, item_id,
       CASE WHEN test_id BETWEEN 13 AND 30 THEN 36 ELSE 56 END,
       test_id, 0, analysis_status,
       CASE WHEN analysis_status <> 4 THEN order_time + interval '25 minutes' END,
       CASE WHEN analysis_status IN (6, 7, 13, 15) THEN order_time + interval '55 minutes' END,
       CASE WHEN analysis_status = 6 THEN order_time + interval '75 minutes' END,
       'Y', 'MANUAL', clock_timestamp(),
       CASE WHEN analysis_status IN (6, 7, 13, 15) THEN order_time + interval '50 minutes' END,
       false, false, gen_random_uuid(), false
FROM demo_analysis_plan;

INSERT INTO result (id, analysis_id, sort_order, is_reportable, result_type, value,
                    lastupdated, min_normal, max_normal, significant_digits, grouping, fhir_uuid)
SELECT 9800000 + seq * 10 + slot,
       9700000 + seq * 10 + slot, 1, 'Y', 'N',
       CASE test_id
         WHEN 1 THEN (22 + (seq % 9))::text
         WHEN 2 THEN (20 + (seq % 8))::text
         WHEN 3 THEN (4.6 + ((seq % 9) * 0.1))::numeric(4,1)::text
         WHEN 4 THEN (68 + (seq % 24))::text
         WHEN 13 THEN (5.2 + ((seq % 18) * 0.2))::numeric(4,1)::text
         WHEN 14 THEN (4.1 + ((seq % 8) * 0.1))::numeric(4,1)::text
         WHEN 15 THEN (125 + (seq % 26))::text
         WHEN 20 THEN (180 + (seq % 90))::text
         ELSE '7.2'
       END,
       clock_timestamp(),
       CASE test_id WHEN 1 THEN 7 WHEN 2 THEN 13 WHEN 3 THEN 3.9 WHEN 4 THEN 41
                    WHEN 13 THEN 3.5 WHEN 14 THEN 3.8 WHEN 15 THEN 115 WHEN 20 THEN 125 END,
       CASE test_id WHEN 1 THEN 40 WHEN 2 THEN 35 WHEN 3 THEN 6.1 WHEN 4 THEN 111
                    WHEN 13 THEN 9.5 WHEN 14 THEN 5.8 WHEN 15 THEN 175 WHEN 20 THEN 350 END,
       CASE WHEN test_id IN (3, 13, 14) THEN 1 ELSE 0 END,
       0, gen_random_uuid()
FROM demo_analysis_plan
WHERE analysis_status IN (6, 7, 13, 15);

INSERT INTO result_signature (id, result_id, system_user_id, is_supervisor, lastupdated, non_user_name)
SELECT 9900000 + seq * 10 + slot, 9800000 + seq * 10 + slot, 1, true,
       clock_timestamp(), '系统管理员（演示审核）'
FROM demo_analysis_plan
WHERE analysis_status = 6;

-- Keep sequences ahead of all synthetic fixture ranges.
SELECT setval('person_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM person), 9300012)::bigint, true);
SELECT setval('provider_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM provider), 9300012)::bigint, true);
SELECT setval('patient_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM patient), 9200048)::bigint, true);
SELECT setval('organization_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM organization), 9200117)::bigint, true);
SELECT setval('sample_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM sample), 9400048)::bigint, true);
SELECT setval('sample_human_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM sample_human), 9400048)::bigint, true);
SELECT setval('sample_org_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM sample_organization), 9500048)::bigint, true);
SELECT setval('sample_item_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM sample_item), 9600482)::bigint, true);
SELECT setval('analysis_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM analysis), 9700482)::bigint, true);
SELECT setval('result_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM result), 9800482)::bigint, true);
SELECT setval('result_signature_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM result_signature), 9900482)::bigint, true);
SELECT setval('electronic_order_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM electronic_order), 9901008)::bigint, true);

DO $$
DECLARE
  patient_count integer;
  order_count integer;
  tube_count integer;
  analysis_count integer;
  pending_count integer;
  review_count integer;
  final_count integer;
  electronic_order_count integer;
  multi_tube_count integer;
  today_finalized_count integer;
  unsafe_id_count integer;
BEGIN
  SELECT count(*) INTO patient_count FROM patient WHERE external_id LIKE 'DEMO-MZ-%';
  SELECT count(*) INTO order_count FROM sample WHERE accession_number LIKE 'HMC%';
  SELECT count(*) INTO tube_count FROM sample_item WHERE external_id LIKE 'HMC%';
  SELECT count(*) INTO analysis_count FROM analysis WHERE id BETWEEN 9700001 AND 9700482;
  SELECT count(*) INTO pending_count FROM analysis WHERE id BETWEEN 9700001 AND 9700482 AND status_id = 4;
  SELECT count(*) INTO review_count FROM analysis WHERE id BETWEEN 9700001 AND 9700482 AND status_id = 15;
  SELECT count(*) INTO final_count FROM analysis WHERE id BETWEEN 9700001 AND 9700482 AND status_id = 6;
  SELECT count(*) INTO electronic_order_count
    FROM electronic_order
    WHERE id BETWEEN 9901001 AND 9901008 AND external_id LIKE 'HIS-DEMO-%';
  SELECT count(*) INTO multi_tube_count
    FROM (
      SELECT samp_id
      FROM sample_item
      WHERE external_id LIKE 'HMC%'
      GROUP BY samp_id
      HAVING count(*) > 1
    ) AS multi_tube_orders;
  SELECT count(DISTINCT si.samp_id) INTO today_finalized_count
    FROM analysis a
    JOIN sample_item si ON si.id = a.sampitem_id
    WHERE a.id BETWEEN 9700001 AND 9700482
      AND a.status_id = 6
      AND a.released_date::date = current_date;
  SELECT count(*) INTO unsafe_id_count
    FROM patient
    WHERE external_id LIKE 'DEMO-MZ-%'
      AND national_id ~ '^[0-9]{17}[0-9Xx]$';

  IF patient_count <> 48 OR order_count <> 48 OR tube_count <> 57 OR analysis_count <> 96
      OR pending_count <> 32 OR review_count <> 24 OR final_count <> 36
      OR electronic_order_count <> 8 OR multi_tube_count <> 9
      OR today_finalized_count <> 6 OR unsafe_id_count <> 0 THEN
    RAISE EXCEPTION 'Showcase verification failed patients=% orders=% tubes=% analyses=% pending=% review=% final=% eorders=% multi_tube=% today_finalized=% unsafe_ids=%',
      patient_count, order_count, tube_count, analysis_count, pending_count, review_count, final_count,
      electronic_order_count, multi_tube_count, today_finalized_count, unsafe_id_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM person p JOIN patient pt ON pt.person_id = p.id
    WHERE pt.external_id LIKE 'DEMO-MZ-%' AND (p.first_name ~ '[A-Za-z]' OR p.last_name ~ '[A-Za-z]')
  ) THEN
    RAISE EXCEPTION 'Showcase patient names must be Chinese';
  END IF;
END $$;

COMMIT;
