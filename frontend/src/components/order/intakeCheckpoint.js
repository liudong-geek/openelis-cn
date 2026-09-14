import {
  digestIntakeText,
  intakeFailure,
  intakeUuid,
  intakeHash,
  intakeId,
  intakeRecordedFacts,
  intakeCommandFacts,
} from "./intakeDecision";
export const INTAKE_CHECKPOINT_KEY = "lis.intake-decision.pending.v1";
const fail = () => {
  throw intakeFailure();
};
export function readIntakeCheckpoint() {
  try {
    const raw = sessionStorage.getItem(INTAKE_CHECKPOINT_KEY);
    if (raw === null) return null;
    if (raw.length > 2000) return fail();
    const v = JSON.parse(raw);
    if (
      !v ||
      Object.keys(v).sort().join(",") !==
        "facts,operationId,salt,submissionId,version" ||
      v.version !== 1 ||
      !intakeUuid(v.operationId) ||
      !intakeUuid(v.submissionId) ||
      !intakeUuid(v.salt) ||
      !intakeHash(v.facts)
    )
      return fail();
    return v;
  } catch {
    return fail();
  }
}
const digest = (salt, facts) => digestIntakeText(JSON.stringify([salt, facts]));
export async function rememberIntakeCheckpoint(
  submissionId,
  command,
  isCurrent,
  actor,
) {
  if (
    readIntakeCheckpoint() ||
    !intakeUuid(submissionId) ||
    !intakeUuid(command.operationId) ||
    !intakeId(actor)
  )
    return fail();
  const salt = crypto.randomUUID(),
    facts = await digest(salt, intakeCommandFacts(command, actor));
  if (!isCurrent() || readIntakeCheckpoint()) return fail();
  const value = {
    version: 1,
    submissionId,
    operationId: command.operationId,
    salt,
    facts,
  };
  sessionStorage.setItem(INTAKE_CHECKPOINT_KEY, JSON.stringify(value));
  if (JSON.stringify(readIntakeCheckpoint()) !== JSON.stringify(value))
    return fail();
  return value;
}
export function forgetIntakeCheckpoint(expected) {
  if (
    !expected ||
    JSON.stringify(readIntakeCheckpoint()) !== JSON.stringify(expected)
  )
    return fail();
  sessionStorage.removeItem(INTAKE_CHECKPOINT_KEY);
  if (readIntakeCheckpoint()) return fail();
}
export async function reconcileIntakeCheckpoint(result, isCurrent) {
  const pending = readIntakeCheckpoint();
  if (!pending) return;
  const row = result.current?.specimenDecisions?.find(
    (d) => d.operationId === pending.operationId,
  );
  if (
    result.receipt?.submissionId !== pending.submissionId ||
    !row ||
    row.state !== "RECORDED" ||
    row.currentAcceptanceVerified !== false ||
    (await digest(pending.salt, intakeRecordedFacts(result, row))) !==
      pending.facts ||
    !isCurrent()
  )
    return fail();
  forgetIntakeCheckpoint(pending);
}
