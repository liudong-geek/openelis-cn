-- China delivery localization overlay for the most common CBC workflow data.
-- Match only exact canonical English names; never rewrite the core master value.

WITH section_translations(source_value, chinese_value) AS (
    VALUES ('hematology', '血液学')
), targets AS (
    SELECT DISTINCT ts.name_localization_id AS localization_id, m.chinese_value
    FROM clinlims.test_section ts
    LEFT JOIN clinlims.localization_value en
        ON en.localization_id = ts.name_localization_id AND en.locale = 'en'
    JOIN section_translations m
        ON lower(regexp_replace(btrim(COALESCE(NULLIF(en.value, ''), ts.name)), '[[:space:]]+', ' ', 'g'))
            = m.source_value
    WHERE ts.name_localization_id IS NOT NULL
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();

WITH sample_translations(source_value, chinese_value) AS (
    VALUES ('whole blood', '全血')
), targets AS (
    SELECT DISTINCT tos.name_localization_id AS localization_id, m.chinese_value
    FROM clinlims.type_of_sample tos
    LEFT JOIN clinlims.localization_value en
        ON en.localization_id = tos.name_localization_id AND en.locale = 'en'
    JOIN sample_translations m
        ON lower(regexp_replace(btrim(COALESCE(NULLIF(en.value, ''), tos.description)), '[[:space:]]+', ' ', 'g'))
            = m.source_value
    WHERE tos.name_localization_id IS NOT NULL
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();

WITH test_translations(source_value, chinese_value) AS (
    VALUES
        ('white blood cells count (wbc)', '白细胞计数（WBC）'),
        ('white blood cell count (wbc)', '白细胞计数（WBC）'),
        ('wbc', '白细胞计数（WBC）'),
        ('wbc(whole blood)', '白细胞计数（WBC）'),
        ('red blood cells count (rbc)', '红细胞计数（RBC）'),
        ('red blood cell count (rbc)', '红细胞计数（RBC）'),
        ('rbc', '红细胞计数（RBC）'),
        ('rbc(whole blood)', '红细胞计数（RBC）'),
        ('hemoglobin', '血红蛋白（HGB）'),
        ('haemoglobin', '血红蛋白（HGB）'),
        ('hgb', '血红蛋白（HGB）'),
        ('hgb(whole blood)', '血红蛋白（HGB）'),
        ('hematocrit', '红细胞压积（HCT）'),
        ('hct', '红细胞压积（HCT）'),
        ('hct(whole blood)', '红细胞压积（HCT）'),
        ('mean corpuscular volume', '平均红细胞体积（MCV）'),
        ('medium corpuscular volum', '平均红细胞体积（MCV）'),
        ('mcv', '平均红细胞体积（MCV）'),
        ('mcv(whole blood)', '平均红细胞体积（MCV）'),
        ('mean corpuscular hemoglobin', '平均红细胞血红蛋白量（MCH）'),
        ('mean corpuscular haemoglobin', '平均红细胞血红蛋白量（MCH）'),
        ('tmch', '平均红细胞血红蛋白量（MCH）'),
        ('mch', '平均红细胞血红蛋白量（MCH）'),
        ('mch(whole blood)', '平均红细胞血红蛋白量（MCH）'),
        ('mean corpuscular hemoglobin concentration', '平均红细胞血红蛋白浓度（MCHC）'),
        ('mean corpuscular haemoglobin concentration', '平均红细胞血红蛋白浓度（MCHC）'),
        ('cmch', '平均红细胞血红蛋白浓度（MCHC）'),
        ('mchc', '平均红细胞血红蛋白浓度（MCHC）'),
        ('mchc(whole blood)', '平均红细胞血红蛋白浓度（MCHC）'),
        ('platelet', '血小板计数（PLT）'),
        ('platelets', '血小板计数（PLT）'),
        ('platelet count', '血小板计数（PLT）'),
        ('plt', '血小板计数（PLT）'),
        ('plt(whole blood)', '血小板计数（PLT）'),
        ('red cell distribution width', '红细胞分布宽度（RDW）'),
        ('rdw', '红细胞分布宽度（RDW）'),
        ('rdw(whole blood)', '红细胞分布宽度（RDW）'),
        ('mean platelet volume', '平均血小板体积（MPV）'),
        ('mpv', '平均血小板体积（MPV）'),
        ('mpv(whole blood)', '平均血小板体积（MPV）'),
        ('lymph %', '淋巴细胞百分比（LYM%）'),
        ('lymphocytes (%)', '淋巴细胞百分比（LYM%）'),
        ('lym%(whole blood)', '淋巴细胞百分比（LYM%）'),
        ('lymphocytes (abs)', '淋巴细胞绝对值（LYM#）'),
        ('lym#(whole blood)', '淋巴细胞绝对值（LYM#）'),
        ('mono %', '单核细胞百分比（MON%）'),
        ('monocytes (%)', '单核细胞百分比（MON%）'),
        ('mon%(whole blood)', '单核细胞百分比（MON%）'),
        ('monocytes', '单核细胞绝对值（MON#）'),
        ('monocytes (abs)', '单核细胞绝对值（MON#）'),
        ('mon#(whole blood)', '单核细胞绝对值（MON#）'),
        ('neut %', '中性粒细胞百分比（NEU%）'),
        ('neutrophiles (%)', '中性粒细胞百分比（NEU%）'),
        ('neutrophils (%)', '中性粒细胞百分比（NEU%）'),
        ('neu%(whole blood)', '中性粒细胞百分比（NEU%）'),
        ('neutrophiles', '中性粒细胞绝对值（NEU#）'),
        ('neutrophils', '中性粒细胞绝对值（NEU#）'),
        ('neu#(whole blood)', '中性粒细胞绝对值（NEU#）'),
        ('eosinophiles (%)', '嗜酸性粒细胞百分比（EOS%）'),
        ('eosinophils (%)', '嗜酸性粒细胞百分比（EOS%）'),
        ('eos%(whole blood)', '嗜酸性粒细胞百分比（EOS%）'),
        ('eosinophiles', '嗜酸性粒细胞绝对值（EOS#）'),
        ('eosinophils', '嗜酸性粒细胞绝对值（EOS#）'),
        ('eos#(whole blood)', '嗜酸性粒细胞绝对值（EOS#）'),
        ('baso %', '嗜碱性粒细胞百分比（BAS%）'),
        ('basophiles (%)', '嗜碱性粒细胞百分比（BAS%）'),
        ('basophils (%)', '嗜碱性粒细胞百分比（BAS%）'),
        ('bas%(whole blood)', '嗜碱性粒细胞百分比（BAS%）'),
        ('basophiles', '嗜碱性粒细胞绝对值（BAS#）'),
        ('basophils', '嗜碱性粒细胞绝对值（BAS#）'),
        ('bas#(whole blood)', '嗜碱性粒细胞绝对值（BAS#）'),
        ('mxd%(whole blood)', '混合细胞百分比（MXD%）'),
        ('mxd#(whole blood)', '混合细胞绝对值（MXD#）')
), targets AS (
    SELECT DISTINCT t.name_localization_id AS localization_id, m.chinese_value
    FROM clinlims.test t
    LEFT JOIN clinlims.localization_value en
        ON en.localization_id = t.name_localization_id AND en.locale = 'en'
    JOIN test_translations m
        ON lower(regexp_replace(
            btrim(COALESCE(NULLIF(en.value, ''), t.name, t.local_code)), '[[:space:]]+', ' ', 'g'))
            = m.source_value
    WHERE t.name_localization_id IS NOT NULL
)
INSERT INTO clinlims.localization_value (id, localization_id, locale, value, last_updated)
SELECT nextval('clinlims.localization_value_seq'), localization_id, 'zh', chinese_value, now()
FROM targets
ON CONFLICT (localization_id, locale) DO UPDATE
SET value = EXCLUDED.value, last_updated = now();
