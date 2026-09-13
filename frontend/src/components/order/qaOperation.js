import {
  buildQaConfirmation,
  qaCanConfirm,
  qaFailure,
  verifyQaAck,
  verifyQaReadback,
} from "./qaConfirmation";
import {
  rememberQaCheckpoint,
  readQaCheckpoint,
  forgetQaCheckpoint,
  reconcileQaCheckpoint,
} from "./qaCheckpoint";
import { postQaConfirmation } from "./qaTransport";
import { recoverCurrentEntrySubmission } from "./orderEntryCurrent";

// Single-use capability. The caller's UI receives no authority to replace the
// private patient/tube facts or checklist version in this operation.
export function createQaOperation({
  record,
  isBound,
  assertIdle,
  csrf,
  begin,
  end,
  read,
}) {
  let snapshot = JSON.stringify(record.result),
    valid = true,
    used = false,
    command = null;
  const capability = {
    invalidate: () => {
      valid = false;
      command = null;
    },
    isCurrent: () => {
      valid =
        valid &&
        isBound(capability) &&
        record.isCurrent() &&
        JSON.stringify(record.result) === snapshot;
      return valid;
    },
    preview: (keys) => {
      assertIdle();
      if (!capability.isCurrent() || used || !qaCanConfirm(record.result))
        throw qaFailure("requery");
      command = buildQaConfirmation(record.result, keys);
    },
    cancelPreview: () => {
      if (!used) command = null;
    },
    confirm: async () => {
      assertIdle();
      if (!capability.isCurrent() || used || !command || readQaCheckpoint())
        throw qaFailure("requery");
      const token = csrf();
      if (typeof token !== "string" || !token.trim())
        throw qaFailure("requery");
      const frozen = JSON.parse(JSON.stringify(command)),
        reference = { ...record.result.receipt };
      used = true;
      record.used = true;
      record.adopted = false;
      begin(capability);
      let alive = true,
        checkpoint,
        dispatched = false,
        timer;
      const controller = new AbortController();
      const isCurrent = () => alive && capability.isCurrent();
      try {
        return await Promise.race([
          (async () => {
            checkpoint = await rememberQaCheckpoint(
              reference.submissionId,
              frozen,
              isCurrent,
            );
            if (!isCurrent()) throw qaFailure("requery");
            dispatched = true;
            const ack = await postQaConfirmation(
              JSON.stringify(frozen),
              controller.signal,
              token,
            );
            if (!isCurrent()) throw qaFailure("requery");
            verifyQaAck(ack, frozen);
            const next = await recoverCurrentEntrySubmission({
              reference,
              read,
              isCurrent,
              signal: controller.signal,
            });
            verifyQaReadback(next, frozen);
            if (!isCurrent()) throw qaFailure("requery");
            await reconcileQaCheckpoint(next, isCurrent);
            if (!isCurrent()) throw qaFailure("requery");
            record.result = JSON.parse(JSON.stringify(next));
            snapshot = JSON.stringify(record.result);
            return JSON.parse(JSON.stringify(next));
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              alive = false;
              controller.abort();
              reject(qaFailure());
            }, 15000);
          }),
        ]);
      } catch {
        if (!dispatched && checkpoint) forgetQaCheckpoint(checkpoint);
        throw qaFailure();
      } finally {
        alive = false;
        clearTimeout(timer);
        controller.abort();
        end(capability);
      }
    },
  };
  return capability;
}
