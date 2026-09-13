import { entrySubmissionError } from "./orderEntryReceipt";
import { collectionMaster } from "./collectionRecovery";

export const receiptFailure = (key = "unknown") =>
  entrySubmissionError(`order.receiving.${key}`);
const fail = (key) => {
  throw receiptFailure(key);
};
const id = (v) =>
  typeof v === "string" && /^[1-9]\d{0,9}$/.test(v) && Number(v) <= 2147483647;

// Compare instants without Date's millisecond truncation. The backend contract
// accepts at most six fractional digits. Never round the original collection.
export function receiptInstant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(
      value,
    ) ||
    !(Date.parse(value) > 0) ||
    new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    return fail("invalid");
  const [whole, fraction = ""] = value.slice(0, -1).split(".");
  return `${whole}.${fraction.padEnd(6, "0")}Z`;
}

export function receiptOptions(result) {
  try {
    const c = result.current;
    const master = (kind, value) => collectionMaster(c, kind, value);
    const active = (kind, value) =>
      master(kind, value)?.active && master(kind, value)?.name;
    if (
      c.workflowType !== "clinical" ||
      c.sampleId !== result.receipt.sampleId ||
      c.patient?.id !== result.receipt.patientId ||
      ![c.sampleId, c.patient?.id].every(id) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,24}$/.test(c.labNo) ||
      !active("ORDER_STATUS", c.orderStatusId) ||
      !["Test Entered", "Testing Started"].includes(
        master("ORDER_STATUS", c.orderStatusId).name,
      )
    )
      return [];
    return c.requestedSpecimens.flatMap((request) => {
      const tube = c.physicalSpecimens.find(
        (item) => item.id === request.sampleItemId,
      );
      if (
        request.status !== "COLLECTED" ||
        !tube ||
        tube.requestId !== request.id ||
        tube.typeOfSampleId !== request.typeOfSampleId ||
        typeof tube.sortOrder !== "string" ||
        !/^[1-9]\d{0,4}$/.test(tube.sortOrder) ||
        c.physicalSpecimens.filter((item) => item.sortOrder === tube.sortOrder)
          .length !== 1 ||
        ![request.id, tube.id].every(id) ||
        tube.receivedDate != null ||
        !tube.lastUpdated ||
        !tube.collectionDate ||
        tube.voided ||
        tube.rejected ||
        !active("TYPE", tube.typeOfSampleId) ||
        master("SAMPLE_STATUS", tube.statusId)?.name !== "SampleEntered" ||
        !tube.analyses.length ||
        !tube.analyses.every(
          (a) =>
            id(a.id) &&
            active("TEST", a.testId) &&
            master("ANALYSIS_STATUS", a.statusId)?.name === "Not Tested",
        )
      )
        return [];
      try {
        receiptInstant(tube.collectionDate);
      } catch {
        return [];
      }
      return [
        {
          requestId: request.id,
          sampleItemId: tube.id,
          collectionDate: tube.collectionDate,
          barcode: `${c.labNo}.${tube.sortOrder}`,
          typeName: master("TYPE", tube.typeOfSampleId).name,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function buildReceipt(result, requestIds, now = Date.now()) {
  if (
    !Array.isArray(requestIds) ||
    !requestIds.length ||
    requestIds.length > 100 ||
    new Set(requestIds).size !== requestIds.length ||
    !Number.isFinite(now)
  )
    return fail("invalid");
  const receivedDate = new Date(now).toISOString();
  const available = receiptOptions(result);
  const tubes = requestIds.map((requestId) => {
    const row = available.find((item) => item.requestId === requestId);
    if (
      !row ||
      receiptInstant(receivedDate) < receiptInstant(row.collectionDate)
    )
      return fail("invalid");
    return {
      requestId,
      sampleItemId: row.sampleItemId,
      collectionDate: row.collectionDate,
      receivedDate,
    };
  });
  return {
    sampleId: result.current.sampleId,
    labNo: result.current.labNo,
    patientId: result.current.patient.id,
    tubes,
  };
}

export const receiptFacts = (command, tube) => [
  command.sampleId,
  command.labNo,
  command.patientId,
  tube.requestId,
  tube.sampleItemId,
  receiptInstant(tube.collectionDate),
  receiptInstant(tube.receivedDate),
];

export function verifyReceiptResponse(data, command) {
  if (
    data?.success !== true ||
    data.sampleId !== command.sampleId ||
    data.labNo !== command.labNo ||
    data.patientId !== command.patientId ||
    !Array.isArray(data.tubes) ||
    data.tubes.length !== command.tubes.length
  )
    return fail();
  const seen = new Set();
  for (const row of data.tubes) {
    const expected = command.tubes.find((t) => t.requestId === row?.requestId);
    if (
      !expected ||
      seen.has(row.requestId) ||
      typeof row.replayed !== "boolean" ||
      JSON.stringify(receiptFacts(data, row)) !==
        JSON.stringify(receiptFacts(command, expected))
    )
      return fail();
    seen.add(row.requestId);
  }
}

export function currentReceiptRows(result) {
  const c = result.current;
  return c.requestedSpecimens.flatMap((request) => {
    const tube = c.physicalSpecimens.find(
      (item) =>
        item.id === request.sampleItemId && item.requestId === request.id,
    );
    if (
      request.status !== "COLLECTED" ||
      !tube ||
      tube.voided ||
      tube.rejected ||
      !tube.receivedDate ||
      !tube.collectionDate
    )
      return [];
    return [
      {
        requestId: request.id,
        sampleItemId: tube.id,
        collectionDate: tube.collectionDate,
        receivedDate: tube.receivedDate,
      },
    ];
  });
}

export function verifyCurrentReceipt(result, command) {
  verifyReceiptResponse(
    {
      success: true,
      sampleId: result.current.sampleId,
      labNo: result.current.labNo,
      patientId: result.current.patient?.id,
      tubes: currentReceiptRows(result)
        .filter((t) => command.tubes.some((e) => e.requestId === t.requestId))
        .map((t) => ({ ...t, replayed: false })),
    },
    command,
  );
}
