import { entrySubmissionError, validOrderId } from "./orderEntryReceipt";
import { verifyCollectionContext } from "./collectionRecovery";
import { verifyQaReview } from "./qaConfirmation";
import { verifyIntakeDecisions, verifyIntakeReasons } from "./intakeDecision";
import {
  recoverEntrySubmission,
  verifyRecoveredEntryReceipt,
} from "./orderEntryRecovery";

const fail = () => {
  throw entrySubmissionError("order.recovery.invalidCurrent");
};
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v) => (validOrderId(v) ? String(v) : fail());
const optionalId = (v) => (v == null ? null : id(v));
const text = (v) => v == null || typeof v === "string";
const date = (v) => {
  if (v == null) return true;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(`${v}T00:00:00Z`);
  return (
    Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === v
  );
};
const time = (v) =>
  v == null ||
  (typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(
      v,
    ) &&
    date(v.slice(0, 10)) &&
    Number.isFinite(Date.parse(v)));
const pick = (value, keys) =>
  Object.fromEntries(keys.map((key) => [key, value[key]]));
const ids = (values, required = false) => {
  if (!Array.isArray(values) || (required && !values.length)) return fail();
  const result = values.map(id);
  if (new Set(result).size !== result.length) return fail();
  return result;
};
const quantity = (v, allowZero = false) =>
  typeof v === "number" && Number.isFinite(v) && (allowZero ? v >= 0 : v > 0);

