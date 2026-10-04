import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionItem,
  Button,
  DataTable,
  InlineLoading,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  useReportSession,
  pendingReportKey,
  readPendingReport,
  rememberPendingReport,
  clearPendingReport,
} from "../../patient/resultsViewer/reportWorkspaceState";
import { ReportApiError } from "../../patient/resultsViewer/patient-report-release-api";
import {
  OUTBOX_STATUSES,
  changeOutboxMessage,
  getOutboxMessages,
  simulateOutboxMessage,
} from "./result-reporting-api";
import "../AdminModal.css";
import "./HisResultOutboxPanel.css";

const statusKinds = {
  PENDING: "blue",
  FAILED: "red",
  ACKNOWLEDGED: "green",
  DEAD_LETTER: "magenta",
  CLOSED: "gray",
};
const headers = [
  "businessId",
  "eventType",
  "status",
  "attempts",
  "response",
  "hash",
  "actions",
].map((key) => ({ key, header: `his.outbox.${key}` }));
export default function HisResultOutboxPanel() {
  const session = useReportSession(true);
  const intl = useIntl();
  if (!session.valid || !session.stamp)
    return (
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title={intl.formatMessage({ id: "resultreporting.adminOnly" })}
      />
    );
  return (
    <OutboxEditor
      key={session.key}
      request={{ stamp: session.stamp, current: session.current }}
    />
  );
}
export function OutboxEditor({ request }) {
  const intl = useIntl();
  const t = (id) => intl.formatMessage({ id: `his.outbox.${id}` });
  const [messages, setMessages] = useState([]),
    [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(""),
    [actionError, setActionError] = useState(""),
    [success, setSuccess] = useState("");
  const [closing, setClosing] = useState(null),
    [closeReason, setCloseReason] = useState("");
  const pendingKey = pendingReportKey(request.stamp.identity, "outbox");
  const [uncertain, setUncertain] = useState(!!readPendingReport(pendingKey));
  const active = useRef(true),
    generation = useRef(0),
    writing = useRef(false),
    latest = useRef(request);
  latest.current = request;
  const context = () => {
    const value = ++generation.current;
    return {
      ...request,
      current: () =>
        active.current &&
        value === generation.current &&
        latest.current.current(),
    };
  };
  const load = async () => {
    if (writing.current) return;
    const c = context();
    setLoading(true);
    setLoadError("");
    try {
      const rows = await getOutboxMessages(status, c);
      if (!c.current()) return;
      setMessages(rows);
      // Reads update the ledger only. An uncertain mutation is never automatically resent.
    } catch {
      if (c.current()) setLoadError(t("loadError"));
    } finally {
      if (c.current()) setLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    void load();
  }, [status]);
  const summary = useMemo(
    () => ({
      total: messages.length,
      pending: messages.filter((item) => item.status === "PENDING").length,
      failed: messages.filter((item) =>
        ["FAILED", "DEAD_LETTER"].includes(item.status),
      ).length,
      acknowledged: messages.filter((item) => item.status === "ACKNOWLEDGED")
        .length,
    }),
    [messages],
  );
  const perform = async (operation) => {
    if (writing.current || busy || uncertain || !request.current()) return;
    const c = context();
    writing.current = true;
    setBusy(true);
    setActionError("");
    setSuccess("");
    try {
      rememberPendingReport(pendingKey, { kind: "rules" }, c);
      const saved =
        operation.kind === "simulate"
          ? await simulateOutboxMessage(operation.body, c)
          : await changeOutboxMessage(
              operation.id,
              operation.kind,
              operation.kind === "close" ? { reason: operation.reason } : null,
              c,
            );
      if (!c.current()) return;
      clearPendingReport(pendingKey);
      setSuccess(t("actionSucceeded"));
      if (operation.kind === "close") {
        setClosing(null);
        setCloseReason("");
      }
      // Stable response identity and requested status were validated by the local API.
      setMessages((current) =>
        current.map((row) => (row.id === saved.id ? saved : row)),
      );
    } catch (failure) {
      if (!c.current()) return;
      const rejected =
        failure instanceof ReportApiError && failure.kind === "rejected";
      if (!rejected) setUncertain(true);
      else clearPendingReport(pendingKey);
      setActionError(t(rejected ? "actionError" : "unknown"));
    } finally {
      writing.current = false;
      if (c.current()) {
        setBusy(false);
        void load();
      }
    }
  };
  const simulate = (outcome) => {
    const idempotencyKey = `HIS-SIM-${crypto.randomUUID()}`;
    void perform({
      kind: "simulate",
      body: {
        sourceSystem: "HIS-SIM",
        businessId: idempotencyKey,
        eventType: "REPORT",
        idempotencyKey,
        payload: JSON.stringify({ reportId: idempotencyKey, version: 1 }),
        maxAttempts: 3,
        outcome,
      },
    });
  };
  const rows = messages.map((message) => ({
    ...message,
    id: String(message.id),
    attempts: `${message.attemptCount}/${message.maxAttempts}`,
    response: message.lastError || message.responseCode || "—",
    hash: message.payloadHash?.slice(0, 12) || "—",
  }));
  const locked = busy || uncertain;
  return (
    <section className="his-outbox-panel" aria-labelledby="his-outbox-title">
      <div className="his-outbox-panel__header">
        <div>
          <h2 id="his-outbox-title">{t("title")}</h2>
          <p>{t("operationsHelp")}</p>
        </div>
        <div className="his-outbox-panel__actions">
          <Select
            id="his-outbox-status"
            labelText={t("filter")}
            value={status}
            disabled={busy}
            onChange={(event) => setStatus(event.target.value)}
          >
            <SelectItem value="" text={t("all")} />
            {OUTBOX_STATUSES.map((value) => (
              <SelectItem
                key={value}
                value={value}
                text={t(`status.${value}`)}
              />
            ))}
          </Select>
          <Button
            kind="tertiary"
            size="sm"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            {t("reload")}
          </Button>
        </div>
      </div>
      <p className="his-outbox-panel__scope">{t("loadedScope")}</p>
      <div className="his-outbox-panel__summary">
        {Object.entries(summary).map(([key, value]) => (
          <div className="his-outbox-panel__metric" key={key}>
            <strong>{value}</strong>
            <FormattedMessage id={`his.outbox.summary.${key}`} />
          </div>
        ))}
      </div>
      {loadError && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={loadError}
        />
      )}
      {(actionError || uncertain) && (
        <InlineNotification
          kind={uncertain ? "warning" : "error"}
          lowContrast
          hideCloseButton
          title={actionError || t("unknown")}
        />
      )}
      {success && (
        <InlineNotification
          kind="success"
          lowContrast
          hideCloseButton
          title={success}
        />
      )}
      {loading && <InlineLoading description={t("loading")} />}
      {!loading && messages.length === 0 && !loadError && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={t("empty")}
        />
      )}
      {!loading && messages.length > 0 && (
        <div className="his-outbox-panel__table">
          <DataTable rows={rows} headers={headers}>
            {({
              rows: tableRows,
              headers: tableHeaders,
              getHeaderProps,
              getRowProps,
            }) => (
              <TableContainer>
                <Table size="sm">
                  <TableHead>
                    <TableRow>
                      {tableHeaders.map((header) => (
                        <TableHeader
                          {...getHeaderProps({ header })}
                          key={header.key}
                        >
                          <FormattedMessage id={header.header} />
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.map((row) => {
                      const original = messages.find(
                        (item) => String(item.id) === row.id,
                      );
                      return (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          {row.cells.map((cell) => {
                            if (cell.info.header === "status")
                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={statusKinds[cell.value] || "gray"}>
                                    {t(`status.${cell.value}`)}
                                  </Tag>
                                </TableCell>
                              );
                            if (cell.info.header === "eventType")
                              return (
                                <TableCell key={cell.id}>
                                  {t(`event.${cell.value}`)}
                                </TableCell>
                              );
                            if (cell.info.header === "hash")
                              return (
                                <TableCell
                                  className="his-outbox-panel__hash"
                                  key={cell.id}
                                >
                                  {cell.value}
                                </TableCell>
                              );
                            if (cell.info.header === "actions") {
                              const completed = [
                                "ACKNOWLEDGED",
                                "CLOSED",
                              ].includes(original.status);
                              return (
                                <TableCell key={cell.id}>
                                  <div className="his-outbox-panel__row-actions">
                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      disabled={locked || completed}
                                      onClick={() =>
                                        void perform({
                                          kind: "retry",
                                          id: original.id,
                                        })
                                      }
                                    >
                                      {t("retry")}
                                    </Button>
                                    <Button
                                      kind="tertiary"
                                      size="sm"
                                      disabled={locked || completed}
                                      onClick={() => {
                                        setClosing({
                                          id: original.id,
                                          businessId: original.businessId,
                                        });
                                        setCloseReason("");
                                      }}
                                    >
                                      {t("close")}
                                    </Button>
                                  </div>
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={cell.id}>{cell.value}</TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </div>
      )}
      <Accordion className="his-outbox-panel__simulation">
        <AccordionItem title={t("simulationTitle")}>
          <p>{t("simulationHelp")}</p>
          <div className="his-outbox-panel__actions">
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() => simulate("FAILED")}
            >
              {t("simulateFailure")}
            </Button>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() => simulate("ACKNOWLEDGED")}
            >
              {t("simulateAck")}
            </Button>
          </div>
        </AccordionItem>
      </Accordion>
      <Modal
        open={!!closing}
        className="oe-admin-modal"
        modalHeading={t("closeTitle")}
        primaryButtonText={t("confirmClose")}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        primaryButtonDisabled={!closeReason.trim() || locked}
        onRequestClose={() => {
          if (!writing.current) {
            setClosing(null);
            if (!uncertain) setCloseReason("");
          }
        }}
        onRequestSubmit={() => {
          if (closing && closeReason.trim())
            void perform({
              kind: "close",
              id: closing.id,
              reason: closeReason.trim(),
            });
        }}
      >
        <p>{t("closeHelp")}</p>
        <p className="his-outbox-panel__business-id">{closing?.businessId}</p>
        <TextInput
          id="his-outbox-close-reason"
          labelText={t("closeReason")}
          value={closeReason}
          disabled={locked}
          onChange={(event) => setCloseReason(event.target.value)}
        />
        {actionError && (
          <InlineNotification
            kind={uncertain ? "warning" : "error"}
            lowContrast
            hideCloseButton
            title={actionError}
          />
        )}
      </Modal>
    </section>
  );
}
