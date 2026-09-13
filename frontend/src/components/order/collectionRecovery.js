import { entrySubmissionError } from "./orderEntryReceipt";

const fail = (key = "order.collectionRecovery.invalid") => {
  throw entrySubmissionError(key);
};
const dateValid = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const timeValid = (v) =>
  typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const nullableText = (v) =>
  v == null || (typeof v === "string" && v.length <= 512);
const key = (kind, id) => `${kind}:${id}`;
export const collectionMaster = (current, kind, id) =>
  current.collectionContext?.masterData.find(
    (row) => row.kind === kind && row.id === String(id),
  );

// Additive read facts only; no server-supplied operation/step flags survive.
export const verifyCollectionContext = (context, current) => {
  if (context == null) return null;
  const invalid = () => fail("order.recovery.invalidCurrent");
  if (
    context.version !== 1 ||
    ![null, "yyyy/MM/dd", "MM/dd/yyyy", "dd/MM/yyyy"].includes(
      context.dateFormat,
    ) ||
    typeof context.timeZone !== "string" ||
    !dateValid(context.laboratoryNow?.slice(0, 10)) ||
    context.laboratoryNow?.[10] !== "T" ||
    !timeValid(context.laboratoryNow?.slice(11)) ||
    ![true, false, null].includes(context.consentGiven) ||
    ![
      context.consentFormReference,
      context.consentRecordedAt,
      context.consentRecordedBy,
    ].every(nullableText) ||
    !Array.isArray(context.masterData)
  )
    return invalid();
  try {
    new Intl.DateTimeFormat("en", { timeZone: context.timeZone }).format();
  } catch {
    return invalid();
  }
  if (
    context.consentRecordedAt != null &&
    (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(
      context.consentRecordedAt,
    ) ||
      !dateValid(context.consentRecordedAt.slice(0, 10)))
  )
    return invalid();
  const expected = new Set([key("ORDER_STATUS", current.orderStatusId)]);
  const use = (kind, id) => {
    if (id != null) expected.add(key(kind, id));
  };
  current.requestedSpecimens.forEach((row) => {
    use("TYPE", row.typeOfSampleId);
    use("UNIT", row.unitOfMeasureId);
    row.testIds.forEach((id) => use("TEST", id));
    row.panelIds.forEach((id) => use("PANEL", id));
  });
  current.physicalSpecimens.forEach((row) => {
    use("TYPE", row.typeOfSampleId);
    use("UNIT", row.unitOfMeasureId);
    use("SAMPLE_STATUS", row.statusId);
    row.analyses.forEach((a) => {
      use("TEST", a.testId);
      use("ANALYSIS_STATUS", a.statusId);
    });
  });
  const found = new Set();
  const masterData = context.masterData.map((row) => {
    if (
      !row ||
      typeof row.id !== "string" ||
      !/^[1-9]\d*$/.test(row.id) ||
      !expected.has(key(row.kind, row.id)) ||
      found.has(key(row.kind, row.id)) ||
      typeof row.active !== "boolean" ||
      !(
        row.name === null ||
        (typeof row.name === "string" &&
          row.name.trim() === row.name &&
          row.name.length > 0 &&
          row.name.length <= 512)
      )
    )
      return invalid();
    found.add(key(row.kind, row.id));
    return { kind: row.kind, id: row.id, name: row.name, active: row.active };
  });
  if (found.size !== expected.size) return invalid();
  return Object.fromEntries([
    ...[
      "version",
      "dateFormat",
      "timeZone",
      "laboratoryNow",
      "consentGiven",
      "consentFormReference",
      "consentRecordedAt",
      "consentRecordedBy",
    ].map((k) => [k, context[k]]),
    ["masterData", masterData],
  ]);
};

export const collectionRecoveryOptions = (result) => {
  const current = result?.current;
  if (!current?.collectionContext?.dateFormat) return [];
  const master = (kind, id) => collectionMaster(current, kind, id);
  const usable = (kind, id) =>
    id == null || Boolean(master(kind, id)?.active && master(kind, id)?.name);
  const order = master("ORDER_STATUS", current.orderStatusId);
  if (
    !order?.active ||
    !["Test Entered", "Testing Started"].includes(order.name)
  )
    return [];
  return current.requestedSpecimens.filter(
    (row) =>
      row.status === "REQUESTED" &&
      row.sampleItemId == null &&
      usable("TYPE", row.typeOfSampleId) &&
      usable("UNIT", row.unitOfMeasureId) &&
      row.testIds.length > 0 &&
      row.testIds.every((id) => usable("TEST", id)) &&
      row.panelIds.every((id) => usable("PANEL", id)),
  );
};

export const laboratoryMinute = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

