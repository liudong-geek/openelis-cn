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
  const [names, setNames] = useState({ english: "", french: "" });
  const [original, setOriginal] = useState(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    getFromOpenElisServer(
      `/rest/EntityNamesProvider?entityId=${encodeURIComponent(record.id)}&entityName=${entity}`,
      (response) => {
        if (!active) return;
        setLoading(false);
        if (failedResponse(response) || !response.name) {
          setError(intl.formatMessage({ id: "server.error.msg" }));
          return;
        }
        const loaded = {
          english: response.name.english || "",
          french: response.name.french || "",
        };
        setNames(loaded);
        setOriginal(loaded);
      },
    );
    return () => {
      active = false;
    };
  }, [entity, record.id, intl]);
  const changed =
    original &&
    (names.english !== original.english || names.french !== original.french);
  const submit = () => {
    if (loading || saving || !changed || !names.english.trim()) return;
    setSaving(true);
    setError("");
    const contract = contracts[entity];
    postToOpenElisServerJsonResponse(
      `/rest/${contract.endpoint}`,
      JSON.stringify({
        [contract.idField]: String(record.id),
        nameEnglish: names.english.trim(),
        nameFrench: names.french.trim() || names.english.trim(),
      }),
      (response) => {
        setSaving(false);
        if (failedResponse(response)) {
          setError(intl.formatMessage({ id: "server.error.msg" }));
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
      primaryButtonDisabled={
        loading || saving || !changed || !names.english.trim()
      }
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
            labelText={intl.formatMessage({ id: "english.label" })}
            helperText={intl.formatMessage({
              id: "configuration.entityName.scope",
            })}
            value={names.english}
            disabled={saving || !original}
            required
            onChange={(event) =>
              setNames((current) => ({
                ...current,
                english: event.target.value,
              }))
            }
          />
          <Accordion>
            <AccordionItem
              title={intl.formatMessage({
                id: "configuration.entityName.translations",
              })}
            >
              <TextInput
                id="configuration-name-french"
                labelText={intl.formatMessage({
                  id: "configuration.entityName.secondary",
                })}
                value={names.french}
                disabled={saving || !original}
                onChange={(event) =>
                  setNames((current) => ({
                    ...current,
                    french: event.target.value,
                  }))
                }
              />
            </AccordionItem>
          </Accordion>
          {saving && <InlineLoading />}
        </div>
      )}
    </Modal>
  );
}
