import React, { useEffect, useState, useRef } from "react";
import {
  Accordion,
  AccordionItem,
  InlineLoading,
  InlineNotification,
  Modal,
  TextInput,
} from "@carbon/react";
import { useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import "../AdminModal.css";

const contracts = {
  panel: { endpoint: "PanelRenameEntry", idField: "panelId" },
  testSection: { endpoint: "TestSectionRenameEntry", idField: "testSectionId" },
};
const failedResponse = (response) =>
  !response ||
  response.error ||
  Number(response.status || response.statusCode || 0) >= 400;

const failureMessageId = (response, operation) => {
  const status = Number(response?.status || response?.statusCode || 0);
  if (status === 400) return "configuration.entityName.invalid";
  if (status === 404) return "configuration.entityName.notFound";
  return operation === "load"
    ? "configuration.entityName.loadFailed"
    : "configuration.entityName.saveFailed";
};

/** Edits the row's names without leaving or resetting its parent list. */
export default function ConfigurationNameEditor({
  entity,
  record,
  onClose,
  onSaved,
}) {
  const intl = useIntl();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  savingRef.current = saving;
  const [error, setError] = useState("");
  const chineseInterface = intl.locale.toLowerCase().startsWith("zh");
  const primaryName = chineseInterface ? "chinese" : "english";
  const [names, setNames] = useState({ chinese: "", english: "", french: "" });
  const [original, setOriginal] = useState(null);
  const [translationsOpen, setTranslationsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    getFromOpenElisServer(
      `/rest/EntityNamesProvider?entityId=${encodeURIComponent(record.id)}&entityName=${entity}`,
      (response) => {
        if (!active) return;
        setLoading(false);
        if (failedResponse(response) || !response.name) {
          setError(
            intl.formatMessage({ id: failureMessageId(response, "load") }),
          );
          return;
        }
        const translations = response.translations || {};
        const loaded = {
          chinese: response.translations
            ? (translations.zh ??
              translations.zh_CN ??
              translations["zh-CN"] ??
              "")
            : (response.name.chinese ?? ""),
          english: translations.en ?? response.name.english ?? "",
          french: translations.fr ?? response.name.french ?? "",
        };
        setNames(loaded);
        setOriginal(loaded);
        setTranslationsOpen(
          !loaded.french.trim() || (chineseInterface && !loaded.english.trim()),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [entity, record.id, intl, chineseInterface]);
  const changed =
    original && Object.keys(names).some((key) => names[key] !== original[key]);
  const valid =
    names.english.trim() &&
    names.french.trim() &&
    (!(chineseInterface || original?.chinese?.trim()) || names.chinese.trim());
  const submit = () => {
    if (loading || savingRef.current || !changed || !valid) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const contract = contracts[entity];
    postToOpenElisServerJsonResponse(
      `/rest/${contract.endpoint}`,
      JSON.stringify({
        [contract.idField]: String(record.id),
        nameEnglish: names.english.trim(),
        nameFrench: names.french.trim(),
        ...(names.chinese.trim() ? { nameChinese: names.chinese.trim() } : {}),
      }),
      (response) => {
        savingRef.current = false;
        setSaving(false);
        if (failedResponse(response)) {
          setError(
            intl.formatMessage({ id: failureMessageId(response, "save") }),
          );
        } else {
          onSaved();
        }
      },
    );
  };
  return (
    <Modal
      open
      size="sm"
      className="oe-admin-modal"
      preventCloseOnClickOutside
      selectorPrimaryFocus="#configuration-name"
      modalHeading={`${intl.formatMessage({ id: "button.edit" })} · ${record.name || record.value}`}
      closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
      primaryButtonText={intl.formatMessage({ id: "label.button.save" })}
      secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
      primaryButtonDisabled={loading || saving || !changed || !valid}
      onRequestSubmit={submit}
      onRequestClose={() => {
        if (!savingRef.current) onClose();
      }}
    >
      {error && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title=""
          subtitle={error}
        />
      )}
      {loading ? (
        <InlineLoading />
      ) : (
        <div className="configuration-entity-workspace__form">
          <TextInput
            id="configuration-name"
            labelText={intl.formatMessage({
              id: chineseInterface
                ? "configuration.entityName.chinese"
                : "english.label",
            })}
            helperText={intl.formatMessage({
              id: "configuration.entityName.scope",
            })}
            value={names[primaryName]}
            disabled={saving || !original}
            maxLength={255}
            required
            invalid={!!original && !names[primaryName].trim()}
            invalidText={intl.formatMessage({ id: "error.field.required" })}
            onChange={(event) =>
              setNames((current) => ({
                ...current,
                [primaryName]: event.target.value,
              }))
            }
          />
          <Accordion>
            <AccordionItem
              open={translationsOpen}
              onHeadingClick={() => setTranslationsOpen((current) => !current)}
              title={intl.formatMessage({
                id: "configuration.entityName.translations",
              })}
            >
              {(chineseInterface
                ? ["english", "french"]
                : ["chinese", "french"]
              ).map((key) => (
                <TextInput
                  key={key}
                  id={`configuration-name-${key}`}
                  labelText={intl.formatMessage({
                    id:
                      key === "english"
                        ? "english.label"
                        : key === "chinese"
                          ? "configuration.entityName.chinese"
                          : "configuration.entityName.secondary",
                  })}
                  value={names[key]}
                  disabled={saving || !original}
                  maxLength={255}
                  required={key !== "chinese" || !!original?.chinese?.trim()}
                  invalid={
                    !!original &&
                    (key !== "chinese" || !!original.chinese.trim()) &&
                    !names[key].trim()
                  }
                  invalidText={intl.formatMessage({
                    id: "error.field.required",
                  })}
                  onChange={(event) =>
                    setNames((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              ))}
            </AccordionItem>
          </Accordion>
          {saving && <InlineLoading />}
        </div>
      )}
    </Modal>
  );
}
