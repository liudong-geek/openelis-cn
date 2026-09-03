/** Operates only on the synthetic fixture verified by fhir-intake-smoke.mjs. */
import assert from "node:assert/strict";

export async function runMainFlow({ api, evidence, order, patient, local, requested }) {
  const { runId, resources } = evidence;
  assert(patient.identifier.some(i => i.value === `TEST-API-${runId}`));
  const { labNo, serviceRequestId, patientId } = resources;
  const orderPath = `/rest/order/search?labNumber=${encodeURIComponent(labNo)}`;
  const requestPath = `/fhir/ServiceRequest/${serviceRequestId}`;
  if (!(local.samples || []).length) {
    // Follow the same internal operator endpoint as the collection screen.
    // This is not a replacement external specimen protocol.
    const date = local.sampleOrderItems.receivedDateForDisplay;
    const time = local.sampleOrderItems.receivedTime;
    assert(date && time, "采集测试须使用服务端日期和时间，不猜测日期格式");
    const sampleTypeId = requested[0].typeOfSampleId;
    const tests = requested[0].requestedTests;
    assert(/^\d+$/.test(sampleTypeId) && /^\d+$/.test(tests));
    const sampleOrderItems = { ...local.sampleOrderItems, sampleId: local.id, labNo };
    for (const key of ["program", "questionnaire", "vlProgramFields", "paymentStatus"]) delete sampleOrderItems[key];
    const sampleXML = `<samples><sample sampleID='${sampleTypeId}' sampleItemId='' date='${date}' time='${time}' receivedDate='${date}' receivedTime='${time}' collector='TEST-API' quantity='1' uom='' tests='${tests}' panels='' testSectionMap='' testSampleTypeMap='' collectionConditions='' rejected='false' rejectReasonId='' initialConditionIds=''/></samples>`;
    await api("/rest/SamplePatientEntry", { method: "POST", body: {
      sampleOrderItems, patientProperties: { ...local.patientProperties, patientUpdateStatus: "NO_ACTION" },
      patientUpdateStatus: "NO_ACTION", sampleXML, orderEntryOnly: false, warning: false,
      useReferral: false, referralItems: [] }, label: "操作员采集并签收模拟标本" });
  }
  local = await api(orderPath, { label: "回读采集签收进度" });
  assert.equal(local.samples.length, 1);
  assert.equal(local.stepProgress.collect, true);
  assert(local.samples[0].collectionDate && local.samples[0].receivedDate, "采集和签收日期均须落库");
  const collectedRequest = await api(requestPath, { label: "确认外部申请标识已关联实际检验任务" });
  assert.equal(collectedRequest.identifier[0].value, order.identifier[0].value);
  assert.equal(collectedRequest.requester.reference, order.requester.reference);
  assert.deepEqual(collectedRequest.code.coding, order.code.coding);
  const specimenRef = collectedRequest.specimen?.[0]?.reference;
  assert(specimenRef?.startsWith("Specimen/"), "采集后须返回真实标本引用");
  resources.specimenId = specimenRef.split("/").at(-1);
  const specimen = await api(`/fhir/${specimenRef}`, { label: "回读实际标本" });
  assert.equal(specimen.subject.reference, `Patient/${patientId}`);
  const fulfilled = await api(`/rest/sample-type-requests/sample/${local.id}`, { label: "待采任务转为已采集" });
  assert.equal(fulfilled[0].status, "COLLECTED");

  await api(`/rest/order/storage-skipped?labNumber=${encodeURIComponent(labNo)}&storageSkipped=true`,
    { method: "PUT", label: "模拟即时检测标本不入库" });
  const config = await api("/rest/qa-checklist/config", { label: "读取标本验收必检项" });
  assert(config.length > 0, "未配置验收项目时不能宣称完成验收");
  await api("/rest/qa-checklist", { method: "POST", body: { labNumber: labNo,
    verifiedItems: Object.fromEntries(config.map(item => [item.itemKey, true])) }, label: "确认模拟标本验收项" });
  const qa = await api(`/rest/qa-checklist/by-lab-number/${encodeURIComponent(labNo)}`);
  assert.equal(qa.allRequiredVerified, true);

  const observation = { resourceType: "Observation", status: "final",
    basedOn: [{ reference: `ServiceRequest/${serviceRequestId}` }], subject: { reference: `Patient/${patientId}` },
    specimen: { reference: specimenRef }, code: structuredClone(order.code),
    valueQuantity: { value: Number(process.env.LIS_TEST_RESULT || "13.5"), unit: process.env.LIS_TEST_UNIT || "g/dl" } };
  let report = await api(`/fhir/DiagnosticReport/${serviceRequestId}`, { label: "读取当前报告状态" });
  if (!report.result?.length) {
    await api("/fhir/Observation", { method: "POST", body: { ...observation, valueQuantity: { value: 13.5, unit: "UNMAPPED-TEST-UNIT" } },
      status: 422, label: "拒绝不匹配的设备单位" });
    await api("/fhir/Observation", { method: "POST", body: { ...observation, subject: { reference: "Patient/00000000-0000-0000-0000-000000000001" } },
      status: 422, label: "拒绝患者错配结果" });
    await api("/fhir/Observation", { method: "POST", body: { ...observation, valueQuantity: { value: 13.56789123456789, unit: observation.valueQuantity.unit } },
      status: 422, label: "拒绝超过配置精度的数值，不自动截断" });
    const result = await api("/fhir/Observation", { method: "POST", body: observation, status: 201, label: "接收模拟仪器定量结果" });
    resources.observationId = result.id?.split("/").at(-1);
    assert(resources.observationId);
    const readResult = await api(`/fhir/Observation/${resources.observationId}`, { label: "确认仪器 final 仍为待审核结果" });
    assert.equal(readResult.status, "preliminary");
    assert.equal(readResult.valueQuantity.value, observation.valueQuantity.value);
    assert(readResult.code.coding.some(c => c.code === order.code.coding[0].code));
    await api("/fhir/Observation", { method: "POST", body: observation, status: 409, label: "拒绝重复结果写入" });
    report = await api(`/fhir/DiagnosticReport/${serviceRequestId}`, { label: "确认审核前报告非正式状态" });
    assert.equal(report.status, "preliminary");
  }
  if (report.status !== "final") {
    const review = await api(`/rest/AccessionValidation?accessionNumber=${encodeURIComponent(labNo)}&unitType=&date=&doRange=false`,
      { label: "操作员查询本单待审核结果" });
    assert.equal(review.resultList.length, 1, "只能审核本轮模拟单的一项结果");
    assert.equal(review.resultList[0].accessionNumber, labNo);
    assert.equal(Number(review.resultList[0].result), observation.valueQuantity.value, "审核表单不能丢失结果小数位");
    resources.analysisId = review.resultList[0].analysisId;
    review.resultList[0].isAccepted = true;
    review.resultList[0].isRejected = false;
    await api("/rest/AccessionValidation", { method: "POST", body: review, label: "操作员审核模拟结果" });
  }
  report = await api(`/fhir/DiagnosticReport/${serviceRequestId}`, { label: "回读审核后的正式报告数据" });
  assert.equal(report.status, "final", "必须确认实际审核状态，不能只检查返回 200");
  assert.equal(report.subject.reference, `Patient/${patientId}`);
  assert.equal(report.basedOn[0].reference, `ServiceRequest/${serviceRequestId}`);
  assert.equal(report.result.length, 1);
  resources.observationId = report.result[0].reference.split("/").at(-1);
  const finalResult = await api(`/fhir/${report.result[0].reference}`, { label: "正式报告结果可由上游回读" });
  assert.equal(finalResult.status, "final");
  assert.equal(finalResult.valueQuantity.value, observation.valueQuantity.value);
  assert(finalResult.code.coding.some(c => c.code === order.code.coding[0].code));
  assert(report.code.coding.some(c => c.code === order.code.coding[0].code));
  assert.equal(finalResult.valueQuantity.unit, observation.valueQuantity.unit);
  await api(`/fhir/Observation/${resources.observationId}`, { method: "DELETE", status: 405, label: "禁止设备接口删除检验结果" });
  await api("/fhir/Observation", { method: "POST", body: observation, status: 422, label: "已审核结果禁止重复覆盖" });
  const pdf = await api("/rest/ReportPrint", { method: "POST", body: { report: "patientHaitiClinical", type: "patient",
    accessionDirect: labNo, highAccessionDirect: labNo }, label: "生成本单检验报告 PDF" });
  assert(pdf.pdfBytes > 1000);
  resources.reportPdfBytes = pdf.pdfBytes;
}
