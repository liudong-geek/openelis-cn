-- China delivery localization overlay for operator-facing core laboratory data.
-- Matching is case-insensitive but otherwise exact after trimming outer spaces.
-- Core English values and integration codes are never rewritten.

WITH section_translations(source_value, chinese_value) AS (
    VALUES
        ('bacteria', '细菌学'),
        ('biochemistry', '生化'),
        ('cytology', '细胞学'),
        ('hemato-immunology', '血液免疫学'),
        ('immunohistochemistry', '免疫组织化学'),
        ('immunology', '免疫学'),
        ('molecular biology', '分子生物学'),
        ('mycobacteriology', '分枝杆菌学'),
        ('parasitology', '寄生虫学'),
        ('pathology', '病理学'),
        ('serology', '血清学'),
        ('serology-immunology', '血清免疫学'),
        ('virologie', '病毒学'),
        ('virology', '病毒学')
), targets AS (
    SELECT DISTINCT ts.name_localization_id AS localization_id, m.chinese_value
    FROM clinlims.test_section ts
    LEFT JOIN clinlims.localization_value en
        ON en.localization_id = ts.name_localization_id AND en.locale = 'en'
    JOIN section_translations m
        ON lower(btrim(COALESCE(NULLIF(en.value, ''), ts.name))) = m.source_value
    WHERE ts.name_localization_id IS NOT NULL
      AND ts.domain = 'CLINICAL'
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();

WITH sample_translations(source_value, chinese_value) AS (
    VALUES
        ('dbs', '干血斑（DBS）'),
        ('dry tube', '无添加剂采血管'),
        ('edta tube', 'EDTA抗凝管'),
        ('fluid', '体液'),
        ('histopathology specimen', '组织病理标本'),
        ('immunohistochemistry specimen', '免疫组化标本'),
        ('plasma', '血浆'),
        ('respiratory swab', '呼吸道拭子'),
        ('serum', '血清'),
        ('sputum', '痰'),
        ('tissue antemortem', '生前组织标本'),
        ('tissue post mortem', '尸检组织标本'),
        ('urines', '尿液')
), targets AS (
    SELECT DISTINCT tos.name_localization_id AS localization_id, m.chinese_value
    FROM clinlims.type_of_sample tos
    LEFT JOIN clinlims.localization_value en
        ON en.localization_id = tos.name_localization_id AND en.locale = 'en'
    JOIN sample_translations m
        ON lower(btrim(COALESCE(NULLIF(en.value, ''), tos.description))) = m.source_value
    WHERE tos.name_localization_id IS NOT NULL
      AND tos.domain = 'CLINICAL'
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();

WITH panel_translations(source_value, chinese_value) AS (
    VALUES
        ('bilan biochimique', '生化检验组合'),
        ('nfs', '血常规（CBC）'),
        ('serologie vih', 'HIV血清学'),
        ('typage lymphocytaire', '淋巴细胞亚群')
), targets AS (
    SELECT DISTINCT p.name_localization_id AS localization_id, m.chinese_value
    FROM clinlims.panel p
    LEFT JOIN clinlims.localization_value en
        ON en.localization_id = p.name_localization_id AND en.locale = 'en'
    JOIN panel_translations m
        ON lower(btrim(COALESCE(NULLIF(en.value, ''), p.name))) = m.source_value
    WHERE p.name_localization_id IS NOT NULL
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();

WITH test_translations(section_source, source_value, chinese_value) AS (
    VALUES
        ('biochemistry', 'albumin', '白蛋白'),
        ('biochemistry', 'amylase', '淀粉酶'),
        ('biochemistry', 'beta hcg', 'β-人绒毛膜促性腺激素（β-hCG）'),
        ('biochemistry', 'creatinine', '肌酐'),
        ('biochemistry', 'créatininémie', '血肌酐'),
        ('biochemistry', 'glucose', '葡萄糖'),
        ('biochemistry', 'glycémie', '血糖'),
        ('biochemistry', 'got/asat', '天门冬氨酸氨基转移酶（AST）'),
        ('biochemistry', 'gpt/alat', '丙氨酸氨基转移酶（ALT）'),
        ('biochemistry', 'hdl cholesterol', '高密度脂蛋白胆固醇（HDL-C）'),
        ('biochemistry', 'proteinuria dipstick', '尿蛋白（试纸法）'),
        ('biochemistry', 'total cholesterol', '总胆固醇（TC）'),
        ('biochemistry', 'transaminases altl', '丙氨酸氨基转移酶（ALT）'),
        ('biochemistry', 'transaminases astl', '天门冬氨酸氨基转移酶（AST）'),
        ('biochemistry', 'triglicerides', '甘油三酯（TG）'),
        ('biochemistry', 'urine prenancy test', '尿妊娠试验'),
        ('hematology', 'bas#(whole blood)', '嗜碱性粒细胞绝对值（BAS#）'),
        ('hematology', 'bas%(whole blood)', '嗜碱性粒细胞百分比（BAS%）'),
        ('hematology', 'ccmh', '平均红细胞血红蛋白浓度（MCHC）'),
        ('hematology', 'eo %', '嗜酸性粒细胞百分比（EOS%）'),
        ('hematology', 'eos#(whole blood)', '嗜酸性粒细胞绝对值（EOS#）'),
        ('hematology', 'eos%(whole blood)', '嗜酸性粒细胞百分比（EOS%）'),
        ('hematology', 'gb', '白细胞计数（WBC）'),
        ('hematology', 'gr', '红细胞计数（RBC）'),
        ('hematology', 'hb', '血红蛋白（HGB）'),
        ('hematology', 'lym%(whole blood)', '淋巴细胞百分比（LYM%）'),
        ('hematology', 'mon#(whole blood)', '单核细胞绝对值（MON#）'),
        ('hematology', 'mon%(whole blood)', '单核细胞百分比（MON%）'),
        ('hematology', 'mxd%(whole blood)', '混合细胞百分比（MXD%）'),
        ('hematology', 'neu%(whole blood)', '中性粒细胞百分比（NEU%）'),
        ('hematology', 'plq', '血小板计数（PLT）'),
        ('hematology', 'tcmh', '平均红细胞血红蛋白量（MCH）'),
        ('hematology', 'vgm', '平均红细胞体积（MCV）')
), targets AS (
    SELECT DISTINCT t.name_localization_id AS localization_id, m.chinese_value
    FROM clinlims.test t
    JOIN clinlims.test_section ts ON ts.id = t.test_section_id
    LEFT JOIN clinlims.localization_value section_en
        ON section_en.localization_id = ts.name_localization_id AND section_en.locale = 'en'
    LEFT JOIN clinlims.localization_value test_en
        ON test_en.localization_id = t.name_localization_id AND test_en.locale = 'en'
    JOIN test_translations m
        ON lower(btrim(COALESCE(NULLIF(section_en.value, ''), ts.name))) = m.section_source
       AND lower(btrim(COALESCE(NULLIF(test_en.value, ''), t.name))) = m.source_value
    WHERE t.name_localization_id IS NOT NULL
      AND t.domain = 'CLINICAL'
      AND ts.domain = 'CLINICAL'
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();

-- A report label receives the same Chinese value only when its canonical English
-- value is exactly the same as the already-localized test name. This fills the
-- independent reporting localization without guessing when report wording differs.
WITH targets AS (
    SELECT DISTINCT t.reporting_name_localization_id AS localization_id, name_zh.value AS chinese_value
    FROM clinlims.test t
    JOIN clinlims.test_section ts ON ts.id = t.test_section_id
    LEFT JOIN clinlims.localization_value section_en
        ON section_en.localization_id = ts.name_localization_id AND section_en.locale = 'en'
    JOIN clinlims.localization_value name_en
        ON name_en.localization_id = t.name_localization_id AND name_en.locale = 'en'
    JOIN clinlims.localization_value name_zh
        ON name_zh.localization_id = t.name_localization_id AND name_zh.locale = 'zh'
    JOIN clinlims.localization_value reporting_en
        ON reporting_en.localization_id = t.reporting_name_localization_id AND reporting_en.locale = 'en'
    WHERE t.reporting_name_localization_id IS NOT NULL
      AND t.domain = 'CLINICAL'
      AND ts.domain = 'CLINICAL'
      AND lower(btrim(COALESCE(NULLIF(section_en.value, ''), ts.name)))
          IN ('hematology', 'biochemistry')
      AND lower(btrim(name_en.value)) = lower(btrim(reporting_en.value))
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();
