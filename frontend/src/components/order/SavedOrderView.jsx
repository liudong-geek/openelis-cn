import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory, useLocation } from "react-router-dom";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import ProductPageHeader from "../common/ProductPageHeader";
import ListReturnButton from "../common/ListReturnButton";
import { formatPatientDisplayName } from "../common/patientDisplayName";
import {
  readSavedOrder,
  savedOrderNumberFromSearch,
  savedOrderSessionKey,
  SavedOrderViewError,
} from "./savedOrderViewRequest";
import "./saved-order-view.scss";

const TIMEOUT = 20000;
const empty = { phase: "idle", data: null, error: null, epoch: -1 };
const knownErrors = new Set([
  "invalid",
  "notFound",
  "forbidden",
  "unauthenticated",
  "scope",
  "conflict",
  "timeout",
  "unavailable",
]);
export default function SavedOrderView() {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const session = useContext(UserSessionDetailsContext);
  const labNumber = savedOrderNumberFromSearch(location.search);
  let owner = null;
  let ownerError = null;
  try {
    if (session.errorLoadingSessionDetails)
      throw new SavedOrderViewError("unavailable");
    if (session.isCheckingLogin?.())
      throw new SavedOrderViewError("unavailable");
    owner = savedOrderSessionKey(session.userSessionDetails);
  } catch (error) {
    ownerError = error.kind || "unavailable";
  }
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState(empty);
  const current = useRef({ scope: null, epoch: 0 });
  const active = useRef(null);
  const scope = JSON.stringify([
    owner,
    labNumber,
    intl.locale,
    revision,
    ownerError,
  ]);
  // Invalidate during render so even A -> no-session -> A cannot display or
  // revive a prior response before effect cleanup runs.
  if (current.current.scope !== scope) {
    current.current = { scope, epoch: current.current.epoch + 1 };
  }
  const epoch = current.current.epoch;
  const cancel = () => {
    if (active.current) {
      clearTimeout(active.current.timer);
      active.current.controller.abort();
      active.current = null;
    }
  };
  const isCurrent = (request) =>
    active.current === request &&
    current.current.scope === request.scope &&
    current.current.epoch === request.epoch &&
    !request.controller.signal.aborted;
  const run = (kind, task) => {
    cancel();
    const request = {
      controller: new AbortController(),
      scope,
      epoch,
      timer: null,
    };
    active.current = request;
    request.timer = setTimeout(() => {
      if (!isCurrent(request)) return;
      setState({ phase: "error", data: null, error: "timeout", epoch });
      cancel();
    }, TIMEOUT);
    setState((previous) => ({
      phase: kind,
      data: kind === "checkingModify" ? previous.data : null,
      error: null,
      epoch,
    }));
    void task(request)
      .catch((error) => {
        if (isCurrent(request))
          setState({
            phase: "error",
            data: null,
            error: knownErrors.has(error.kind) ? error.kind : "unavailable",
            epoch,
          });
      })
      .finally(() => {
        if (active.current === request) {
          clearTimeout(request.timer);
          active.current = null;
        }
      });
  };
  useEffect(() => {
    const invalidate = () => {
      current.current = { scope: null, epoch: current.current.epoch + 1 };
      cancel();
      setState(empty);
      setRevision((value) => value + 1);
    };
    window.addEventListener("storage", invalidate);
    return () => {
      window.removeEventListener("storage", invalidate);
      cancel();
    };
  }, []);
  useEffect(() => {
    if (!labNumber || !owner) {
      setState({
        phase: "error",
        data: null,
        error: !labNumber ? "invalid" : ownerError,
        epoch,
      });
      return cancel;
    }
    run("loading", async (request) => {
      const data = await readSavedOrder(
        labNumber,
        request.controller.signal,
        owner,
      );
      if (isCurrent(request))
        setState({ phase: "success", data, error: null, epoch });
    });
    return cancel;
  }, [scope]);
  const visible = state.epoch === epoch ? state : empty;
  const data = ["success", "checkingModify"].includes(visible.phase)
    ? visible.data
    : null;
  const busy =
    visible.phase === "loading" || visible.phase === "checkingModify";
  const canModify =
    visible.phase === "success" &&
    data?.canModify === true &&
    data?.isEditable === true;
  const modify = () => {
    if (!canModify || active.current) return;
    const displayed = data;
    run("checkingModify", async (request) => {
      const fresh = await readSavedOrder(
        labNumber,
        request.controller.signal,
        owner,
      );
      if (!isCurrent(request)) return;
      if (
        fresh.orderId !== displayed.orderId ||
        fresh.labNumber !== displayed.labNumber
      )
        throw new SavedOrderViewError("conflict");
      setState({ phase: "success", data: fresh, error: null, epoch });
      if (!fresh.canModify || !fresh.isEditable) return;
      const listOrigin = location.state?.listOrigin;
      history.push({
        pathname: "/ModifyOrder",
        search: `?${new URLSearchParams({ accessionNumber: fresh.labNumber })}`,
        state: listOrigin ? { listOrigin } : undefined,
      });
    });
  };
  const message = (id) => intl.formatMessage({ id });
  const show = (value) =>
    value == null || value === ""
      ? message("common.notRecorded")
      : String(value);
  const statusName = (row) => {
    const codes =
      row.statusType === "SAMPLE"
        ? new Set(["Entered", "SampleRejected", "Canceled", "Disposed"])
        : row.statusType === "ANALYSIS"
          ? new Set([
              "SampleRejected",
              "NotStarted",
              "Canceled",
              "TechnicalAcceptance",
              "TechnicalRejected",
              "BiologistRejected",
              "NonConforming_depricated",
              "Finalized",
            ])
          : null;
    // Translate only the server-verified category and known semantic code.
    // Retain the actual identity and never infer a state from a name or numeric ID.
    if (codes?.has(row.statusCode)) {
      const category = row.statusType === "SAMPLE" ? "sample" : "analysis";
      return message(`sample.management.${category}Status.${row.statusCode}`);
    }
    return row.statusName || message("order.saved.unknownStatus");
  };
  const warnings = (codes = []) =>
    codes.length > 0 && (
      <ul className="saved-order-view__warnings">
        {[...new Set(codes)].map((code) => (
          <li key={code}>
            {message(
              intl.messages[`order.saved.warning.${code}`]
                ? `order.saved.warning.${code}`
                : "order.saved.warning.UNKNOWN",
            )}
          </li>
        ))}
      </ul>
    );
  const details = (fields) => (
    <dl className="saved-order-view__details">
      {fields.map(([id, value]) => (
        <div key={id}>
          <dt>{message(id)}</dt>
          <dd>{show(value)}</dd>
        </div>
      ))}
    </dl>
  );
  const section = (id, content) => (
    <section className="saved-order-view__section" aria-labelledby={id}>
      <h2 id={id}>{message(id)}</h2>
      {content}
    </section>
  );
  return (
    <div className="saved-order-view">
      <ProductPageHeader
        title={message("order.saved.title")}
        subtitle={message("order.saved.subtitle")}
        actions={
          <>
            <ListReturnButton fallback="/order" />
            <Button
              kind="tertiary"
              size="sm"
              onClick={() => setRevision((value) => value + 1)}
              disabled={visible.phase === "checkingModify"}
            >
              {message("order.saved.reload")}
            </Button>
            <Button
              size="sm"
              onClick={modify}
              disabled={!canModify}
              aria-label={message("workspace.order.edit")}
            >
              {message("workspace.order.edit")}
            </Button>
          </>
        }
      />
      <Tag type="gray">{message("label.readonly")}</Tag>
      {busy && (
        <InlineLoading
          description={message(
            visible.phase === "checkingModify"
              ? "order.saved.checkingModify"
              : "order.saved.loading",
          )}
        />
      )}
      {visible.phase === "error" && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={message(`order.saved.error.${visible.error || "unavailable"}`)}
        />
      )}
      {data && (
        <>
          <div className="saved-order-view__summary">
            {details([["order.saved.labNumber", data.labNumber]])}
          </div>
          {!data.canModify && (
            <p className="saved-order-view__notice">
              {message(
                `order.saved.modifyReason.${data.modifyUnavailableReason}`,
              )}
            </p>
          )}
          {warnings(data.warningCodes)}
          {section(
            "order.saved.patient",
            details([
              [
                "patient.name",
                formatPatientDisplayName(data.patient, intl.locale),
              ],
              ["patient.dob", data.patient?.birthDate],
              [
                "patient.gender",
                data.patient?.gender === "M"
                  ? message("patient.male")
                  : data.patient?.gender === "F"
                    ? message("patient.female")
                    : data.patient?.gender,
              ],
              ["patient.natioanalid", data.patient?.nationalId],
            ]),
          )}
          {section(
            "order.saved.referring",
            details([
              ["order.saved.facility", data.sampleOrderItems.referringSiteName],
              [
                "order.saved.department",
                data.sampleOrderItems.referringSiteDepartmentName,
              ],
              [
                "order.saved.clinician",
                formatPatientDisplayName(
                  {
                    firstName: data.sampleOrderItems.providerFirstName,
                    lastName: data.sampleOrderItems.providerLastName,
                  },
                  intl.locale,
                ),
              ],
              ["order.saved.requestDate", data.sampleOrderItems.requestDate],
              [
                "sample.receivedDate",
                [
                  data.sampleOrderItems.receivedDateForDisplay,
                  data.sampleOrderItems.receivedTime,
                ]
                  .filter(Boolean)
                  .join(" "),
              ],
              [
                "order.saved.priority",
                data.sampleOrderItems.priority &&
                intl.messages[
                  `order.priority.option.${data.sampleOrderItems.priority}`
                ]
                  ? message(
                      `order.priority.option.${data.sampleOrderItems.priority}`,
                    )
                  : data.sampleOrderItems.priority,
              ],
            ]),
          )}
          {section(
            "order.saved.specimens",
            data.samples.length === 0 ? (
              <p>{message("order.saved.noSpecimens")}</p>
            ) : (
              data.samples.map((sample) => (
                <article
                  className="saved-order-view__record"
                  key={sample.sampleItemId}
                >
                  <h3>
                    {intl.formatMessage(
                      { id: "order.saved.specimenRecord" },
                      { id: sample.sampleItemId },
                    )}
                  </h3>
                  {details([
                    ["sample.type", sample.typeName],
                    ["order.saved.barcode", sample.barcode],
                    ["label.status", statusName(sample)],
                    [
                      "order.saved.collectionDate",
                      [sample.collectionDate, sample.collectionTime]
                        .filter(Boolean)
                        .join(" "),
                    ],
                    [
                      "sample.receivedDate",
                      [sample.receivedDate, sample.receivedTime]
                        .filter(Boolean)
                        .join(" "),
                    ],
                    ["order.saved.quantity", sample.quantity],
                    ["order.saved.unit", sample.unitOfMeasureName],
                  ])}
                  {warnings(sample.warningCodes)}
                  {sample.analyses.length === 0 ? (
                    <p>{message("order.saved.noAnalyses")}</p>
                  ) : (
                    <div className="saved-order-view__table">
                      <Table
                        size="sm"
                        aria-label={`${message("order.saved.specimens")} ${show(sample.barcode || sample.typeName)}`}
                      >
                        <TableHead>
                          <TableRow>
                            <TableHeader>
                              {message("sample.entry.project.testName")}
                            </TableHeader>
                            <TableHeader>{message("label.status")}</TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sample.analyses.map((analysis) => (
                            <TableRow key={analysis.analysisId}>
                              <TableCell>
                                {show(analysis.testName)}
                                {analysis.panelName && (
                                  <span className="saved-order-view__secondary">
                                    {analysis.panelName}
                                  </span>
                                )}
                                {warnings(analysis.warningCodes)}
                              </TableCell>
                              <TableCell>{statusName(analysis)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </article>
              ))
            ),
          )}
          {section(
            "order.saved.requests",
            data.requests.length === 0 ? (
              <p>{message("order.saved.noRequests")}</p>
            ) : (
              data.requests.map((request) => (
                <article
                  className="saved-order-view__record"
                  key={request.sampleTypeRequestId}
                >
                  <h3>
                    {intl.formatMessage(
                      { id: "order.saved.requestRecord" },
                      { id: request.sampleTypeRequestId },
                    )}
                  </h3>
                  {details([
                    ["sample.type", request.typeName],
                    [
                      "order.saved.linkedSpecimen",
                      request.sampleItemId
                        ? `${request.sampleItemId}${data.samples.find((sample) => sample.sampleItemId === request.sampleItemId)?.barcode ? ` / ${data.samples.find((sample) => sample.sampleItemId === request.sampleItemId).barcode}` : ""}`
                        : null,
                    ],
                    [
                      "label.status",
                      request.status
                        ? message(`order.saved.requestStatus.${request.status}`)
                        : message("order.saved.unknownStatus"),
                    ],
                    ["order.saved.quantity", request.requestedQuantity],
                    ["order.saved.unit", request.unitOfMeasureName],
                  ])}
                  <ul className="saved-order-view__requested-tests">
                    {request.tests.map((test) => (
                      <li key={test.testId}>{show(test.testName)}</li>
                    ))}
                    {request.panels.map((panel) => (
                      <li key={`panel-${panel.panelId}`}>
                        {show(panel.panelName)}
                      </li>
                    ))}
                  </ul>
                  {warnings(request.warningCodes)}
                </article>
              ))
            ),
          )}
        </>
      )}
    </div>
  );
}
