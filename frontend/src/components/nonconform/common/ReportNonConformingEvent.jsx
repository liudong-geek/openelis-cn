import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  DatePicker,
  DatePickerInput,
  InlineNotification,
  Pagination,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { ConfigurationContext } from "../../layout/Layout";
import {
  formatDateForLocale,
  getCarbonDateFormat,
  getDatePickerPlaceholderMessage,
  parseDateForLocale,
} from "../../common/dateLocaleUtils";
import { formatPatientDisplayName } from "../../common/patientDisplayName";
import NceFileAttachment from "./NceFileAttachment";
import { nceOptionLabel } from "./ncePresentation";
import {
  clearNceOperation,
  linkedIdentity,
  linkedKey,
  newNceRequestId,
  nceId,
  pendingNceOperation,
  readNceMetadata,
  readNceOrders,
  readNceReceipt,
  rememberNceOperation,
  submitNceOperation,
} from "./nceWorkspaceRequest";
import { useNceScope } from "./useNceScope";
import "./ReportNonConformingEvent.css";

const isoDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const identityFields = [
  "sampleId",
  "labNumber",
  "sampleLastupdated",
  "sampleItemId",
  "lastupdated",
  "analysisId",
  "analysisLastupdated",
];
export const ReportNonConformingEvent = ({
  onCancel = () => {},
  onSaved = () => {},
  onStateChange = () => {},
  onScopeUnavailable = () => {},
  resultRow = null,
}) => {
  const intl = useIntl(),
    scope = useNceScope();
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const dateLocale = configurationProperties.DEFAULT_DATE_LOCALE || "zh-CN";
  const [form, setForm] = useState({
    dateOfEvent: isoDay(new Date()),
    reportingUnit: "",
    title: "",
    description: "",
    immediateAction: "",
    suspectedCauses: "",
    proposedAction: "",
    severity: "",
    categoryId: "",
    typeId: "",
    attachments: [],
  });
  const [dateText, setDateText] = useState(
    formatDateForLocale(new Date(), dateLocale),
  );
  const [metadata, setMetadata] = useState({
    phase: "loading",
    owner: null,
    epoch: -1,
  });
  const [feedback, setFeedback] = useState(null),
    [errors, setErrors] = useState({});
  const [links, setLinks] = useState({}),
    [selections, setSelections] = useState({});
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(null),
    [reload, setReload] = useState(0);
  const [search, setSearch] = useState({
    searchType: resultRow ? "labNumber" : "",
    value: resultRow?.accessionNumber ?? resultRow?.labNumber ?? "",
  });
  const [searchResult, setSearchResult] = useState({
    phase: "idle",
    orders: [],
    paging: null,
  });
  const searchEpoch = useRef(0),
    busyRef = useRef(false),
    fixedSubmission = useRef(null),
    stateCallback = useRef(onStateChange);
  stateCallback.current = onStateChange;
  const active =
    scope.owner &&
    metadata.owner === scope.owner &&
    metadata.epoch === scope.epoch &&
    metadata.phase === "success";
  const validResult = !resultRow || nceId(String(resultRow.analysisId ?? ""));
  const ownPending =
    pending?.operation === "CREATE" &&
    (!resultRow ||
      fixedSubmission.current?.command.linkedSpecimens.some(
        (r) => r.analysisId === String(resultRow.analysisId ?? ""),
      ));
  const writable =
    active &&
    metadata.value.canCreate === true &&
    validResult &&
    !busy &&
    !pending;
  useEffect(() => {
    stateCallback.current({ dirty, busy, unknown: !!ownPending });
  }, [dirty, busy, ownPending]);
  useEffect(() => {
    const atOwner = scope.owner,
      atEpoch = scope.epoch;
    searchEpoch.current += 1;
    setMetadata({
      phase: atOwner ? "loading" : "error",
      owner: atOwner,
      epoch: atEpoch,
    });
    setLinks({});
    setSelections({});
    setSearchResult({ phase: "idle", orders: [], paging: null });
    setForm({
      dateOfEvent: isoDay(new Date()),
      reportingUnit: "",
      title: "",
      description: "",
      immediateAction: "",
      suspectedCauses: "",
      proposedAction: "",
      severity: "",
      categoryId: "",
      typeId: "",
      attachments: [],
    });
    setDateText(formatDateForLocale(new Date(), dateLocale));
    setDirty(false);
    setBusy(false);
    busyRef.current = false;
    fixedSubmission.current = null;
    setPending(atOwner ? pendingNceOperation(atOwner) : null);
    setFeedback(null);
    if (!atOwner) return;
    let alive = true;
    scope
      .run((signal, owner) => readNceMetadata(signal, owner))
      .then((value) => {
        if (alive && scope.isCurrent(atOwner, atEpoch))
          setMetadata({
            phase: "success",
            owner: atOwner,
            epoch: atEpoch,
            value,
          });
      })
      .catch((error) => {
        if (alive && scope.isCurrent(atOwner, atEpoch)) {
          setMetadata({ phase: "error", owner: atOwner, epoch: atEpoch });
          setFeedback(
            `nce.workspace.error.${error.kind === "forbidden" || error.kind === "unauthenticated" ? error.kind : "unavailable"}`,
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [scope.owner, scope.epoch, reload]);
  const change = (key, value) => {
    if (!writable) return;
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "categoryId" ? { typeId: "" } : {}),
    }));
    setErrors((e) => ({ ...e, [key]: null }));
    setDirty(true);
  };
  const searchOrders = async (page = 1) => {
    if (!writable || !search.searchType || !search.value.trim()) {
      setFeedback("error.nonconform.report");
      return;
    }
    const seq = ++searchEpoch.current,
      atOwner = scope.owner,
      atEpoch = scope.epoch,
      query = { ...search };
    setSearchResult({ phase: "loading", orders: [], paging: null });
    setFeedback(null);
    try {
      const value = await scope.run((signal, owner) =>
        readNceOrders(query, page, 10, signal, owner),
      );
      if (seq !== searchEpoch.current || !scope.isCurrent(atOwner, atEpoch))
        return;
      setSearchResult({ phase: "success", ...value });
      if (resultRow) {
        const analysisId = String(resultRow.analysisId ?? "");
        const match = value.orders.flatMap((o) =>
          o.specimens.flatMap((s) =>
            s.analyses
              .filter((a) => a.analysisId === analysisId)
              .map((a) => ({
                ...linkedIdentity(o, s, a),
                typeName: s.typeName,
                testName: a.testName,
              })),
          ),
        );
        if (match.length === 1) {
          setLinks({ [linkedKey(match[0])]: match[0] });
          setDirty(true);
        } else setFeedback("nce.workspace.resultUnavailable");
      }
    } catch (error) {
      if (seq === searchEpoch.current && scope.isCurrent(atOwner, atEpoch)) {
        setSearchResult({ phase: "error", orders: [], paging: null });
        setFeedback("nce.workspace.ordersFailed");
      }
    }
  };
  useEffect(() => {
    if (resultRow && writable && searchResult.phase === "idle")
      void searchOrders();
  }, [active]);
  const editSearch = (key, value) => {
    searchEpoch.current += 1;
    setSearch((s) => ({ ...s, [key]: value }));
    setSearchResult({ phase: "idle", orders: [], paging: null });
  };
  const pick = (identity, checked) => {
    if (!writable) return;
    setSelections((previous) => {
      const next = { ...previous };
      if (checked) next[linkedKey(identity)] = identity;
      else delete next[linkedKey(identity)];
      return next;
    });
  };
  const linkSelected = () => {
    if (!writable) return;
    setLinks((l) => ({ ...l, ...selections }));
    setSelections({});
    setDirty(true);
  };
  const receive = (value) => {
    clearNceOperation(scope.owner, value.requestId);
    setPending(null);
    setBusy(false);
    busyRef.current = false;
    stateCallback.current({ dirty: false, busy: false, unknown: false });
    onSaved(value);
  };
  const verifyReceipt = async () => {
    if (!scope.owner || !pending || !ownPending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const atOwner = scope.owner,
      atEpoch = scope.epoch;
    try {
      const value = await scope.run((signal, owner) =>
        readNceReceipt(
          pending.requestId,
          pending.operation,
          pending.eventId,
          signal,
          owner,
        ),
      );
      if (!scope.isCurrent(atOwner, atEpoch)) return;
      if (value.outcome === "APPLIED") receive(value);
      else setFeedback("nce.workspace.notFoundReceipt");
    } catch (error) {
      if (scope.isCurrent(atOwner, atEpoch)) {
        setFeedback(
          ["scope", "unauthenticated", "forbidden"].includes(error.kind)
            ? "nce.workspace.error.forbidden"
            : "nce.workspace.unknown",
        );
        if (["scope", "unauthenticated", "forbidden"].includes(error.kind)) {
          setMetadata({ phase: "error", owner: atOwner, epoch: atEpoch });
          onScopeUnavailable(error.kind);
        }
      }
    } finally {
      if (scope.isCurrent(atOwner, atEpoch)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const submit = async (event) => {
    event?.preventDefault();
    if (!writable || busyRef.current) return;
    if (Object.keys(selections).length) {
      setFeedback("nce.workspace.linkSelectionFirst");
      return;
    }
    const invalid = {};
    for (const key of [
      "dateOfEvent",
      "reportingUnit",
      "description",
      "severity",
      "categoryId",
    ])
      if (!form[key]?.trim())
        invalid[key] = intl.formatMessage({
          id:
            key === "categoryId"
              ? "nce.error.category.required"
              : key === "severity"
                ? "nce.error.severity.required"
                : `nce.error.${key}.required`,
        });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfEvent))
      invalid.dateOfEvent = intl.formatMessage({
        id: "nce.workspace.invalidDate",
      });
    if (resultRow && !Object.keys(links).length) {
      setFeedback("nce.workspace.resultUnavailable");
      return;
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    const requestId = newNceRequestId(),
      command = {
        requestId,
        currentUserId: JSON.parse(scope.owner)[0],
        dateOfEvent: form.dateOfEvent,
        reportingUnit: form.reportingUnit,
        title: form.title,
        description: form.description,
        immediateAction: form.immediateAction,
        suspectedCauses: form.suspectedCauses,
        proposedAction: form.proposedAction,
        severity: form.severity,
        nceCategoryId: form.categoryId,
        nceTypeId: form.typeId || null,
        linkedSpecimens: Object.values(links).map((r) =>
          Object.fromEntries(identityFields.map((k) => [k, r[k]])),
        ),
      };
    const files = form.attachments.map((a) => a.file);
    fixedSubmission.current = { command, files };
    const atOwner = scope.owner,
      atEpoch = scope.epoch;
    try {
      rememberNceOperation(atOwner, {
        requestId,
        operation: "CREATE",
        eventId: null,
      });
    } catch {
      setPending(pendingNceOperation(atOwner));
      setFeedback("nce.workspace.pendingOther");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    stateCallback.current({ dirty: true, busy: true, unknown: false });
    try {
      const value = await scope.run(
        (signal, owner) =>
          submitNceOperation(command, files, "CREATE", null, signal, owner),
        true,
      );
      if (scope.isCurrent(atOwner, atEpoch)) receive(value);
    } catch (error) {
      if (!scope.isCurrent(atOwner, atEpoch)) return;
      if (error.outcome === "UNKNOWN") {
        setPending({ requestId, operation: "CREATE", eventId: null });
        setFeedback("nce.workspace.unknown");
        if (["scope", "unauthenticated", "forbidden"].includes(error.kind)) {
          setMetadata({ phase: "error", owner: atOwner, epoch: atEpoch });
          onScopeUnavailable(error.kind);
        }
      } else {
        clearNceOperation(atOwner, requestId);
        fixedSubmission.current = null;
        setFeedback(
          error.kind === "forbidden" || error.kind === "scope"
            ? "nce.workspace.error.forbidden"
            : "nce.workspace.notApplied",
        );
        if (
          error.kind === "forbidden" ||
          error.kind === "scope" ||
          error.kind === "unauthenticated"
        )
          setMetadata({ phase: "error", owner: atOwner, epoch: atEpoch });
      }
    } finally {
      if (scope.isCurrent(atOwner, atEpoch)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const t = (id) => intl.formatMessage({ id });
  const section = (number, id, children) => (
    <Tile className="nce-form-section">
      <div className="nce-section-header">
        <span className="nce-section-number">{number}</span>
        <h3>{t(id)}</h3>
      </div>
      {children}
    </Tile>
  );
  const types = active
    ? metadata.value.categories.find((c) => c.id === form.categoryId)?.types ||
      []
    : [];
  return (
    <form
      className="nce-form-container admin-form-workspace"
      noValidate
      onSubmit={submit}
    >
      <div className="admin-form-workspace__body">
        {feedback && (
          <InlineNotification
            kind={pending ? "warning" : "error"}
            hideCloseButton
            lowContrast
            title={t(feedback)}
          />
        )}
        {!scope.owner && (
          <p role="alert">{t("nce.workspace.error.unauthenticated")}</p>
        )}
        {metadata.phase === "loading" && (
          <p role="status">{t("nce.workspace.formLoading")}</p>
        )}
        {metadata.phase === "error" && scope.owner && !ownPending && (
          <Button
            type="button"
            kind="tertiary"
            onClick={() => setReload((n) => n + 1)}
          >
            {t("nce.workspace.retry")}
          </Button>
        )}
        {ownPending && (
          <div className="nce-receipt-check">
            <p>{t("nce.workspace.unknown")}</p>
            <Button
              type="button"
              kind="tertiary"
              disabled={busy}
              onClick={verifyReceipt}
            >
              {t("nce.workspace.checkReceipt")}
            </Button>
          </div>
        )}
        {pending && !ownPending && (
          <p role="alert">{t("nce.workspace.pendingOther")}</p>
        )}
        {resultRow && !validResult && (
          <p role="alert">{t("nce.workspace.resultUnavailable")}</p>
        )}
        {active && !metadata.value.canCreate && (
          <p role="alert">{t("nce.workspace.createDenied")}</p>
        )}
        {active && (
          <fieldset className="nce-form-fields" disabled={!writable}>
            {section(
              "01",
              "nce.section.reporterContext",
              <div className="nce-form-grid nce-context-grid">
                <TextInput
                  id="nce-number"
                  labelText={t("nce.field.nceNumber")}
                  value={t("nce.number.afterSave")}
                  readOnly
                />
                <TextInput
                  id="reporter-name"
                  labelText={t("nce.field.reporterName")}
                  value={
                    formatPatientDisplayName(
                      metadata.value.reporter,
                      intl.locale,
                    ) ||
                    metadata.value.reporter.loginName ||
                    "—"
                  }
                  readOnly
                />
                <DatePicker
                  datePickerType="single"
                  dateFormat={getCarbonDateFormat(dateLocale)}
                  value={dateText}
                  maxDate={formatDateForLocale(new Date(), dateLocale)}
                  onChange={(dates) => {
                    if (dates?.[0]) {
                      const d = new Date(dates[0]);
                      setDateText(formatDateForLocale(d, dateLocale));
                      change("dateOfEvent", isoDay(d));
                    }
                  }}
                >
                  <DatePickerInput
                    id="date-of-event"
                    pattern={
                      getCarbonDateFormat(dateLocale) === "Y/m/d"
                        ? "\\d{4}/\\d{1,2}/\\d{1,2}"
                        : "\\d{1,2}/\\d{1,2}/\\d{4}"
                    }
                    onChange={(event) => {
                      const v = event.target.value;
                      setDateText(v);
                      const d = parseDateForLocale(v, dateLocale);
                      change(
                        "dateOfEvent",
                        d
                          ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                          : "",
                      );
                    }}
                    labelText={`${t("nce.field.dateOfEvent")} *`}
                    placeholder={t(
                      getDatePickerPlaceholderMessage(dateLocale).id,
                    )}
                    invalid={!!errors.dateOfEvent}
                    invalidText={errors.dateOfEvent}
                  />
                </DatePicker>
                <Select
                  id="reporting-unit"
                  labelText={`${t("nce.field.reportingUnit")} *`}
                  value={form.reportingUnit}
                  onChange={(e) => change("reportingUnit", e.target.value)}
                  invalid={!!errors.reportingUnit}
                  invalidText={errors.reportingUnit}
                >
                  <SelectItem value="" text="" />
                  {metadata.value.reportingUnits.map((r) => (
                    <SelectItem key={r.id} value={r.id} text={r.name} />
                  ))}
                </Select>
              </div>,
            )}
            {section(
              "02",
              "nce.section.classification",
              <>
                <div className="nce-form-grid">
                  <Select
                    id="nce-category"
                    labelText={`${t("nce.field.category")} *`}
                    value={form.categoryId}
                    onChange={(e) => change("categoryId", e.target.value)}
                    invalid={!!errors.categoryId}
                    invalidText={errors.categoryId}
                  >
                    <SelectItem value="" text={t("nce.select.category")} />
                    {metadata.value.categories.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        text={nceOptionLabel(c, intl)}
                      />
                    ))}
                  </Select>
                  <Select
                    id="nce-type"
                    labelText={t("nce.field.subcategory")}
                    value={form.typeId}
                    onChange={(e) => change("typeId", e.target.value)}
                    disabled={!writable || !form.categoryId}
                  >
                    <SelectItem value="" text={t("nce.select.subcategory")} />
                    {types.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        text={nceOptionLabel(c, intl)}
                      />
                    ))}
                  </Select>
                </div>
                <RadioButtonGroup
                  legendText={`${t("nce.field.severity")} *`}
                  name="nce-severity"
                  valueSelected={form.severity}
                  onChange={(v) => change("severity", v)}
                  invalid={!!errors.severity}
                  invalidText={errors.severity}
                >
                  {["CRITICAL", "MAJOR", "MINOR"].map((s) => (
                    <RadioButton
                      key={s}
                      id={`nce-severity-${s}`}
                      value={s}
                      labelText={t(`nce.severity.${s.toLowerCase()}`)}
                    />
                  ))}
                </RadioButtonGroup>
              </>,
            )}
            {section(
              "03",
              "nce.section.details",
              <div className="nce-form-grid">
                <TextInput
                  id="nce-title"
                  className="nce-form-wide"
                  labelText={t("nce.field.title")}
                  value={form.title}
                  maxLength={200}
                  onChange={(e) => change("title", e.target.value)}
                />
                {[
                  "description",
                  "immediateAction",
                  "suspectedCauses",
                  "proposedAction",
                ].map((key) => (
                  <TextArea
                    key={key}
                    className={
                      key === "description" || key === "immediateAction"
                        ? "nce-form-wide"
                        : ""
                    }
                    id={`nce-${key}`}
                    labelText={`${t(`nce.field.${key}`)}${key === "description" ? " *" : ""}`}
                    value={form[key]}
                    onChange={(e) => change(key, e.target.value)}
                    rows={key === "description" ? 4 : 3}
                    maxLength={10000}
                    invalid={!!errors[key]}
                    invalidText={errors[key]}
                  />
                ))}
              </div>,
            )}
            {section(
              "04",
              "nce.section.attachments",
              <NceFileAttachment
                attachments={form.attachments}
                disabled={!writable}
                onAttachmentsChange={(v) => change("attachments", v)}
              />,
            )}
            {section(
              "05",
              "nce.section.linkSamples",
              <>
                {Object.values(links).length > 0 && (
                  <ul className="nce-linked-samples">
                    {Object.values(links).map((r) => (
                      <li key={linkedKey(r)}>
                        <span>
                          {r.labNumber} · {r.typeName || "—"} ·{" "}
                          {r.testName ||
                            `${t("nce.workspace.specimenRecord")} ${r.sampleItemId}`}
                        </span>
                        <Button
                          type="button"
                          kind="ghost"
                          size="sm"
                          disabled={!writable}
                          onClick={() => {
                            setLinks((p) => {
                              const next = { ...p };
                              delete next[linkedKey(r)];
                              return next;
                            });
                            setDirty(true);
                          }}
                        >
                          {t("nce.workspace.unlink")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {!resultRow && (
                  <div className="nce-form-grid nce-order-search">
                    <Select
                      id="search-type"
                      labelText={t("label.form.searchby")}
                      value={search.searchType}
                      onChange={(e) => editSearch("searchType", e.target.value)}
                    >
                      <SelectItem value="" text="" />
                      {[
                        ["lastName", "nce.search.byLastName"],
                        ["firstName", "nce.search.byFirstName"],
                        ["STNumber", "nce.search.byPatientId"],
                        ["labNumber", "nce.search.byLabNumber"],
                      ].map(([v, k]) => (
                        <SelectItem key={v} value={v} text={t(k)} />
                      ))}
                    </Select>
                    <TextInput
                      id="search-value"
                      labelText={t("testcalculation.label.textValue")}
                      value={search.value}
                      onChange={(e) => editSearch("value", e.target.value)}
                    />
                    <Button
                      type="button"
                      kind="tertiary"
                      onClick={() => searchOrders()}
                      disabled={!writable || searchResult.phase === "loading"}
                    >
                      {t("label.button.search")}
                    </Button>
                  </div>
                )}
                {searchResult.phase === "loading" && (
                  <p role="status">{t("nce.tree.loading")}</p>
                )}
                {searchResult.phase === "success" &&
                  !searchResult.orders.length && (
                    <p>{t("nce.workspace.ordersEmpty")}</p>
                  )}
                {searchResult.phase === "success" &&
                  searchResult.orders.map((order) => (
                    <div className="nce-order-result" key={order.sampleId}>
                      <h4>
                        {order.labNumber} ·{" "}
                        {formatPatientDisplayName(order.patient, intl.locale) ||
                          "—"}
                      </h4>
                      {order.specimens.map((s) => (
                        <div key={s.sampleItemId}>
                          <Checkbox
                            id={`nce-specimen-${s.sampleItemId}`}
                            labelText={`${s.typeName || "—"} · ${t("nce.workspace.specimenRecord")} ${s.sampleItemId}${s.externalId ? ` · ${s.externalId}` : ""}`}
                            checked={
                              !!selections[
                                linkedKey(linkedIdentity(order, s))
                              ] || !!links[linkedKey(linkedIdentity(order, s))]
                            }
                            disabled={
                              !writable ||
                              !!links[linkedKey(linkedIdentity(order, s))] ||
                              !!resultRow
                            }
                            onChange={(_, data) =>
                              pick(
                                {
                                  ...linkedIdentity(order, s),
                                  typeName: s.typeName,
                                },
                                data.checked,
                              )
                            }
                          />
                          {s.analyses.map((a) => (
                            <Checkbox
                              key={a.analysisId}
                              id={`nce-analysis-${a.analysisId}`}
                              className="nce-analysis-choice"
                              labelText={`${a.testName || "—"} · ${t("nce.workspace.analysisRecord")} ${a.analysisId}`}
                              checked={
                                !!selections[
                                  linkedKey(linkedIdentity(order, s, a))
                                ] ||
                                !!links[linkedKey(linkedIdentity(order, s, a))]
                              }
                              disabled={
                                !writable ||
                                !!links[
                                  linkedKey(linkedIdentity(order, s, a))
                                ] ||
                                !!resultRow
                              }
                              onChange={(_, data) =>
                                pick(
                                  {
                                    ...linkedIdentity(order, s, a),
                                    typeName: s.typeName,
                                    testName: a.testName,
                                  },
                                  data.checked,
                                )
                              }
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                {!resultRow && Object.keys(selections).length > 0 && (
                  <Button
                    type="button"
                    kind="tertiary"
                    onClick={linkSelected}
                    disabled={!writable}
                  >
                    {t("nce.button.linkSelected")}
                  </Button>
                )}
                {searchResult.phase === "success" &&
                  searchResult.paging?.totalResults > 10 && (
                    <Pagination
                      page={searchResult.paging.currentPage}
                      pageSize={10}
                      pageSizes={[10]}
                      totalItems={searchResult.paging.totalResults}
                      onChange={({ page }) => searchOrders(page)}
                      pageSelectLabelText={(total) =>
                        intl.formatMessage(
                          { id: "pagination.page-select" },
                          { total },
                        )
                      }
                      itemsPerPageText={t("pagination.items-per-page")}
                      backwardText={t("pagination.backward")}
                      forwardText={t("pagination.forward")}
                      pageRangeText={(_, total) =>
                        intl.formatMessage(
                          { id: "pagination.page-range" },
                          { total },
                        )
                      }
                      itemRangeText={(min, max, total) =>
                        intl.formatMessage(
                          { id: "pagination.item-range" },
                          { min, max, total },
                        )
                      }
                    />
                  )}
                {!Object.keys(links).length &&
                  searchResult.phase === "idle" && (
                    <p className="nce-helper-text">
                      {t("nce.linkSamples.helper")}
                    </p>
                  )}
              </>,
            )}
          </fieldset>
        )}
      </div>
      <div className="nce-form-actions admin-form-workspace__actions">
        <Button
          type="button"
          kind="secondary"
          disabled={busy || !!ownPending}
          onClick={onCancel}
        >
          {t("label.button.cancel")}
        </Button>
        <Button type="submit" kind="primary" disabled={!writable}>
          {busy ? t("nce.creating") : t("nce.button.submit")}
        </Button>
      </div>
    </form>
  );
};
export default ReportNonConformingEvent;