export const buildRecoveredCollection = (
  result,
  selections,
  now = Date.now(),
) => {
  const current = result.current,
    context = current.collectionContext;
  const available = new Map(
    collectionRecoveryOptions(result).map((row) => [row.id, row]),
  );
  if (!Array.isArray(selections) || !selections.length) return fail();
  const seen = new Set(),
    expected = [];
  const xml = selections.map((input) => {
    const row = available.get(String(input?.requestId));
    if (
      !row ||
      seen.has(row.id) ||
      !dateValid(input.date) ||
      !timeValid(input.time) ||
      typeof input.collector !== "string" ||
      !input.collector.trim() ||
      input.collector.trim().length > 64 ||
      !/^(?:\d+)(?:\.\d+)?$/.test(String(input.quantity))
    )
      return fail();
    seen.add(row.id);
    const quantity = Number(input.quantity);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      `${input.date}T${input.time}` > laboratoryMinute(now, context.timeZone)
    )
      return fail();
    const [year, month, day] = input.date.split("-");
    const date =
      context.dateFormat === "yyyy/MM/dd"
        ? `${year}/${month}/${day}`
        : context.dateFormat === "dd/MM/yyyy"
          ? `${day}/${month}/${year}`
          : `${month}/${day}/${year}`;
    expected.push({
      requestId: row.id,
      quantity,
      unitOfMeasureId: row.unitOfMeasureId,
      minute: `${input.date}T${input.time}`,
      collector: input.collector.trim(),
      typeOfSampleId: row.typeOfSampleId,
      testIds: [...row.testIds].sort(),
      panelIds: [...row.panelIds].sort(),
      requestedQuantity: row.requestedQuantity,
    });
    const fields = {
      sampleTypeRequestId: row.id,
      sampleID: row.typeOfSampleId,
      date,
      time: input.time,
      collector: input.collector.trim(),
      quantity,
      ...(row.unitOfMeasureId ? { uom: row.unitOfMeasureId } : {}),
    };
    return `<sample ${Object.entries(fields)
      .map(([k, v]) => `${k}="${escape(v)}"`)
      .join(" ")} />`;
  });
  // Whitelist from private, verified facts. No patient/entry/storage/label fields.
  return {
    body: JSON.stringify({
      collectionOnly: true,
      sampleOrderItems: { sampleId: current.sampleId, labNo: current.labNo },
      sampleXML: `<samples>${xml.join("")}</samples>`,
    }),
    expected,
    sampleId: current.sampleId,
    labNo: current.labNo,
    timeZone: context.timeZone,
  };
};

export const verifyRecoveredCollection = (result, command) => {
  const current = result.current;
  if (current.sampleId !== command.sampleId || current.labNo !== command.labNo)
    return fail("order.collectionRecovery.unknown");
  for (const expected of command.expected) {
    const request = current.requestedSpecimens.find(
      (r) => r.id === expected.requestId,
    );
    const item = current.physicalSpecimens.find(
      (r) => r.id === request?.sampleItemId,
    );
    if (
      request?.status !== "COLLECTED" ||
      !item ||
      item.voided ||
      item.rejected ||
      !item.collectionDate ||
      request.typeOfSampleId !== expected.typeOfSampleId ||
      request.requestedQuantity !== expected.requestedQuantity ||
      request.unitOfMeasureId !== expected.unitOfMeasureId ||
      JSON.stringify([...request.testIds].sort()) !==
        JSON.stringify(expected.testIds) ||
      JSON.stringify([...request.panelIds].sort()) !==
        JSON.stringify(expected.panelIds) ||
      item.quantity !== expected.quantity ||
      item.unitOfMeasureId !== expected.unitOfMeasureId ||
      item.collector !== expected.collector ||
      laboratoryMinute(item.collectionDate, command.timeZone) !==
        expected.minute
    )
      return fail("order.collectionRecovery.unknown");
  }
  return result;
};

export const submitRecoveredCollection = ({
  command,
  post,
  isCurrent,
  onDispatch = () => {},
}) =>
  new Promise((resolve, reject) => {
    let done = false;
    const controller = new AbortController();
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) controller.abort();
      error ? reject(entrySubmissionError(error)) : resolve();
    };
    const timer = setTimeout(
      () => finish("order.collectionRecovery.unknown"),
      30000,
    );
    try {
      if (!isCurrent()) {
        finish("order.progress.requestChanged");
        return;
      }
      onDispatch();
      Promise.resolve(
        post(command.body, controller.signal, command.attempt),
      ).then(
        (response) => {
          if (done) return;
          if (!isCurrent()) {
            finish("order.progress.requestChanged");
            return;
          }
          if (
            !response?.redirected &&
            isCollectionRejection(response, command.attempt)
          ) {
            finish("order.collectionRecovery.rejected");
            return;
          }
          if (response?.status !== 200 || response.redirected) {
            finish("order.collectionRecovery.unknown");
            return;
          }
          const data = response.data;
          if (
            data?.success !== true ||
            data.sampleOrderItems?.sampleId !== command.sampleId ||
            data.sampleOrderItems?.labNo !== command.labNo
          ) {
            finish("order.collectionRecovery.unknown");
            return;
          }
          finish();
        },
        () => finish("order.collectionRecovery.unknown"),
      );
    } catch {
      finish("order.collectionRecovery.unknown");
    }
  });

// A fresh correlation token, not permission to replay a timed-out write.
export const freezeCollectionAttempt = async (body) => {
  const attemptId = crypto.randomUUID();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("raw-json-v1\n" + body),
  );
  return Object.freeze({
    attemptId,
    fingerprint: [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  });
};
const isCollectionRejection = (response, attempt) => {
  const value = response.data;
  const statuses = {
    "collection.requestInvalid": 400,
    "collection.confirmationRequired": 400,
    "collection.dateTimeInvalid": 400,
    "collection.sampleMismatch": 409,
    "collection.requestChanged": 409,
  };
  return Boolean(
    attempt &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(attempt.attemptId) &&
    /^[a-f0-9]{64}$/.test(attempt.fingerprint) &&
    value &&
    Object.keys(value).sort().join(",") ===
      "attemptId,code,errorKey,fingerprint,success,version" &&
    value.success === false &&
    value.code === "COLLECTION_NOT_SAVED" &&
    value.version === 1 &&
    value.attemptId === attempt.attemptId &&
    value.fingerprint === attempt.fingerprint &&
    Object.prototype.hasOwnProperty.call(statuses, value.errorKey) &&
    statuses[value.errorKey] === response.status,
  );
};
