import {
  entrySubmissionError,
  isFirstEntry,
  isPersistedEntry,
  isEntryInputRejection,
  freezeEntrySubmission,
  verifyEntryReceipt,
} from "./orderEntryReceipt";
export { entrySubmissionError, validOrderId } from "./orderEntryReceipt";

export const submitOrderEntry = ({
  operation,
  body,
  samples,
  orderId,
  post,
  isCurrent,
  canContinue,
  onUnknown,
  beforeDispatch = () => {},
}) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let postAccepted = false;
    let timer;
    let command;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const unknown = (code) => {
      if (settled) return;
      if (!operation.dispatched) {
        finish(null, entrySubmissionError("order.save.incomplete"));
        return;
      }
      onUnknown(operation);
      const error = entrySubmissionError("order.save.readbackUnconfirmed");
      if (code) error.code = code;
      finish(null, error);
    };
    const current = () => {
      if (settled) return false;
      if (!isCurrent(operation)) {
        onUnknown(operation);
        finish(null, entrySubmissionError("order.progress.requestChanged"));
        return false;
      }
      if (!canContinue(operation)) {
        unknown("SESSION_WRITE_BLOCKED");
        return false;
      }
      return true;
    };
    operation.cancel = () => {
      operation.invalidated = true;
      finish(null, entrySubmissionError("order.progress.requestChanged"));
    };
    operation.markUnknown = unknown;
    // Preparation has not reached the server. Fail before the page's overall
    // 30s wait so a stalled digest is never confused with an unknown commit.
    timer = setTimeout(
      () => finish(null, entrySubmissionError("order.save.incomplete")),
      10000,
    );
    const dispatch = async () => {
      try {
        if (!isCurrent(operation)) {
          operation.cancel();
          return;
        }
        if (!canContinue(operation)) {
          finish(null, entrySubmissionError("security.sessionWriteBlocked"));
          return;
        }
        const form = JSON.parse(body);
        if (!isFirstEntry(form, orderId) && !isPersistedEntry(form, orderId)) {
          finish(null, entrySubmissionError("order.save.incomplete"));
          return;
        }
        if (isPersistedEntry(form, orderId)) {
          finish(null, entrySubmissionError("order.entry.editUnavailable"));
          return;
        }
        if (isFirstEntry(form, orderId)) {
          command = await freezeEntrySubmission(form, samples);
          // This exact key and serialized body remain attached to the operation,
          // including an unknown outcome. Never reconstruct a retry from live UI.
          operation.command = command;
          if (settled) return;
          if (!isCurrent(operation)) {
            operation.cancel();
            return;
          }
          if (!canContinue(operation)) {
            finish(null, entrySubmissionError("security.sessionWriteBlocked"));
            return;
          }
        }
        clearTimeout(timer);
        beforeDispatch(command);
        timer = setTimeout(unknown, 30000);
        operation.dispatched = true;
        post(
          "/rest/SamplePatientEntry",
          command ? command.body : body,
          async (response, _extra, requestError) => {
            if (postAccepted || !current()) return;
            postAccepted = true;
            const status = requestError?.status || response?.status || 0;
            if (command) {
              let data;
              try {
                data = await response?.json();
              } catch {
                /* Unknown, not a rollback. */
              }
              if (!current()) return;
              if (requestError || (status !== 200 && status !== 201)) {
                // Only a parsed, explicit input rejection of this fresh command
                // permits editing. Conflicts/auth failures keep the original key.
                if (
                  [400, 422].includes(status) &&
                  isEntryInputRejection(data)
                ) {
                  finish(
                    null,
                    Object.assign(
                      entrySubmissionError("order.save.incomplete", status),
                      { details: data },
                    ),
                  );
                } else unknown();
                return;
              }
              try {
                finish(verifyEntryReceipt(data, command));
              } catch {
                unknown();
              }
              return;
            }
          },
          undefined,
          command ? { "Idempotency-Key": command.submissionId } : undefined,
        );
      } catch (error) {
        // The transport adapter may throw after dispatch; never infer rollback.
        if (operation.dispatched) {
          if (current()) unknown();
        } else
          finish(
            null,
            error?.errorKey
              ? error
              : entrySubmissionError("order.save.incomplete"),
          );
      }
    };
    void dispatch();
  });
