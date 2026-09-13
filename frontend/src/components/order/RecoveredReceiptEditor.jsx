import React, { useEffect, useRef, useState } from "react";
import { Button, Checkbox, InlineNotification } from "@carbon/react";
import { useIntl } from "react-intl";
import { useOrderContext } from "./OrderContext";
import { receiptOptions } from "./specimenReceipt";
import { localizeSampleType } from "./sampleTypeIntl";
import "./recovered-receipt.scss";

export default function RecoveredReceiptEditor({ result, onSaved }) {
  const intl = useIntl(),
    context = useOrderContext();
  const [operation, setOperation] = useState(null),
    [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null),
    [error, setError] = useState(null),
    [sent, setSent] = useState(false);
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
  const t = (key, values) =>
    intl.formatMessage({ id: `order.receiving.${key}` }, values);
  const options = receiptOptions(result);
  const timeZone = result.current.collectionContext?.timeZone;
  const time = (value) =>
    intl.formatDate(value, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone,
    });
  const blocked =
    context.isSubmitting ||
    sent ||
    Boolean(
      context.receiptRecovery?.checkpoint || context.receiptRecovery?.error,
    );
  const perform = (action) => {
    try {
      action();
      setError(null);
    } catch (failure) {
      setError(failure.errorKey || "order.receiving.requery");
    }
  };
  if (!context.prepareRecoveredReceipt || !options.length) return null;
  return (
    <section className="recovered-receipt" aria-label={t("title")}>
      <h4>{t("title")}</h4>
      <p>{t("help")}</p>
      {!operation ? (
        <Button
          kind="tertiary"
          disabled={blocked}
          onClick={() =>
            perform(() => {
              const next = context.prepareRecoveredReceipt(result);
              operationRef.current = next;
              setOperation(next);
            })
          }
        >
          {t("open")}
        </Button>
      ) : (
        <>
          {!operation.isCurrent() && (
            <InlineNotification
              kind="warning"
              hideCloseButton
              title={t("requery")}
            />
          )}
          <div className="recovered-receipt__tubes">
            {options
              .filter((row) => !preview || selected.includes(row.requestId))
              .map((row) => (
                <div className="recovered-receipt__tube" key={row.requestId}>
                  {preview ? (
                    <strong>{t("tubeCode", { barcode: row.barcode })}</strong>
                  ) : (
                    <Checkbox
                      id={`receive-${row.requestId}`}
                      labelText={t("select", { barcode: row.barcode })}
                      checked={selected.includes(row.requestId)}
                      disabled={
                        blocked || Boolean(preview) || !operation.isCurrent()
                      }
                      onChange={(_, { checked }) =>
                        setSelected((rows) =>
                          checked
                            ? [...rows, row.requestId]
                            : rows.filter((id) => id !== row.requestId),
                        )
                      }
                    />
                  )}
                  <dl>
                    <div>
                      <dt>{t("type")}</dt>
                      <dd>{localizeSampleType(intl, row.typeName)}</dd>
                    </div>
                    <div>
                      <dt>{t("collected")}</dt>
                      <dd>{time(row.collectionDate)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
          </div>
          {preview && (
            <div className="recovered-receipt__confirmation">
              <strong>{t("count", { count: preview.tubes.length })}</strong>
              <p>
                {t("at", {
                  time: time(preview.tubes[0].receivedDate),
                  zone:
                    new Intl.DateTimeFormat(intl.locale, {
                      timeZone,
                      timeZoneName: "long",
                    })
                      .formatToParts(new Date(preview.tubes[0].receivedDate))
                      .find((part) => part.type === "timeZoneName")?.value ||
                    timeZone,
                })}
              </p>
              <p>{t("clockNotice")}</p>
            </div>
          )}
          <div className="recovered-receipt__actions">
            {preview ? (
              <>
                <Button
                  kind="secondary"
                  disabled={blocked}
                  onClick={() => {
                    operation.cancelPreview();
                    setPreview(null);
                  }}
                >
                  {t("back")}
                </Button>
                <Button
                  disabled={blocked || !operation.isCurrent()}
                  onClick={async () => {
                    if (sending.current || blocked) return;
                    sending.current = true;
                    setError(null);
                    try {
                      const next = await operation.confirm();
                      if (mounted.current && operation.isCurrent())
                        onSaved(next);
                    } catch (failure) {
                      if (mounted.current)
                        setError(failure.errorKey || "order.receiving.unknown");
                    } finally {
                      if (mounted.current) setSent(true);
                      sending.current = false;
                    }
                  }}
                >
                  {t("confirm")}
                </Button>
              </>
            ) : (
              <Button
                disabled={blocked || !selected.length || !operation.isCurrent()}
                onClick={() =>
                  perform(() => setPreview(operation.preview(selected)))
                }
              >
                {t("preview")}
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <InlineNotification
          kind="warning"
          hideCloseButton
          title={intl.formatMessage({ id: error })}
        />
      )}
    </section>
  );
}
