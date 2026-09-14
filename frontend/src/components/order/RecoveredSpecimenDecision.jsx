import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Button,
  InlineNotification,
  Select,
  SelectItem,
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Tag,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { useOrderContext } from "./OrderContext";
import { intakeOptions } from "./intakeDecision";
import { collectionMaster } from "./collectionRecovery";
import { localizeSampleType } from "./sampleTypeIntl";
import "./recovered-specimen-decision.scss";

// This records the first decision on one actual tube, never whole-order QA or
// permission to enter results. All write identities stay private in the provider.
export default function RecoveredSpecimenDecision({ result, onSaved }) {
  const intl = useIntl(),
    context = useOrderContext();
  const t = (key, values) =>
    intl.formatMessage({ id: `order.intakeDecision.${key}` }, values);
  const [selected, setSelected] = useState(""),
    [decision, setDecision] = useState(""),
    [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null),
    [preparing, setPreparing] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(null);
  const operation = useRef(null),
    mounted = useRef(true),
    sequence = useRef(0),
    sending = useRef(false);
  useLayoutEffect(
    () => () => {
      mounted.current = false;
      sequence.current++;
      operation.current?.invalidate();
    },
    [],
  );
  useEffect(() => {
    sequence.current++;
    operation.current?.invalidate();
    operation.current = null;
    setSelected("");
    setDecision("");
    setReason("");
    setPreview(null);
    setPreparing(false);
    setSent(false);
    setError(null);
  }, [result]);
  const current = result.current,
    rows = current.specimenDecisions;
  if (!rows || !current.patient || !rows.length) return null;
  const options = intakeOptions(result),
    tube = current.physicalSpecimens.find((item) => item.id === selected);
  const reasons =
    current.intakeReasons?.state === "READY" ? current.intakeReasons.items : [];
  const pending =
    context.intakeRecovery?.checkpoint ||
    context.intakeRecovery?.error ||
    context.qaRecovery?.checkpoint ||
    context.qaRecovery?.error ||
    context.receiptRecovery?.checkpoint ||
    context.receiptRecovery?.error ||
    context.collectionRecovery?.checkpoint ||
    context.collectionRecovery?.error;
  const disabled = Boolean(
    context.isSubmitting ||
    preparing ||
    sent ||
    pending ||
    (operation.current && !operation.current.isCurrent()),
  );
  const patient =
    [current.patient.lastName, current.patient.firstName]
      .filter(Boolean)
      .join("") || t("unnamed");
  const barcode = (item) => `${current.labNo}.${item.sortOrder}`;
  const type = (item) =>
    localizeSampleType(
      intl,
      collectionMaster(current, "TYPE", item.typeOfSampleId)?.name,
    ) || t("type", { id: item.typeOfSampleId });
  const time = (value) =>
    value
      ? intl.formatDate(value, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          ...(current.collectionContext?.timeZone
            ? { timeZone: current.collectionContext.timeZone }
            : {}),
        })
      : t("notReceived");
  const prepare = async () => {
    if (disabled || !tube) return;
    const ticket = ++sequence.current;
    setPreparing(true);
    setError(null);
    try {
      const op = context.prepareRecoveredIntake(result);
      operation.current?.invalidate();
      operation.current = op;
      const command = await op.preview(selected, decision, reason);
      if (mounted.current && sequence.current === ticket && op.isCurrent())
        setPreview(command);
    } catch (e) {
      if (mounted.current && sequence.current === ticket)
        setError(e?.errorKey || "order.intakeDecision.requery");
    } finally {
      if (mounted.current && sequence.current === ticket) setPreparing(false);
    }
  };
  const confirm = async () => {
    if (disabled || sending.current || !preview || !operation.current) return;
    sending.current = true;
    const op = operation.current;
    let saved = false;
    try {
      const next = await op.confirm();
      if (mounted.current && op.isCurrent()) {
        saved = true;
        setSent(true);
        onSaved(next);
      }
    } catch (e) {
      if (mounted.current)
        setError(e?.errorKey || "order.intakeDecision.unknown");
    } finally {
      sending.current = false;
      if (mounted.current && !saved) setSent(true);
    }
  };
  return (
    <section className="recovered-specimen-decision" aria-label={t("title")}>
      <header>
        <div>
          <h4>{t("title")}</h4>
          <p>{t("help")}</p>
        </div>
        <Tag type="blue">{t("scope")}</Tag>
      </header>
      <div
        className="recovered-specimen-decision__table"
        role="region"
        aria-label={t("list")}
        tabIndex={0}
      >
        <Table size="md">
          <TableHead>
            <TableRow>
              {["barcode", "sampleType", "received", "record", "action"].map(
                (k) => (
                  <TableHeader key={k}>{t(k)}</TableHeader>
                ),
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const item = current.physicalSpecimens.find(
                (v) => v.id === row.sampleItemId,
              );
              return (
                <TableRow key={row.sampleItemId}>
                  <TableCell>{barcode(item)}</TableCell>
                  <TableCell>{type(item)}</TableCell>
                  <TableCell>{time(item.receivedDate)}</TableCell>
                  <TableCell>
                    <Tag type={row.state === "RECORDED" ? "blue" : "gray"}>
                      {t(
                        row.state === "RECORDED"
                          ? row.recordedDecision
                          : row.state,
                      )}
                    </Tag>
                    {row.state === "RECORDED" && (
                      <div className="recovered-specimen-decision__signature">
                        {row.reason && <p>{row.reason.label}</p>}
                        <p>
                          {t("signature", {
                            actor: row.decidedBy,
                            time: time(row.decidedAt),
                          })}
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {selected === item.id ? (
                      <Tag type="blue">{t("selectedAction")}</Tag>
                    ) : options.some((v) => v.id === item.id) ? (
                      <Button
                        kind="ghost"
                        size="sm"
                        aria-label={t("select", { barcode: barcode(item) })}
                        disabled={disabled || Boolean(preview)}
                        onClick={() => {
                          operation.current?.invalidate();
                          operation.current = null;
                          setSelected(item.id);
                          setDecision("");
                          setReason("");
                          setPreview(null);
                          setError(null);
                        }}
                      >
                        {t("selectAction")}
                      </Button>
                    ) : (
                      t(row.state === "RECORDED" ? "readOnly" : "notReady")
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!options.length && <p>{t("noEligible")}</p>}
      {tube && (
        <div className="recovered-specimen-decision__editor">
          <h5>{t(preview ? "previewTitle" : "editTitle")}</h5>
          <dl className="recovered-specimen-decision__facts">
            <div>
              <dt>{t("patient")}</dt>
              <dd>
                {patient} · {current.patient.id}
              </dd>
            </div>
            <div>
              <dt>{t("barcode")}</dt>
              <dd>{barcode(tube)}</dd>
            </div>
            <div>
              <dt>{t("sampleType")}</dt>
              <dd>{type(tube)}</dd>
            </div>
            <div>
              <dt>{t("collected")}</dt>
              <dd>{time(tube.collectionDate)}</dd>
            </div>
            <div>
              <dt>{t("received")}</dt>
              <dd>{time(tube.receivedDate)}</dd>
            </div>
          </dl>
          {preview ? (
            <div className="recovered-specimen-decision__preview">
              <strong>{t(preview.decision)}</strong>
              {preview.reason && (
                <p>
                  {t("reasonLabel")}
                  {"："}
                  {preview.reason.label}
                </p>
              )}
              <p>{t("previewHelp")}</p>
            </div>
          ) : (
            <div className="recovered-specimen-decision__fields">
              <Select
                id="intake-decision-choice"
                labelText={t("decision")}
                value={decision}
                disabled={disabled}
                onChange={(e) => {
                  setDecision(e.target.value);
                  setReason("");
                  operation.current?.cancelPreview();
                }}
              >
                <SelectItem value="" text={t("choose")} />
                <SelectItem value="ACCEPTED" text={t("ACCEPTED")} />
                <SelectItem value="REJECTED" text={t("REJECTED")} />
              </Select>
              {decision === "REJECTED" && (
                <Select
                  id="intake-reason-choice"
                  labelText={t("reason")}
                  value={reason}
                  disabled={disabled || !reasons.length}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <SelectItem value="" text={t("chooseReason")} />
                  {reasons.map((r) => (
                    <SelectItem key={r.id} value={r.id} text={r.label} />
                  ))}
                </Select>
              )}
            </div>
          )}
          {decision === "REJECTED" && !reasons.length && (
            <InlineNotification
              kind="warning"
              hideCloseButton
              title={t("noReasons")}
            />
          )}
          <div className="recovered-specimen-decision__actions">
            {preview ? (
              <>
                <Button
                  kind="secondary"
                  disabled={disabled}
                  onClick={() => {
                    operation.current?.cancelPreview();
                    setPreview(null);
                  }}
                >
                  {t("back")}
                </Button>
                <Button
                  kind={preview.decision === "REJECTED" ? "danger" : "primary"}
                  dangerDescription=""
                  disabled={disabled}
                  onClick={confirm}
                >
                  {t(context.isSubmitting ? "checking" : "confirm")}
                </Button>
              </>
            ) : (
              <Button
                disabled={
                  disabled || !decision || (decision === "REJECTED" && !reason)
                }
                onClick={prepare}
              >
                {t(preparing ? "preparing" : "preview")}
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <InlineNotification
          kind="warning"
          hideCloseButton
          title={intl.formatMessage({ id: error })}
        />
      )}
      <p className="recovered-specimen-decision__boundary">{t("boundary")}</p>
    </section>
  );
}
