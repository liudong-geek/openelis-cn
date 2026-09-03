/** Create an isolated non-clinical numeric fixture using existing catalog APIs. */
import assert from "node:assert/strict";

export async function ensureTestCatalog({ api, evidence }) {
  const code = `TEST-API-${evidence.runId}`;
  const name = `接口测试项目-${evidence.runId}`;
  const matches = await api(`/rest/test-catalog/tests?search=${encodeURIComponent(name)}&pageSize=25`,
    { label: "检索本轮隔离测试项目" });
  assert(matches.rows.length <= 1, "模拟项目名称不唯一，停止自动操作");
  let testId = matches.rows[0]?.testId;
  const sampleTypeId = process.env.LIS_TEST_SAMPLE_TYPE_ID || "4";
  const labUnitId = process.env.LIS_TEST_LAB_UNIT_ID || "36";
  const units = await api("/rest/TestAdd", { label: "读取现有单位与标本目录" });
  assert(units.sampleTypeList.some(item => item.id === sampleTypeId));
  assert(units.labUnitList.some(item => item.id === labUnitId));
  const unit = units.uomList.find(item => item.value === "%");
  assert(unit, "本地没有百分比单位，须先配置；测试不会新造临床单位");
  if (!testId) {
    const created = await api("/rest/test-catalog/tests", { method: "POST", status: [200, 201], body: {
      name, reportingName: `${name}（非临床）`, code, labUnitId, sampleTypeIds: [sampleTypeId],
      domain: "CLINICAL", orderable: true, amr: false, description: `${code} 接口验收专用，禁止临床使用` },
      label: "通过管理接口建立隔离测试项目" });
    testId = created.testId;
  }
  assert(testId);
  const basic = await api(`/rest/test-catalog/tests/${testId}/basic-info`);
  assert.equal(basic.code, code, "只允许配置本轮的 TEST-API 项目");
  if (!basic.active) {
    const initial = await api(`/rest/test-catalog/tests/${testId}/sample-results`);
    const primary = initial.components.find(component => component.code === "PRIMARY");
    await api(`/rest/test-catalog/tests/${testId}/sample-results`, { method: "PUT", body: { components: [{
      id: primary?.id, code: "PRIMARY", label: "接口模拟数值（非临床）", resultType: "N", uomId: unit.id,
      significantDigits: 1, isPrimary: true, showOnReport: true, allowMultipleReadings: false,
      interpretations: [], options: [] }] }, label: "配置测试项目单一数值结果与单位" });
    const completeness = await api(`/rest/test-catalog/tests/${testId}/completeness`);
    assert.equal(completeness.complete, true);
    await api(`/rest/test-catalog/tests/${testId}/activate`, { method: "POST", body: {
      gapsAcknowledged: `${code} 仅供本机接口软件测试，不代表临床项目；无临床参考区间，禁止用于患者诊疗。`
    }, label: "按受控启用流程记录非临床测试项目说明" });
  }
  const activated = await api(`/rest/test-catalog/tests/${testId}/basic-info`, { label: "确认测试项目实际已启用" });
  assert.equal(activated.active, true);
  const configured = await api(`/rest/test-catalog/tests/${testId}/sample-results`, { label: "回读测试结果配置" });
  assert.equal(configured.components.length, 1);
  assert.equal(configured.components[0].resultType, "N");
  assert.equal(configured.components[0].uomId, unit.id);
  assert(basic.testGuid, "主数据接口必须提供稳定的项目映射标识");
  evidence.resources.testId = testId;
  evidence.resources.testGuid = basic.testGuid;
  process.env.LIS_TEST_UNIT = "%";
  return basic.testGuid;
}
