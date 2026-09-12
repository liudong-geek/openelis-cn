// A bounded client operation, not a transaction or a persistent receipt. A
// timed-out POST may have committed; its application must remain unconfirmed.
export const entrySubmissionError = (key, status) =>
  Object.assign(new Error(key), {
    errorKey: key,
    status,
    code:
      key === "order.save.readbackUnconfirmed"
        ? "WRITE_READBACK_UNCONFIRMED"
        : key === "security.sessionWriteBlocked"
          ? "SESSION_WRITE_BLOCKED"
          : undefined,
  });

export const validOrderId = (id) =>
  (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
  (typeof id === "string" && /^[1-9]\d*$/.test(id));

export const submitOrderEntry = ({
  operation,
  body,
  samples,
  orderId,
  patientId,
  requiresPatient = true,
  post,
  read,
  createRequests,
  isCurrent,
  canContinue,
  onUnknown,
}) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let postAccepted = false;
    let readAccepted = false;
    let timer;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const unknown = (code) => {
      if (settled) return;
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
    timer = setTimeout(unknown, 30000);
    try {
      if (!isCurrent(operation)) {
        operation.cancel();
        return;
      }
      if (!canContinue(operation)) {
        finish(null, entrySubmissionError("security.sessionWriteBlocked"));
        return;
      }
      operation.dispatched = true;
      post(
        "/rest/SamplePatientEntry",
        body,
        async (response, _extra, requestError) => {
          if (postAccepted || !current()) return;
          postAccepted = true;
          const status = requestError?.status || response?.status || 0;
          if (requestError || (status !== 200 && status !== 201)) {
            // Only an explicit rejection of the FIRST write is retryable. A
            // rejection after metadata was saved is a partial, unknown outcome.
            if (![400, 401, 403, 409, 422].includes(status)) {
              unknown();
              return;
            }
            let details;
            try {
              details = await response?.json();
            } catch {
              /* Keep a stable error. */
            }
            if (!current()) return;
            finish(
              null,
              requestError ||
                Object.assign(
                  entrySubmissionError("order.save.incomplete", status),
                  { details },
                ),
            );
            return;
          }
          try {
            read(
              `/rest/order/search?labNumber=${encodeURIComponent(operation.labNo)}`,
              async (receipt, readError) => {
                if (readAccepted || !current()) return;
                readAccepted = true;
                if (
                  readError ||
                  receipt?.labNumber !== operation.labNo ||
                  !validOrderId(receipt?.id) ||
                  (requiresPatient &&
                    !patientId &&
                    !validOrderId(receipt.patientProperties?.patientPK)) ||
                  (orderId && String(receipt.id) !== String(orderId)) ||
                  (patientId &&
                    String(receipt.patientProperties?.patientPK || "") !==
                      String(patientId))
                ) {
                  unknown();
                  return;
                }
                try {
                  if (samples.length) {
                    await createRequests(receipt.id, samples, () => current());
                  }
                  if (!current()) return;
                  finish(receipt);
                } catch {
                  if (current()) unknown();
                }
              },
            );
          } catch {
            if (current()) unknown();
          }
        },
      );
    } catch {
      // The transport adapter may throw after dispatch; never infer rollback.
      if (current()) unknown();
    }
  });
