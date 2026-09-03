\set ON_ERROR_STOP on
\pset pager off

-- OpenELIS 中国医院版主数据完整性只读检查。
-- 用法：psql -U clinlims -d clinlims -f scripts/qa/master-data-integrity.sql
-- 本脚本不修改数据库。结果中的 ERROR 必须在生产发布前归零；WARNING
-- 需要由检验科和信息科确认是否属于本期启用范围。

WITH checks AS (
    SELECT '机构' AS domain, '启用机构总数' AS check_name, 'INFO' AS severity,
           COUNT(*)::bigint AS issue_count
      FROM clinlims.organization
     WHERE is_active = 'Y'
    UNION ALL
    SELECT '机构', '启用机构缺少稳定编码', 'ERROR', COUNT(*)
      FROM clinlims.organization
     WHERE is_active = 'Y' AND NULLIF(BTRIM(code), '') IS NULL
    UNION ALL
    SELECT '机构', '启用机构编码重复', 'ERROR', COALESCE(SUM(duplicates - 1), 0)
      FROM (
            SELECT UPPER(BTRIM(code)) AS normalized_code, COUNT(*) AS duplicates
              FROM clinlims.organization
             WHERE is_active = 'Y' AND NULLIF(BTRIM(code), '') IS NOT NULL
             GROUP BY UPPER(BTRIM(code))
            HAVING COUNT(*) > 1
           ) duplicate_codes

    UNION ALL
    SELECT '医生', '启用医生总数', 'INFO', COUNT(*)
      FROM clinlims.provider
     WHERE active = TRUE
    UNION ALL
    SELECT '医生', '启用医生缺少外部编码', 'ERROR', COUNT(*)
      FROM clinlims.provider
     WHERE active = TRUE AND NULLIF(BTRIM(external_id), '') IS NULL
    UNION ALL
    SELECT '医生', '启用医生缺少姓名', 'ERROR', COUNT(*)
      FROM clinlims.provider provider
      JOIN clinlims.person person ON person.id = provider.person_id
     WHERE provider.active = TRUE
       AND NULLIF(BTRIM(CONCAT_WS('', person.last_name, person.first_name)), '') IS NULL

    UNION ALL
    SELECT '检验项目', '启用且可开立的临床项目总数', 'INFO', COUNT(*)
      FROM clinlims.test
     WHERE is_active = 'Y' AND orderable = TRUE AND domain = 'CLINICAL'
    UNION ALL
    SELECT '检验项目', '启用可开立项目缺少专业组', 'ERROR', COUNT(*)
      FROM clinlims.test
     WHERE is_active = 'Y' AND orderable = TRUE AND domain = 'CLINICAL'
       AND test_section_id IS NULL
    UNION ALL
    SELECT '检验项目', '启用可开立项目缺少标本映射', 'ERROR', COUNT(*)
      FROM clinlims.test test
     WHERE test.is_active = 'Y' AND test.orderable = TRUE AND test.domain = 'CLINICAL'
       AND NOT EXISTS (
             SELECT 1 FROM clinlims.sampletype_test mapping WHERE mapping.test_id = test.id
           )
    UNION ALL
    SELECT '检验项目', '启用可开立项目缺少结果模型', 'ERROR', COUNT(*)
      FROM clinlims.test test
     WHERE test.is_active = 'Y' AND test.orderable = TRUE AND test.domain = 'CLINICAL'
       AND NOT EXISTS (
             SELECT 1
               FROM clinlims.test_result_component component
              WHERE component.test_id = test.id AND component.is_active = 'Y'
           )
    UNION ALL
    SELECT '检验项目', '新结果模型缺少唯一主结果组件', 'ERROR', COUNT(*)
      FROM clinlims.test test
     WHERE test.is_active = 'Y' AND test.orderable = TRUE AND test.domain = 'CLINICAL'
       AND EXISTS (
             SELECT 1
               FROM clinlims.test_result_component component
              WHERE component.test_id = test.id AND component.is_active = 'Y'
           )
       AND 1 <> (
             SELECT COUNT(*)
               FROM clinlims.test_result_component component
              WHERE component.test_id = test.id
                AND component.is_active = 'Y'
                AND component.is_primary = TRUE
           )
    UNION ALL
    SELECT '检验项目', '数值主结果缺少单位', 'ERROR', COUNT(*)
      FROM clinlims.test_result_component component
      JOIN clinlims.test test ON test.id = component.test_id
     WHERE test.is_active = 'Y' AND test.orderable = TRUE AND test.domain = 'CLINICAL'
       AND component.is_active = 'Y' AND component.is_primary = TRUE
       AND component.result_type = 'N' AND component.uom_id IS NULL
    UNION ALL
    SELECT '检验项目', '数值主结果缺少参考或有效范围', 'ERROR', COUNT(*)
      FROM clinlims.test_result_component component
      JOIN clinlims.test test ON test.id = component.test_id
     WHERE test.is_active = 'Y' AND test.orderable = TRUE AND test.domain = 'CLINICAL'
       AND component.is_active = 'Y' AND component.is_primary = TRUE
       AND component.result_type = 'N'
       AND NOT EXISTS (
             SELECT 1
               FROM clinlims.result_limits limits
              WHERE limits.test_id = test.id
                AND (limits.component_id IS NULL OR limits.component_id = component.id)
           )
    UNION ALL
    SELECT '检验项目', '数值主结果尚未配置危急值规则', 'WARNING', COUNT(DISTINCT component.id)
      FROM clinlims.test_result_component component
      JOIN clinlims.test test ON test.id = component.test_id
     WHERE test.is_active = 'Y' AND test.orderable = TRUE AND test.domain = 'CLINICAL'
       AND component.is_active = 'Y' AND component.is_primary = TRUE
       AND component.result_type = 'N'
       AND NOT EXISTS (
             SELECT 1
               FROM clinlims.result_limits limits
              WHERE limits.test_id = test.id
                AND (limits.component_id IS NULL OR limits.component_id = component.id)
                AND (
                     limits.low_critical <> '-Infinity'::double precision
                  OR limits.high_critical <> 'Infinity'::double precision
                )
           )
       AND NOT EXISTS (
             SELECT 1 FROM clinlims.test_analyte analyte WHERE analyte.test_id = test.id
           )
    UNION ALL
    SELECT '检验项目', '启用临床项目本地编码重复', 'ERROR', COALESCE(SUM(duplicates - 1), 0)
      FROM (
            SELECT UPPER(BTRIM(local_code)) AS normalized_code, COUNT(*) AS duplicates
              FROM clinlims.test
             WHERE is_active = 'Y' AND domain = 'CLINICAL'
               AND NULLIF(BTRIM(local_code), '') IS NOT NULL
             GROUP BY UPPER(BTRIM(local_code))
            HAVING COUNT(*) > 1
           ) duplicate_codes
    UNION ALL
    SELECT '检验项目', '启用可开立项目缺少本地编码', 'ERROR', COUNT(*)
      FROM clinlims.test
     WHERE is_active = 'Y' AND orderable = TRUE AND domain = 'CLINICAL'
       AND NULLIF(BTRIM(local_code), '') IS NULL
    UNION ALL
    SELECT '检验项目', '启用可开立项目缺少标准术语映射', 'WARNING', COUNT(*)
      FROM clinlims.test test
     WHERE test.is_active = 'Y' AND test.orderable = TRUE AND test.domain = 'CLINICAL'
       AND NOT EXISTS (
             SELECT 1
               FROM clinlims.test_terminology_mapping mapping
              WHERE mapping.test_id = test.id AND mapping.is_active = 'Y'
           )

    UNION ALL
    SELECT '标本', '启用临床标本类型总数', 'INFO', COUNT(*)
      FROM clinlims.type_of_sample
     WHERE is_active = TRUE AND domain = 'CLINICAL'
    UNION ALL
    SELECT '标本', '启用临床标本类型缺少编码', 'ERROR', COUNT(*)
      FROM clinlims.type_of_sample
     WHERE is_active = TRUE AND domain = 'CLINICAL'
       AND NULLIF(BTRIM(local_abbrev), '') IS NULL
    UNION ALL
    SELECT '标本', '启用临床标本类型编码重复', 'ERROR', COALESCE(SUM(duplicates - 1), 0)
      FROM (
            SELECT UPPER(BTRIM(local_abbrev)) AS normalized_code, COUNT(*) AS duplicates
              FROM clinlims.type_of_sample
             WHERE is_active = TRUE AND domain = 'CLINICAL'
               AND NULLIF(BTRIM(local_abbrev), '') IS NOT NULL
             GROUP BY UPPER(BTRIM(local_abbrev))
            HAVING COUNT(*) > 1
           ) duplicate_codes
    UNION ALL
    SELECT '标本', '启用临床标本类型缺少标准术语映射', 'WARNING', COUNT(*)
      FROM clinlims.type_of_sample sample_type
     WHERE sample_type.is_active = TRUE AND sample_type.domain = 'CLINICAL'
       AND NOT EXISTS (
             SELECT 1
               FROM clinlims.sample_type_terminology_mapping mapping
              WHERE mapping.sample_type_id = sample_type.id AND mapping.is_active = 'Y'
           )

    UNION ALL
    SELECT '组合项目', '启用组合总数', 'INFO', COUNT(*)
      FROM clinlims.panel
     WHERE is_active = 'Y'
    UNION ALL
    SELECT '组合项目', '启用组合没有明细项目', 'ERROR', COUNT(*)
      FROM clinlims.panel panel
     WHERE panel.is_active = 'Y'
       AND NOT EXISTS (
             SELECT 1 FROM clinlims.panel_item item WHERE item.panel_id = panel.id
           )

    UNION ALL
    SELECT '单位', '启用结果单位总数', 'INFO', COUNT(*)
      FROM clinlims.unit_of_measure
     WHERE is_active = 'Y'
    UNION ALL
    SELECT '单位', '启用结果单位缺少本地编码', 'ERROR', COUNT(*)
      FROM clinlims.unit_of_measure
     WHERE is_active = 'Y' AND NULLIF(BTRIM(code), '') IS NULL
    UNION ALL
    SELECT '单位', '启用结果单位缺少 UCUM 编码', 'WARNING', COUNT(*)
      FROM clinlims.unit_of_measure
     WHERE is_active = 'Y' AND NULLIF(BTRIM(ucum_code), '') IS NULL

    UNION ALL
    SELECT '检验方法', '启用方法总数', 'INFO', COUNT(*)
      FROM clinlims.method
     WHERE is_active = 'Y'
    UNION ALL
    SELECT '检验方法', '启用方法缺少稳定编码', 'ERROR', COUNT(*)
      FROM clinlims.method
     WHERE is_active = 'Y' AND NULLIF(BTRIM(code), '') IS NULL

    UNION ALL
    SELECT '参考范围', '上下界或年龄区间无效', 'ERROR', COUNT(*)
      FROM clinlims.result_limits
     WHERE low_valid > high_valid
        OR low_normal > high_normal
        OR low_reporting_range > high_reporting_range
        OR low_critical > high_critical
        OR min_age > max_age

    UNION ALL
    SELECT '检验设备', '启用设备总数', 'INFO', COUNT(*)
      FROM clinlims.analyzer
     WHERE is_active = TRUE
    UNION ALL
    SELECT '检验设备', '启用设备缺少识别码或通讯配置', 'ERROR', COUNT(*)
      FROM clinlims.analyzer
     WHERE is_active = TRUE
       AND (
            NULLIF(BTRIM(name), '') IS NULL
         OR NULLIF(BTRIM(machine_id), '') IS NULL
         OR NULLIF(BTRIM(communication_mode), '') IS NULL
       )
    UNION ALL
    SELECT '检验设备', '设备项目码尚未映射 LIS 项目', 'ERROR', COUNT(*)
      FROM clinlims.analyzer_test_map
     WHERE test_id IS NULL
)
SELECT domain AS "领域",
       check_name AS "检查项",
       severity AS "级别",
       issue_count AS "数量",
       CASE
         WHEN severity = 'INFO' THEN '统计'
         WHEN issue_count = 0 THEN '通过'
         ELSE '不通过'
       END AS "结论"
  FROM checks
 ORDER BY CASE severity WHEN 'ERROR' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
          domain,
          check_name;
