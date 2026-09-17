import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DataTable,
  InlineLoading,
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
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
  putToOpenElisServerFullResponse,
} from "../../utils/Utils";
import "./HisResultOutboxPanel.css";

const statusKinds = {
  PENDING: "blue",
  FAILED: "red",
  ACKNOWLEDGED: "green",
  DEAD_LETTER: "magenta",
  CLOSED: "gray",
};

const headers = [
  { key: "businessId", header: "his.outbox.businessId" },
  { key: "eventType", header: "his.outbox.eventType" },
  { key: "status", header: "his.outbox.status" },
  { key: "attempts", header: "his.outbox.attempts" },
  { key: "response", header: "his.outbox.response" },
  { key: "hash", header: "his.outbox.hash" },
  { key: "actions", header: "his.outbox.actions" },
];

const parseResponse = async (response) => {
  if (!response?.ok) {
    throw new Error(`HTTP ${response?.status || 0}`);
  }
  return response.json();
};

export default function HisResultOutboxPanel() {
  const intl = useIntl();
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closingId, setClosingId] = useState(null);
  const [closeReason, setCloseReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    getFromOpenElisServer(`/rest/his-result-outbox${query}`, (response) => {
      if (Array.isArray(response)) {
        setMessages(response);
        setError("");
      } else {
        setError(intl.formatMessage({ id: "his.outbox.loadError" }));
      }
      setLoading(false);
    });
  }, [intl, status]);

  useEffect(() => load(), [load]);

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

  const finish = () => {
    setBusy(false);
    load();
  };

  const simulate = (outcome) => {
    const stamp = Date.now();
    setBusy(true);
    postToOpenElisServerJsonResponse(
      "/rest/his-result-outbox/simulate",
      JSON.stringify({
        sourceSystem: "HIS-SIM",
        businessId: `SIM-${stamp}`,
        eventType: "REPORT",
        idempotencyKey: `HIS-SIM-${stamp}`,
        payload: JSON.stringify({ reportId: `SIM-${stamp}`, version: 1 }),
        maxAttempts: 3,
        outcome,
      }),
      (response) => {
        if (!response?.id) {
          setError(intl.formatMessage({ id: "his.outbox.actionError" }));
        }
        finish();
      },
    );
  };

  const retry = (id) => {
    setBusy(true);
    putToOpenElisServerFullResponse(
      `/rest/his-result-outbox/${id}/retry`,
      null,
      async (response) => {
        try {
          await parseResponse(response);
        } catch (_error) {
          setError(intl.formatMessage({ id: "his.outbox.actionError" }));
        }
        finish();
      },
    );
  };

  const close = (id) => {
    if (!closeReason.trim()) return;
    setBusy(true);
    putToOpenElisServerFullResponse(
      `/rest/his-result-outbox/${id}/close`,
      JSON.stringify({ reason: closeReason }),
      async (response) => {
        try {
          await parseResponse(response);
          setClosingId(null);
          setCloseReason("");
        } catch (_error) {
          setError(intl.formatMessage({ id: "his.outbox.actionError" }));
        }
        finish();
      },
    );
  };

  const rows = messages.map((message) => ({
    ...message,
    id: String(message.id),
    attempts: `${message.attemptCount}/${message.maxAttempts}`,
    response: message.lastError || message.responseCode || "—",
    hash: message.payloadHash?.slice(0, 12) || "—",
  }));

  return (
    <section className="his-outbox-panel" aria-labelledby="his-outbox-title">
      <div className="his-outbox-panel__header">
        <div>
          <h3 id="his-outbox-title">
            <FormattedMessage id="his.outbox.title" />
          </h3>
          <p>
            <FormattedMessage id="his.outbox.description" />
          </p>
        </div>
        <div className="his-outbox-panel__actions">
          <Select
            id="his-outbox-status"
            labelText={intl.formatMessage({ id: "his.outbox.filter" })}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <SelectItem
              value=""
              text={intl.formatMessage({ id: "his.outbox.all" })}
            />
            {Object.keys(statusKinds).map((value) => (
              <SelectItem
                key={value}
                value={value}
                text={intl.formatMessage({ id: `his.outbox.status.${value}` })}
              />
            ))}
          </Select>
          <Button
            kind="secondary"
            disabled={busy}
            onClick={() => simulate("FAILED")}
          >
            <FormattedMessage id="his.outbox.simulateFailure" />
          </Button>
          <Button disabled={busy} onClick={() => simulate("ACKNOWLEDGED")}>
            <FormattedMessage id="his.outbox.simulateAck" />
          </Button>
        </div>
      </div>

      <div className="his-outbox-panel__summary">
        {Object.entries(summary).map(([key, value]) => (
          <div className="his-outbox-panel__metric" key={key}>
            <strong>{value}</strong>
            <FormattedMessage id={`his.outbox.summary.${key}`} />
          </div>
        ))}
      </div>

      {error && <div role="alert">{error}</div>}
      {loading ? (
        <InlineLoading
          description={intl.formatMessage({ id: "his.outbox.loading" })}
        />
      ) : (
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
                          if (cell.info.header === "status") {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type={statusKinds[cell.value] || "gray"}>
                                  {intl.formatMessage({
                                    id: `his.outbox.status.${cell.value}`,
                                  })}
                                </Tag>
                              </TableCell>
                            );
                          }
                          if (cell.info.header === "eventType") {
                            return (
                              <TableCell key={cell.id}>
                                {intl.formatMessage({
                                  id: `his.outbox.event.${cell.value}`,
                                })}
                              </TableCell>
                            );
                          }
                          if (cell.info.header === "hash") {
                            return (
                              <TableCell
                                className="his-outbox-panel__hash"
                                key={cell.id}
                              >
                                {cell.value}
                              </TableCell>
                            );
                          }
                          if (cell.info.header === "actions") {
                            const completed = [
                              "ACKNOWLEDGED",
                              "CLOSED",
                            ].includes(original?.status);
                            return (
                              <TableCell key={cell.id}>
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  disabled={busy || completed}
                                  onClick={() => retry(original.id)}
                                >
                                  <FormattedMessage id="his.outbox.retry" />
                                </Button>
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  disabled={busy || completed}
                                  onClick={() => setClosingId(original.id)}
                                >
                                  <FormattedMessage id="his.outbox.close" />
                                </Button>
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
      )}

      {closingId && (
        <div className="his-outbox-panel__close">
          <TextInput
            id="his-outbox-close-reason"
            labelText={intl.formatMessage({ id: "his.outbox.closeReason" })}
            value={closeReason}
            onChange={(event) => setCloseReason(event.target.value)}
          />
          <Button
            disabled={!closeReason.trim() || busy}
            onClick={() => close(closingId)}
          >
            <FormattedMessage id="his.outbox.confirmClose" />
          </Button>
        </div>
      )}
    </section>
  );
}
