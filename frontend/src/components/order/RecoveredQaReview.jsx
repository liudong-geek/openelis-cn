import React, { useEffect, useRef, useState } from "react";
import { Button, Checkbox, InlineNotification, Tag } from "@carbon/react";
import { useIntl } from "react-intl";
import { useOrderContext } from "./OrderContext";
import { qaCanConfirm } from "./qaConfirmation";
import { collectionMaster } from "./collectionRecovery";
import { localizeSampleType } from "./sampleTypeIntl";
import "./recovered-qa-review.scss";

export default function RecoveredQaReview({ result, onSaved }) {
  const intl = useIntl(),
    context = useOrderContext();
  // i18n-keys: order.qaReview.*
  const t = (key, values) =>
    intl.formatMessage({ id: `order.qaReview.${key}` }, values);
  const [checked, setChecked] = useState([]),
    [preview, setPreview] = useState(false),
    [error, setError] = useState(null);
  const [sent, setSent] = useState(false),
    [operation, setOperation] = useState(null);
  const mounted = useRef(true),
    sending = useRef(false),
    operationRef = useRef(null);
  useEffect(
    () => () => {
      mounted.current = false;
      operationRef.current?.invalidate();
    },
    [],
  );
  useEffect(() => {
    operationRef.current?.invalidate();
    operationRef.current = null;
    setOperation(null);
    setChecked([]);
    setPreview(false);
    setSent(false);
    setError(null);
  }, [result]);
  const review = result.current.qaReview;
  if (!review) return null;
  const matched = review.state === "MATCHED_CONFIRMATION";
  const canConfirm = qaCanConfirm(result);
  const disabled =
    context.isSubmitting ||
    sent ||
    context.qaRecovery?.checkpoint ||
    context.qaRecovery?.error ||
    (operation && !operation.isCurrent());
  const time = (value) =>
    intl.formatDate(value, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(result.current.collectionContext?.timeZone
        ? { timeZone: result.current.collectionContext.timeZone }
        : {}),
    });
  const prepare = () => {
    try {
      const op = context.prepareRecoveredQa(result);
      operationRef.current?.invalidate();
      operationRef.current = op;
      op.preview(checked);
      setOperation(op);
      setPreview(true);
      setError(null);
    } catch (e) {
      setError(e.errorKey || "order.qaReview.requery");
    }
  };
  const confirm = async () => {
    if (disabled || sending.current || !operation) return;
    sending.current = true;
    try {
      const next = await operation.confirm();
      if (mounted.current && operation.isCurrent()) onSaved(next);
    } catch (e) {
      if (mounted.current) setError(e.errorKey || "order.qaReview.unknown");
    } finally {
      sending.current = false;
      if (mounted.current) setSent(true);
    }
  };
  return (
    <section className="recovered-qa-review" aria-label={t("title")}>
      <header>
        <div>
          <h4>{t("title")}</h4>
          <p>{t("help")}</p>
        </div>
        <Tag type={matched ? "green" : canConfirm ? "blue" : "gray"}>
          {t(matched ? "matched" : canConfirm ? "pending" : "blockedTitle")}
        </Tag>
      </header>
      {review.state === "STALE_CONFIRMATION" && (
        <InlineNotification kind="warning" hideCloseButton title={t("stale")} />
      )}
      {!matched && !canConfirm && (
        <InlineNotification
          kind="warning"
          hideCloseButton
          title={t("blocked")}
          subtitle={review.reason || t("invalid")}
        />
      )}
      {(matched || canConfirm) && (
        <>
          <div className="recovered-qa-review__identity">
            <strong>
              {t("application", { number: result.current.labNo })}
            </strong>
            <span>{t("count", { count: review.specimenIds.length })}</span>
          </div>
          <div className="recovered-qa-review__tubes">
            {review.specimenIds.map((id) => {
              const tube = result.current.physicalSpecimens.find(
                (t) => t.id === id,
              );
              return (
                <div className="recovered-qa-review__tube" key={id}>
                  <strong>{`${result.current.labNo}.${tube.sortOrder}`}</strong>
                  <span>
                    {localizeSampleType(
                      intl,
                      collectionMaster(
                        result.current,
                        "TYPE",
                        tube.typeOfSampleId,
                      )?.name,
                    ) || t("typeId", { id: tube.typeOfSampleId })}
                  </span>
                  <span>
                    {t("received", {
                      time: tube.receivedDate
                        ? time(tube.receivedDate)
                        : t("missingReceipt"),
                    })}
                  </span>
                </div>
              );
            })}
          </div>
          {(preview || matched) && (
            <ul
              className="recovered-qa-review__verified"
              aria-label={t("checklist")}
            >
              {review.checklistItems.map((item) => (
                <li key={item.key}>
                  <span aria-hidden="true">✓</span>
                  {item.label}
                </li>
              ))}
            </ul>
          )}
          {matched ? (
            <InlineNotification
              kind="success"
              hideCloseButton
              title={t("saved")}
              subtitle={t("reviewedAt", { time: time(review.reviewedAt) })}
            />
          ) : (
            <>
              {!preview && (
                <fieldset
                  className="recovered-qa-review__checklist"
                  disabled={Boolean(disabled)}
                >
                  <legend>{t("checklist")}</legend>
                  {review.checklistItems.map((item, index) => (
                    <Checkbox
                      key={item.key}
                      id={`qa-current-check-${index}`}
                      labelText={item.label}
                      checked={checked.includes(item.key)}
                      onChange={(_, { checked: value }) =>
                        setChecked((old) =>
                          value
                            ? [...old.filter((k) => k !== item.key), item.key]
                            : old.filter((k) => k !== item.key),
                        )
                      }
                    />
                  ))}
                </fieldset>
              )}
              {preview && (
                <div className="recovered-qa-review__preview">
                  <strong>
                    {t("previewTitle", { count: review.specimenIds.length })}
                  </strong>
                  <p>{t("previewHelp")}</p>
                </div>
              )}
              {error && (
                <InlineNotification
                  kind="warning"
                  hideCloseButton
                  title={intl.formatMessage({ id: error })}
                />
              )}
              <div className="recovered-qa-review__actions">
                {preview ? (
                  <>
                    <Button
                      kind="secondary"
                      disabled={Boolean(disabled)}
                      onClick={() => {
                        operation.cancelPreview();
                        setPreview(false);
                      }}
                    >
                      {t("back")}
                    </Button>
                    <Button disabled={Boolean(disabled)} onClick={confirm}>
                      {t(context.isSubmitting ? "checking" : "confirm")}
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={
                      Boolean(disabled) ||
                      checked.length !== review.checklistItems.length
                    }
                    onClick={prepare}
                  >
                    {t("preview")}
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
      <p className="recovered-qa-review__boundary">{t("boundary")}</p>
    </section>
  );
}
