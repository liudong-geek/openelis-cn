/** Local, synthetic-data API acceptance. Never run against a real hospital endpoint. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.LIS_API_BASE || "http://127.0.0.1:18080/api/OpenELIS-Global";
const url = new URL(base);
assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "只允许在本机使用模拟数据测试");
assert(process.argv.includes("--write-synthetic"), "须明确指定 --write-synthetic，测试会新增带 TEST-API 标记的数据");
assert(process.env.LIS_API_USER && process.env.LIS_API_PASSWORD, "请通过环境变量提供本地测试账号");
const auth = `Basic ${Buffer.from(`${process.env.LIS_API_USER}:${process.env.LIS_API_PASSWORD}`).toString("base64")}`;
const system = process.env.LIS_FHIR_SYSTEM || "http://openelis-global.org";
const runId = process.env.LIS_TEST_RUN_ID || Date.now().toString();
const evidence = { runId, checks: [], resources: {} };
const cookies = new Map();
const resumeIds = [process.env.LIS_TEST_HOSPITAL_ID, process.env.LIS_TEST_DEPARTMENT_ID, process.env.LIS_TEST_PATIENT_ID];
const resume = resumeIds.every(Boolean);
assert(resume || resumeIds.every(id => !id), "复用模拟数据时必须同时提供医院、科室和患者 UUID");
assert(!resume || process.env.LIS_TEST_RUN_ID, "复用模拟数据须指定原 TEST-API 运行标识");

async function api(path, { method = "GET", body, status = 200, label = path } = {}) {
  const type = path.startsWith("/fhir") ? "application/fhir+json" : "application/json";
  const response = await fetch(base + path, {
    method, redirect: "manual", signal: AbortSignal.timeout(30000),
    headers: { Authorization: auth, Accept: type, "Content-Type": type, Prefer: "return=representation",
      Cookie: [...cookies].map(([name,value]) => `${name}=${value}`).join("; ") },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  if (response.ok && response.headers.get("content-type")?.includes("application/pdf")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-", "报告响应必须是有效 PDF 文件头");
    assert(bytes.length > 1000, "报告不得为空文件");
    if (process.argv.includes("--save-report")) {
      assert(/^\d+$/.test(runId));
      await mkdir("tmp/pdfs", { recursive: true });
      const reportPath = `tmp/pdfs/fhir-api-${runId}.pdf`;
      await writeFile(reportPath, bytes);
      evidence.resources.reportInspectionFile = reportPath;
    }
    evidence.checks.push({ label, status: response.status, bytes: bytes.length });
    console.log(`通过：${label} (${bytes.length} 字节 PDF)`);
    return { pdfBytes: bytes.length };
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  assert((Array.isArray(status) ? status : [status]).includes(response.status), `${label}: 预期 ${status}，实际 ${response.status}；${text.slice(0,900)}`);
  evidence.checks.push({ label, status: response.status });
  console.log(`通过：${label} (${status})`);
  return data;
}

try {
  await api("/fhir/metadata", { label: "接口认证及能力声明" });
  const hospitalId = resumeIds[0] || randomUUID();
  const departmentId = resumeIds[1] || randomUUID();
  const hospital = { resourceType: "Organization", id: hospitalId, name: `接口测试医院${runId.slice(-5)}`, active: true,
    identifier: [{ system: `${system}/org_code`, value: `TAH-${runId}` }],
    type: [{ coding: [{ system: `${system}/orgType`, code: "referring clinic" }] }] };
  const department = { resourceType: "Organization", id: departmentId, name: `接口测试科室${runId.slice(-5)}`, active: true,
    identifier: [{ system: `${system}/org_code`, value: `TAD-${runId}` }],
    type: [{ coding: [{ system: `${system}/orgType`, code: "dept" }] }], partOf: { reference: `Organization/${hospitalId}` } };
  if (resume) {
    const existingHospital = await api(`/fhir/Organization/${hospitalId}`);
    assert(existingHospital.identifier.some(i => i.value === `TAH-${runId}`), "仅可复用本轮模拟医院");
  }
  await api(`/fhir/Organization/${hospitalId}`, { method: "PUT", body: hospital, status: resume ? 200 : 201, label: "同步送检医院" });
  await api(`/fhir/Organization/${departmentId}`, { method: "PUT", body: department, status: resume ? 200 : 201, label: "同步科室及医院归属" });
  await api(`/fhir/Organization/${departmentId}`, { method: "PUT", body: department, label: "重复同步同一科室" });
  const readDepartment = await api(`/fhir/Organization/${departmentId}`, { label: "回读科室归属" });
  assert.equal(readDepartment.partOf.reference, `Organization/${hospitalId}`);
  await api(`/fhir/Organization/${hospitalId}`, { method: "PUT", body: { ...hospital, active: false }, status: 422,
    label: "拒绝停用仍有启用科室的医院" });
  evidence.resources.hospitalId = hospitalId;
  evidence.resources.departmentId = departmentId;

  const patient = { resourceType: "Patient", active: true, name: [{ family: "接口测试", given: ["流程患者"] }],
    gender: "male", birthDate: "1990-01-01",
    identifier: [{ system: `${system}/pat_nationalId`, value: `TEST-API-${runId}` }] };
  const savedPatient = resume ? await api(`/fhir/Patient/${resumeIds[2]}`) :
    await api("/fhir/Patient", { method: "POST", body: patient, status: 201, label: "通过接口新建模拟患者主档" });
  assert.equal(savedPatient.resourceType, "Patient");
  assert(savedPatient.identifier.some(i => i.value === `TEST-API-${runId}`), "仅可复用本轮模拟患者");
  const patientId = savedPatient.id.split("/").at(-1);
  await api(`/fhir/Patient/${patientId}`, { label: "按返回标识回读患者" });
  await api("/fhir/Patient", { method: "POST", body: patient, status: 409, label: "拒绝重复患者建档" });
  evidence.resources.patientId = patientId;

  let testGuid = process.env.LIS_TEST_GUID;
  if (!testGuid && !process.env.LIS_TEST_LOINC) {
    const { ensureTestCatalog } = await import("./fhir-test-catalog.mjs");
    testGuid = await ensureTestCatalog({ api, evidence });
  }

  const order = { resourceType: "ServiceRequest", status: "active", intent: "order", priority: "routine",
    identifier: [{ system: "https://example.invalid/TEST-API/orders", value: `TEST-API-${runId}` }],
    subject: { reference: `Patient/${patientId}` }, requester: { reference: `Organization/${departmentId}` },
    code: { coding: [{ system: testGuid ? `${system}/test-guid` : "http://loinc.org", code: testGuid || process.env.LIS_TEST_LOINC }] },
    specimen: [{ reference: "#requested-specimen" }],
    contained: [{ resourceType: "Specimen", id: "requested-specimen",
      type: { coding: [{ system: `${system}/sampleType`, code: process.env.LIS_SAMPLE_TYPE_CODE || "Whole Bld" }] } }] };
  const created = await api("/fhir/ServiceRequest", { method: "POST", body: order, status: resume ? [200, 201] : 201, label: "接收外部检验申请并自动编号" });
  assert.equal(created.resourceType, "ServiceRequest");
  const labNo = created.identifier.find(i => i.system.endsWith("/accession-number"))?.value;
  assert(labNo, "成功响应必须包含 LIS 实验室编号");
  const orderId = created.id.split("/").at(-1);
  evidence.resources.serviceRequestId = orderId;
  evidence.resources.labNo = labNo;
  await api(`/fhir/ServiceRequest/${orderId}`, { label: "未采标本前可回读申请" });
  const local = await api(`/rest/order/search?labNumber=${encodeURIComponent(labNo)}`, { label: "确认申请进入 LIS 业务数据" });
  assert.equal(local.labNumber, labNo);
  assert(local.sampleOrderItems.requestDate, "接口建单必须补齐后续采集所需的申请日期");
  if (!resume) assert.equal((local.samples || []).length, 0, "接口建单不能伪造已采标本");
  const requested = await api(`/rest/sample-type-requests/sample/${local.id}`, { label: "确认生成待采标本与检验项目" });
  assert.equal(requested.length, 1);
  assert((resume ? ["REQUESTED", "COLLECTED"] : ["REQUESTED"]).includes(requested[0].status));
  assert(requested[0].requestedTests);
  evidence.resources.sampleId = local.id;
  for (let i = 0; i < 2; i++) {
    const repeated = await api("/fhir/ServiceRequest", { method: "POST", body: order, label: `申请重复报文 ${i + 1}` });
    assert.equal(repeated.id, created.id);
  }
  const concurrent = await Promise.all([1, 2].map(i => api("/fhir/ServiceRequest", {
    method: "POST", body: order, label: `并发重发 ${i}` })));
  concurrent.forEach(response => assert.equal(response.id, created.id));
  await api("/fhir/ServiceRequest", { method: "POST", body: { ...order, priority: "stat" }, status: 409,
    label: "拒绝同一申请标识覆盖不同报文" });
  const invalid = structuredClone(order);
  invalid.identifier[0].value += "-BAD";
  invalid.code.coding[0].code = "UNKNOWN-TEST-API";
  invalid.code.coding[0].display = "白细胞计数";
  await api("/fhir/ServiceRequest", { method: "POST", body: invalid, status: 422,
    label: "未知项目不能通过显示名称蒙混入库" });
  if (process.argv.includes("--main-flow")) {
    const { runMainFlow } = await import("./fhir-main-flow.mjs");
    await runMainFlow({ api, evidence, order, patient: savedPatient, local, requested });
  }
  console.log(JSON.stringify({ ...evidence, outcome: process.argv.includes("--main-flow") ? "main-flow-passed" : "intake-passed",
    remaining: "仅为本地模拟 API 验收，不代表真实医院/仪器联调、浏览器或纸质打印验收" }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ...evidence, outcome: "failed", error: error.message }, null, 2));
  process.exitCode = 1;
}
