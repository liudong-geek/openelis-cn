import { collectionMaster } from "./collectionRecovery";
import { labelFailure } from "./labelCheckpoint";

const validId = (value) =>
  /^[1-9]\d{0,9}$/.test(String(value ?? "")) && Number(value) <= 2147483647;
const invalid = () => {
  throw labelFailure("INVALID_CURRENT");
};
// Narrow a verified current DTO to actual, collected clinical tubes. Never
// hydrate a legacy form or substitute logical IDs / synthetic barcode suffixes.
export function recoveredLabelIdentity(result) {
  const current = result?.current;
  if (current?.workflowType !== "clinical") throw labelFailure("UNSUPPORTED");
  if (
    !validId(current.sampleId) ||
    !current.labNo ||
    !validId(current.patient?.id) ||
    current.sampleId !== result.receipt?.sampleId ||
    current.labNo !== result.receipt?.labNo ||
    current.patient.id !== result.receipt?.patientId
  )
    invalid();
  const physical = current.physicalSpecimens;
  if (!Array.isArray(physical) || !Array.isArray(current.requestedSpecimens))
    invalid();
  const samples = current.requestedSpecimens
    .filter((row) => row.status === "COLLECTED")
    .map((request) => {
      const rows = physical.filter(
        (row) =>
          row.id === request.sampleItemId && row.requestId === request.id,
      );
      if (rows.length !== 1) invalid();
      const tube = rows[0],
        type = collectionMaster(current, "TYPE", tube.typeOfSampleId);
      if (
        !validId(tube.id) ||
        !/^[1-9]\d{0,4}$/.test(tube.sortOrder) ||
        tube.typeOfSampleId !== request.typeOfSampleId ||
        tube.voided !== false ||
        tube.rejected !== false ||
        !tube.collectionDate ||
        !Number.isFinite(Date.parse(tube.collectionDate)) ||
        !type?.name ||
        !type.active
      )
        invalid();
      return {
        sampleItemId: tube.id,
        sortOrder: tube.sortOrder,
        sampleTypeName: type.name,
      };
    });
  if (!samples.length) throw labelFailure("NO_COLLECTED");
  if (
    new Set(samples.map((row) => row.sampleItemId)).size !== samples.length ||
    new Set(samples.map((row) => row.sortOrder)).size !== samples.length
  )
    invalid();
  return {
    orderId: current.sampleId,
    labNumber: current.labNo,
    patientName: [current.patient.lastName, current.patient.firstName]
      .filter(Boolean)
      .join(" "),
    samples,
  };
}
export function labelSessionReady(session) {
  try {
    return (
      !session?.errorLoadingSessionDetails &&
      (typeof session?.isCheckingLogin !== "function" ||
        session.isCheckingLogin() === false)
    );
  } catch {
    return false;
  }
}
