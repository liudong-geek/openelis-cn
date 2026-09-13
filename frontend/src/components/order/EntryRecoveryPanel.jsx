import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Stack,
  TextInput,
  Tile,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { useOrderContext } from "./OrderContext";
import EntryCurrentSummary from "./EntryCurrentSummary";

// Kept outside the locked clinical form: recovery is an explicit authorized
// read, not another Save button. A receipt never silently replaces a draft.
export default function EntryRecoveryPanel() {
  const intl = useIntl();
  const context = useOrderContext();
  const {
    entryRecovery,
    queryCurrentEntryRecovery,
    isRecoveryCurrent,
    isSubmitting,
  } = context;
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), []);
  const t = (id) => intl.formatMessage({ id });
  if (!queryCurrentEntryRecovery) return null;
  const pending = entryRecovery?.checkpoint;
  const visibleReceipt = receipt && isRecoveryCurrent?.() ? receipt : null;
  const lookupCode = pending?.submissionId || code.trim();
  const query = async () => {
    if (busy || isSubmitting) return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const result = await queryCurrentEntryRecovery(
        lookupCode,
        controller.signal,
      );
      if (!controller.signal.aborted) setReceipt(result);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure.errorKey || "order.recovery.unavailable");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  if (!pending && !expanded && !entryRecovery?.error)
    return (
      <Button kind="ghost" size="sm" onClick={() => setExpanded(true)}>
        {t("order.recovery.currentTitle")}
      </Button>
    );
  return (
    <Tile>
      <Stack gap={4}>
        <h4>{t("order.recovery.currentTitle")}</h4>
        <p>{t("order.recovery.help")}</p>
        {entryRecovery?.error && (
          <InlineNotification
            kind="error"
            hideCloseButton
            title={t(entryRecovery.error)}
          />
        )}
        <TextInput
          id="entry-recovery-code"
          labelText={t("order.save.submissionReference")}
          value={lookupCode}
          maxLength={36}
          readOnly={Boolean(pending)}
          disabled={busy || isSubmitting}
          onChange={(event) => {
            setCode(event.target.value);
            setReceipt(null);
            setError(null);
          }}
        />
        <Button
          size="md"
          disabled={busy || isSubmitting || !lookupCode}
          onClick={query}
        >
          {t("order.recovery.currentCheck")}
        </Button>
        {busy && <InlineLoading description={t("order.recovery.loading")} />}
        {error && (
          <InlineNotification kind="warning" hideCloseButton title={t(error)} />
        )}
        {visibleReceipt && <EntryCurrentSummary result={visibleReceipt} />}
      </Stack>
    </Tile>
  );
}