// CurrentResult embeds the same immutable receipt but does not claim a replay.
// Adapt only that envelope for the existing content verifier; never use those
// historical REQUESTED rows as current collection facts.
export const verifyCurrentEntry = (data, reference, command) => {
  let receipt;
  try {
    receipt = verifyRecoveredEntryReceipt(
      { success: data?.success, replayed: true, receipt: data?.receipt },
      reference,
      command,
    );
  } catch {
    return fail();
  }
  const c = data.current;
  if (
    !object(c) ||
    c.version !== 1 ||
    c.readOnly !== true ||
    id(c.sampleId) !== String(receipt.sampleId) ||
    c.labNo !== receipt.labNo ||
    c.workflowType !== receipt.workflowType ||
    !validOrderId(c.orderStatusId) ||
    !time(c.lastUpdated) ||
    !Array.isArray(c.requestedSpecimens) ||
    !c.requestedSpecimens.length ||
    !Array.isArray(c.physicalSpecimens)
  )
    return fail();
  if (c.workflowType === "clinical") {
    const patient = c.patient;
    if (
      !object(patient) ||
      id(patient.id) !== String(receipt.patientId) ||
      ![
        patient.nationalId,
        patient.firstName,
        patient.lastName,
        patient.gender,
      ].every(text) ||
      !date(patient.birthDate)
    )
      return fail();
  } else if (c.patient != null) return fail();
  const requests = new Map();
  for (const tube of c.requestedSpecimens) {
    if (
      !object(tube) ||
      requests.has(id(tube.id)) ||
      !Number.isSafeInteger(tube.sortOrder) ||
      tube.sortOrder < 0 ||
      !validOrderId(tube.typeOfSampleId) ||
      !quantity(tube.requestedQuantity) ||
      !["REQUESTED", "COLLECTED", "CANCELLED"].includes(tube.status) ||
      !time(tube.createdAt) ||
      !time(tube.lastUpdated)
    )
      return fail();
    optionalId(tube.unitOfMeasureId);
    ids(tube.testIds, true);
    ids(tube.panelIds);
    if (tube.status === "COLLECTED") id(tube.sampleItemId);
    else if (tube.sampleItemId != null) return fail();
    requests.set(String(tube.id), tube);
  }
  if (receipt.requestedSpecimens.some((t) => !requests.has(String(t.id))))
    return fail();
  const physical = new Set(),
    bound = new Set(),
    analyses = new Set();
  for (const tube of c.physicalSpecimens) {
    if (
      !object(tube) ||
      physical.has(id(tube.id)) ||
      bound.has(id(tube.requestId)) ||
      !validOrderId(tube.typeOfSampleId) ||
      !validOrderId(tube.statusId) ||
      !quantity(tube.quantity, true) ||
      typeof tube.voided !== "boolean" ||
      typeof tube.rejected !== "boolean" ||
      !text(tube.sortOrder) ||
      !text(tube.collector) ||
      ![tube.collectionDate, tube.receivedDate, tube.lastUpdated].every(time) ||
      !Array.isArray(tube.analyses)
    )
      return fail();
    optionalId(tube.unitOfMeasureId);
    const request = requests.get(String(tube.requestId));
    if (
      !request ||
      request.status !== "COLLECTED" ||
      String(request.sampleItemId) !== String(tube.id) ||
      String(request.typeOfSampleId) !== String(tube.typeOfSampleId)
    )
      return fail();
    const tests = new Set();
    for (const analysis of tube.analyses) {
      if (
        !object(analysis) ||
        analyses.has(id(analysis.id)) ||
        !validOrderId(analysis.testId) ||
        !validOrderId(analysis.statusId) ||
        !time(analysis.lastUpdated)
      )
        return fail();
      analyses.add(String(analysis.id));
      tests.add(String(analysis.testId));
    }
    if (request.testIds.some((test) => !tests.has(String(test)))) return fail();
    physical.add(String(tube.id));
    bound.add(String(tube.requestId));
  }
  if (
    [...requests.values()].some(
      (r) => r.status === "COLLECTED" && !bound.has(String(r.id)),
    )
  )
    return fail();
  // Only the verified CurrentResult fact fields may leave this boundary.
  // No transport-provided capabilities or workflow commands are propagated.
  const facts = {
    ...(c.collectionContext == null
      ? {}
      : { collectionContext: verifyCollectionContext(c.collectionContext, c) }),
    ...pick(c, [
      "version",
      "readOnly",
      "sampleId",
      "labNo",
      "workflowType",
      "orderStatusId",
      "lastUpdated",
    ]),
    patient:
      c.patient == null
        ? null
        : pick(c.patient, [
            "id",
            "nationalId",
            "firstName",
            "lastName",
            "gender",
            "birthDate",
          ]),
    requestedSpecimens: c.requestedSpecimens.map((tube) =>
      pick(tube, [
        "id",
        "sortOrder",
        "typeOfSampleId",
        "requestedQuantity",
        "unitOfMeasureId",
        "testIds",
        "panelIds",
        "status",
        "sampleItemId",
        "createdAt",
        "lastUpdated",
      ]),
    ),
    physicalSpecimens: c.physicalSpecimens.map((tube) => ({
      ...pick(tube, [
        "id",
        "requestId",
        "sortOrder",
        "typeOfSampleId",
        "quantity",
        "unitOfMeasureId",
        "statusId",
        "voided",
        "rejected",
        "collectionDate",
        "receivedDate",
        "collector",
        "lastUpdated",
      ]),
      analyses: tube.analyses.map((analysis) =>
        pick(analysis, ["id", "testId", "statusId", "lastUpdated"]),
      ),
    })),
  };
  const qaReview = verifyQaReview(c.qaReview, facts);
  if (qaReview !== undefined) facts.qaReview = qaReview;
  const specimenDecisions = verifyIntakeDecisions(c.specimenDecisions, facts);
  if (specimenDecisions !== undefined)
    facts.specimenDecisions = specimenDecisions;
  if (c.intakeReasons !== undefined)
    facts.intakeReasons = verifyIntakeReasons(c.intakeReasons);
  return JSON.parse(JSON.stringify({ receipt, current: facts }));
};

export const recoverCurrentEntrySubmission = (options) =>
  recoverEntrySubmission({
    ...options,
    resource: "current",
    verify: verifyCurrentEntry,
  });
