import React, { useRef, useState } from "react";
import { Button, Checkbox, InlineNotification, TextInput } from "@carbon/react";
import { useIntl } from "react-intl";
import { useOrderContext } from "./OrderContext";
import {
  collectionMaster,
  collectionRecoveryOptions,
} from "./collectionRecovery";
import { localizeSampleType } from "./sampleTypeIntl";

export default function RecoveredCollectionEditor({ result, onSaved }) {
  const intl = useIntl();
  const t = (name, values) =>
    intl.formatMessage({ id: `order.collectionRecovery.${name}` }, values);
  const {
    adoptRecoveredCollection,
    saveRecoveredCollection,
    isSubmitting,
    isRecoveryCurrent,
  } = useOrderContext();
  const [adopted, setAdopted] = useState(null);
  const [rows, setRows] = useState({});
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const dispatching = useRef(false);
  const current = result.current;
  const options = collectionRecoveryOptions(result);
  if (!adoptRecoveredCollection || !saveRecoveredCollection) return null;
  const confirm = () => {
    try {
      const snapshot = adoptRecoveredCollection(result);
      setAdopted(snapshot);
      const clock = snapshot.current.collectionContext.laboratoryNow;
      setRows(
        Object.fromEntries(
          options.map((row) => [
            row.id,
            {
              requestId: row.id,
              selected: false,
              date: clock.slice(0, 10),
              time: clock.slice(11),
              quantity: String(row.requestedQuantity),
              collector: "",
            },
          ]),
        ),
      );
      setError(null);
    } catch (failure) {
      setError(failure.errorKey || "order.collectionRecovery.requery");
    }
  };
  const selected = Object.values(rows).filter((row) => row.selected);
  const update = (id, key, value) =>
    setRows((previous) => ({
      ...previous,
      [id]: { ...previous[id], [key]: value },
    }));
  const save = async () => {
    if (dispatching.current || sent || isSubmitting) return;
    dispatching.current = true;
    setError(null);
    try {
      const next = await saveRecoveredCollection(adopted, selected);
      if (isRecoveryCurrent()) {
        setSent(true);
        onSaved(next);
      }
    } catch (failure) {
      if (isRecoveryCurrent()) {
        setError(failure.errorKey || "order.collectionRecovery.unknown");
        // Validation fails before dispatch, and can be corrected in this form.
        if (failure.errorKey !== "order.collectionRecovery.invalid")
          setSent(true);
      }
    } finally {
      dispatching.current = false;
    }
  };
  return (
    <section className="recovered-collection" aria-label={t("title")}>
      <h4>{t("title")}</h4>
      <p>{t("scope")}</p>
      {error && (
        <InlineNotification
          hideCloseButton
          kind="warning"
          title={intl.formatMessage({ id: error })}
        />
      )}
      {!adopted ? (
        <>
          <p>{t("available", { count: options.length })}</p>
          {options.length ? (
            <Button size="md" disabled={isSubmitting} onClick={confirm}>
              {t("adopt")}
            </Button>
          ) : (
            <InlineNotification
              hideCloseButton
              kind="info"
              title={t("unavailable")}
            />
          )}
        </>
      ) : (
        <>
          <p>
            {t("clock", {
              zone:
                new Intl.DateTimeFormat("zh-CN", {
                  timeZone: current.collectionContext.timeZone,
                  timeZoneName: "long",
                })
                  .formatToParts(new Date())
                  .find((part) => part.type === "timeZoneName")?.value ||
                current.collectionContext.timeZone,
            })}
          </p>
          <p>
            {t(
              current.collectionContext.consentGiven === true
                ? "consentYes"
                : current.collectionContext.consentGiven === false
                  ? "consentNo"
                  : "consentUnknown",
            )}
          </p>
          {options.map((request) => {
            const row = rows[request.id];
            const number =
              current.requestedSpecimens.findIndex((r) => r.id === request.id) +
              1;
            const disabled = isSubmitting || sent || !row?.selected;
            return (
              <fieldset
                className="recovered-collection__tube"
                key={request.id}
                disabled={isSubmitting || sent}
              >
                <legend>
                  {t("tube", { number })} ·{" "}
                  {localizeSampleType(
                    intl,
                    collectionMaster(current, "TYPE", request.typeOfSampleId)
                      ?.name,
                  )}
                </legend>
                <p>
                  {request.testIds
                    .map((id) => collectionMaster(current, "TEST", id)?.name)
                    .join("、")}
                </p>
                <Checkbox
                  id={`collect-select-${request.id}`}
                  aria-label={t("select", { number })}
                  labelText={t("select", { number })}
                  checked={Boolean(row?.selected)}
                  onChange={(_, { checked }) =>
                    update(request.id, "selected", checked)
                  }
                  disabled={isSubmitting || sent}
                />
                <div className="recovered-collection__fields">
                  <TextInput
                    id={`collect-date-${request.id}`}
                    type="text"
                    maxLength={10}
                    placeholder={t("dateFormat")}
                    helperText={t("dateFormat")}
                    labelText={t("date")}
                    value={row?.date || ""}
                    disabled={disabled}
                    onChange={(e) => update(request.id, "date", e.target.value)}
                  />
                  <TextInput
                    id={`collect-time-${request.id}`}
                    type="text"
                    maxLength={5}
                    placeholder={t("timeFormat")}
                    helperText={t("timeFormat")}
                    labelText={t("time")}
                    value={row?.time || ""}
                    disabled={disabled}
                    onChange={(e) => update(request.id, "time", e.target.value)}
                  />
                  <TextInput
                    id={`collect-person-${request.id}`}
                    labelText={t("collector")}
                    value={row?.collector || ""}
                    maxLength={64}
                    disabled={disabled}
                    onChange={(e) =>
                      update(request.id, "collector", e.target.value)
                    }
                  />
                  <TextInput
                    id={`collect-quantity-${request.id}`}
                    inputMode="decimal"
                    labelText={t("quantity", {
                      unit:
                        collectionMaster(
                          current,
                          "UNIT",
                          request.unitOfMeasureId,
                        )?.name || t("noUnit"),
                    })}
                    value={row?.quantity || ""}
                    disabled={disabled}
                    onChange={(e) =>
                      update(request.id, "quantity", e.target.value)
                    }
                  />
                </div>
              </fieldset>
            );
          })}
          <div className="recovered-collection__actions">
            <span>{t("selected", { count: selected.length })}</span>
            <Button
              size="md"
              disabled={
                isSubmitting ||
                sent ||
                !selected.length ||
                selected.some((row) => !row.collector.trim())
              }
              onClick={save}
            >
              {t("save")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
