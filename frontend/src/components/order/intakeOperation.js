import {
  buildIntakeDecision,
  intakeFailure,
  verifyIntakeAck,
  verifyIntakeReadback,
} from "./intakeDecision";
import {
  rememberIntakeCheckpoint,
  readIntakeCheckpoint,
  forgetIntakeCheckpoint,
  reconcileIntakeCheckpoint,
} from "./intakeCheckpoint";
import { postIntakeDecision } from "./intakeTransport";
import { recoverCurrentEntrySubmission } from "./orderEntryCurrent";

export function createIntakeOperation({
  record,
  isBound,
  assertIdle,
  csrf,
  actor,
  begin,
  end,
  read,
  denied,
}) {
  let snapshot = JSON.stringify(record.result),
    valid = true,
    used = false,
    command = null,
    previewSequence = 0;
  const operation = {
    invalidate: () => {
      valid = false;
      command = null;
      previewSequence++;
    },
    isCurrent: () => {
      valid =
        valid &&
        isBound(operation) &&
        record.isCurrent() &&
        JSON.stringify(record.result) === snapshot;
      return valid;
    },
    preview: async (tubeId, decision, reasonId) => {
      assertIdle();
      if (!operation.isCurrent() || used) throw intakeFailure("requery");
      command = null;
      const sequence = ++previewSequence;
      let timer;
      const next = await Promise.race([
        buildIntakeDecision(record.result, tubeId, decision, reasonId),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            previewSequence++;
            reject(intakeFailure("requery"));
          }, 15000);
        }),
      ]).finally(() => clearTimeout(timer));
      if (!operation.isCurrent() || used || sequence !== previewSequence)
        throw intakeFailure("requery");
      command = next;
      return JSON.parse(JSON.stringify(next));
    },
    cancelPreview: () => {
      if (!used) {
        command = null;
        previewSequence++;
      }
    },
    confirm: async () => {
      assertIdle();
      if (!operation.isCurrent() || used || !command || readIntakeCheckpoint())
        throw intakeFailure("requery");
      const token = csrf();
      if (typeof token !== "string" || !token.trim())
        throw intakeFailure("requery");
      const frozen = JSON.parse(JSON.stringify(command)),
        reference = { ...record.result.receipt };
      used = true;
      record.used = true;
      record.adopted = false;
      begin(operation);
      const controller = new AbortController();
      let alive = true,
        dispatched = false,
        checkpoint,
        timer;
      const isCurrent = () => alive && operation.isCurrent();
      try {
        return await Promise.race([
          (async () => {
            checkpoint = await rememberIntakeCheckpoint(
              reference.submissionId,
              frozen,
              isCurrent,
              actor,
            );
            if (!isCurrent()) throw intakeFailure("requery");
            dispatched = true;
            const ack = await postIntakeDecision(
              JSON.stringify(frozen),
              controller.signal,
              token,
              denied,
            );
            if (!isCurrent()) throw intakeFailure("requery");
            verifyIntakeAck(ack, frozen, actor);
            const guardedRead = async (...args) => {
              const response = await read(...args);
              if ([401, 403].includes(response.status)) {
                denied();
                throw intakeFailure("denied");
              }
              return response;
            };
            const next = await recoverCurrentEntrySubmission({
              reference,
              read: guardedRead,
              isCurrent,
              signal: controller.signal,
            });
            verifyIntakeReadback(next, frozen, actor, ack);
            if (!isCurrent()) throw intakeFailure("requery");
            await reconcileIntakeCheckpoint(next, isCurrent);
            if (!isCurrent()) throw intakeFailure("requery");
            record.result = JSON.parse(JSON.stringify(next));
            snapshot = JSON.stringify(record.result);
            return JSON.parse(JSON.stringify(next));
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              alive = false;
              controller.abort();
              reject(intakeFailure());
            }, 15000);
          }),
        ]);
      } catch (error) {
        if (!dispatched && checkpoint) forgetIntakeCheckpoint(checkpoint);
        throw intakeFailure(
          error?.errorKey === "order.intakeDecision.denied"
            ? "denied"
            : "unknown",
        );
      } finally {
        alive = false;
        clearTimeout(timer);
        controller.abort();
        end(operation);
      }
    },
  };
  return operation;
}
