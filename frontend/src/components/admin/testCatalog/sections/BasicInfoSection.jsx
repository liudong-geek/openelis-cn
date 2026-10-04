import React, { useContext, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import {
  Stack,
  TextInput,
  TextArea,
  RadioButtonGroup,
  RadioButton,
  Toggle,
  Button,
  ComboBox,
  FilterableMultiSelect,
  Loading,
  InlineNotification,
  Modal,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@carbon/react";
import Tag from "../../../common/LocalizedTag";
import { FormattedMessage, useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
  postToOpenElisServerJsonResponse,
  putToOpenElisServer,
  putToOpenElisServerFullResponse,
} from "../../../utils/Utils";
import { NotificationContext } from "../../../layout/Layout";
import useDomains from "../../../common/useDomains";
import ActivationAckModal from "./ActivationAckModal";
import "../../AdminModal.css";

/**
 * OGC-949 / OGC-1112 — Basic Info section.
 *
 * Edits Domain / AMR / status plus (OGC-1112 dependency 8) the Code and
 * Description; the display name is edited in the Localization section. When
 * opened as `testId === "new"` it renders a blank create form (FR-2): Name,
 * Reporting name, Code (auto-suggested), Lab Unit, Sample type, Domain, toggles,
 * Description — Save creates the test Inactive (FR-3) and lands on its editor.
 */
// OGC-1145 FR-3 (D-030 domain guard). Since the OGC-296 domain migration a
// sample type's domain is the enum value (CLINICAL/ENVIRONMENTAL/VECTOR), but
// legacy one-character codes (sample_domain: H uman / N ewborn / E nvironmental
// / A nimal) can still arrive from un-migrated or plugin-inserted rows, so we
// normalize before comparing — the single mirror of the backend
// SampleTypeDomainMapper. Unknown/blank domains stay offerable everywhere so
// legacy data never blocks the editor.
const normalizeSampleDomain = (raw) => {
  if (!raw) {
    return null;
  }
  switch (String(raw).trim().toUpperCase()) {
    case "E":
    case "ENVIRONMENTAL":
      return "ENVIRONMENTAL";
    case "A":
    case "VECTOR":
      return "VECTOR";
    case "H":
    case "N":
    case "CLINICAL":
      return "CLINICAL";
    default:
      return null;
  }
};

const sampleTypeMatchesDomain = (type, domain) => {
  if (!domain || !type?.domain) {
    return true;
  }
  const normalized = normalizeSampleDomain(type.domain);
  return normalized === null || normalized === domain;
};

// The modal needs the complete basic-info DTO. The older list projection
// must not become an editable record by filling missing fields with defaults.
const completeBasicInfo = (record, id) => {
  if (!record || typeof record !== "object" || Array.isArray(record))
    return false;
  const has = (key) => Object.prototype.hasOwnProperty.call(record, key);
  const nullableString = (key) =>
    has(key) && (record[key] === null || typeof record[key] === "string");
  return (
    typeof record.testId === "string" &&
    record.testId.trim() !== "" &&
    record.testId === String(id) &&
    typeof record.name === "string" &&
    nullableString("code") &&
    nullableString("description") &&
    nullableString("labUnitId") &&
    nullableString("domain") &&
    Array.isArray(record.sampleTypeIds) &&
    record.sampleTypeIds.every(
      (value) => typeof value === "string" && value.trim() !== "",
    ) &&
    ["antimicrobialResistance", "active", "orderable"].every(
      (key) => has(key) && typeof record[key] === "boolean",
    )
  );
};

const BasicInfoSection = ({
  testId,
  embedded = false,
  onCreated,
  onCancel,
  onSaved,
  onConfigure,
}) => {
  const domains = useDomains();
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const base = location.pathname.startsWith("/admin")
    ? "/admin"
    : "/MasterListsPage";
  const isCreate = testId === "new";
  const notificationContext = useContext(NotificationContext) || {};
  const addNotification = notificationContext.addNotification || (() => {});
  const setNotificationVisible =
    notificationContext.setNotificationVisible || (() => {});

  const [loading, setLoading] = useState(!isCreate);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [referenceError, setReferenceError] = useState(false);
  const [referencesLoaded, setReferencesLoaded] = useState({
    lab: false,
    samples: false,
  });
  const [saveError, setSaveError] = useState(null);
  const [verificationPayload, setVerificationPayload] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const originalForm = useRef(null);
  const submitLock = useRef(false);
  const closeRequest = useRef(() => false);
  const editFieldsElement = useRef(null);
  const [referenceRevision, setReferenceRevision] = useState(0);
  const requestVersion = useRef(0);
  const modalEdit = embedded && !isCreate;
  const editablePayload = (record) => ({
    code: record.code || "",
    description: record.description || "",
    labUnitId: record.labUnitId || "",
    sampleTypeIds: [...(record.sampleTypeIds || [])],
    domain: record.domain,
    antimicrobialResistance: !!record.antimicrobialResistance,
    orderable: !!record.orderable,
  });
  const [form, setForm] = useState(null);
  const [pendingDomain, setPendingDomain] = useState(null);
  const [domainRadioKey, setDomainRadioKey] = useState(0);
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [coverageReport, setCoverageReport] = useState(null);
  // FR-57/FR-58 — the completeness checklist returned (422) when activation is
  // refused because the test isn't in an activatable state.
  const [completenessReport, setCompletenessReport] = useState(null);
  // FR-58 — the same gaps, fetched proactively on load, shown as a persistent
  // checklist beside the status toggle for an inactive test.
  const [completenessGaps, setCompletenessGaps] = useState([]);

  // Create-mode state (FR-2).
  const [createForm, setCreateForm] = useState({
    name: "",
    reportingName: "",
    code: "",
    labUnitId: "",
    sampleTypeIds: [],
    domain: "CLINICAL",
    antimicrobialResistance: false,
    orderable: false,
    description: "",
  });
  const [codeEdited, setCodeEdited] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [labUnits, setLabUnits] = useState([]);
  const [sampleTypes, setSampleTypes] = useState([]);

  const translateMultiSelect = (messageId) => {
    switch (messageId) {
      case "clear.all":
      case "clear.selection":
        return intl.formatMessage({ id: "label.button.clear" });
      case "close.menu":
        return intl.formatMessage({ id: "label.button.close" });
      case "open.menu":
        return intl.formatMessage({ id: "carbon.open.menu" });
      default:
        return messageId;
    }
  };

  const cancelDomainChange = () => {
    setPendingDomain(null);
    setDomainRadioKey((k) => k + 1);
  };

  useEffect(() => {
    const version = ++requestVersion.current;
    if (isCreate) return;
    setLoading(true);
    setError(false);
    setSaveError(null);
    setVerificationPayload(null);
    setForm(null);
    setConfirmDiscard(false);
    originalForm.current = null;
    submitLock.current = false;
    setSaving(false);
    getFromOpenElisServer(
      `/rest/test-catalog/tests/${testId}/basic-info`,
      (res) => {
        if (version !== requestVersion.current) return;
        setLoading(false);
        if (
          modalEdit
            ? !completeBasicInfo(res, testId)
            : !res ||
              typeof res.name !== "string" ||
              !Array.isArray(res.sampleTypeIds)
        ) {
          setError(true);
          return;
        }
        originalForm.current = editablePayload(res);
        setForm(res);
      },
    );
    if (!modalEdit) {
      getFromOpenElisServer(
        `/rest/test-catalog/tests/${testId}/completeness`,
        (res) => {
          if (
            version === requestVersion.current &&
            res &&
            Array.isArray(res.messages)
          ) {
            setCompletenessGaps(res.messages);
          }
        },
      );
    }
    return () => {
      requestVersion.current++;
    };
  }, [testId, isCreate, modalEdit, loadRevision]);

  useEffect(() => {
    let disposed = false;
    setReferenceError(false);
    setReferencesLoaded({ lab: false, samples: false });
    getFromOpenElisServer("/rest/test-catalog/lab-units", (res) => {
      if (disposed) return;
      if (!Array.isArray(res)) {
        setReferenceError(true);
        return;
      }
      setLabUnits(res);
      setReferencesLoaded((value) => ({ ...value, lab: true }));
    });
    getFromOpenElisServer("/rest/test-catalog/sample-types", (res) => {
      if (disposed) return;
      if (!Array.isArray(res)) {
        setReferenceError(true);
        return;
      }
      setSampleTypes(res);
      setReferencesLoaded((value) => ({ ...value, samples: true }));
    });
    return () => {
      disposed = true;
    };
  }, [loadRevision, referenceRevision]);

  const dirty =
    form &&
    originalForm.current &&
    JSON.stringify(editablePayload(form)) !==
      JSON.stringify(originalForm.current);
  const referenceIdentityMissing =
    modalEdit &&
    originalForm.current &&
    referencesLoaded.lab &&
    referencesLoaded.samples &&
    ((originalForm.current.labUnitId &&
      !labUnits.some(
        (item) => String(item.id) === String(originalForm.current.labUnitId),
      )) ||
      originalForm.current.sampleTypeIds.some(
        (id) => !sampleTypes.some((item) => String(item.id) === String(id)),
      ));
  closeRequest.current = (event) => {
    // Carbon handles Escape at document capture. Close an expanded list box
    // first through its own trigger so it retains its selection and focus.
    if (event?.key === "Escape") {
      const trigger = editFieldsElement.current?.querySelector(
        "button.cds--list-box__menu-icon--open",
      );
      if (trigger) {
        trigger.click();
        return false;
      }
    }
    if (submitLock.current || pendingDomain) return false;
    if (dirty) setConfirmDiscard(true);
    else onCancel?.();
    return false;
  };
  const requestClose = (event) => closeRequest.current(event);
  const editModal = (children) => (
    <ComposedModal
      open
      className="oe-admin-modal test-catalog-basic-modal"
      size="lg"
      preventCloseOnClickOutside
      onClose={requestClose}
    >
      <ModalHeader
        title={intl.formatMessage({
          id: confirmDiscard
            ? "workspace.leave.title"
            : "admin.basicEdit.catalogTitle",
        })}
        closeModal={requestClose}
        iconDescription={intl.formatMessage({ id: "button.close" })}
      />
      <ModalBody>
        {confirmDiscard ? (
          <p>{intl.formatMessage({ id: "workspace.leave.helper" })}</p>
        ) : (
          children
        )}
      </ModalBody>
      <ModalFooter>
        {confirmDiscard ? (
          <>
            <Button kind="secondary" onClick={() => setConfirmDiscard(false)}>
              {intl.formatMessage({ id: "workspace.leave.cancel" })}
            </Button>
            <Button
              kind="danger"
              dangerDescription={intl.formatMessage({
                id: "workspace.leave.title",
              })}
              onClick={() => onCancel?.()}
            >
              {intl.formatMessage({ id: "workspace.leave.confirm" })}
            </Button>
          </>
        ) : (
          <>
            <Button kind="secondary" disabled={saving} onClick={requestClose}>
              {intl.formatMessage({ id: "button.cancel" })}
            </Button>
            {verificationPayload ? (
              <Button
                kind="primary"
                disabled={saving}
                onClick={retryVerification}
              >
                {intl.formatMessage({ id: "button.retry" })}
              </Button>
            ) : (
              <Button
                kind="primary"
                disabled={
                  saving ||
                  loading ||
                  error ||
                  !form ||
                  !dirty ||
                  referenceError ||
                  !referencesLoaded.lab ||
                  !referencesLoaded.samples ||
                  referenceIdentityMissing ||
                  editSampleTypesMissing ||
                  editIncompatibleTypes.length > 0
                }
                onClick={handleSave}
              >
                {intl.formatMessage({
                  id: saving ? "label.button.saving" : "label.button.save",
                })}
              </Button>
            )}
          </>
        )}
      </ModalFooter>
    </ComposedModal>
  );

  const update = (patch) => {
    if (modalEdit && (submitLock.current || verificationPayload)) return;
    setSaveError(null);
    setForm((prev) => ({ ...prev, ...patch }));
  };
  const updateCreate = (patch) =>
    setCreateForm((prev) => ({ ...prev, ...patch }));

  // OGC-1145 FR-1/2/3 — shared sample-types multi-select with removable chips.
  // Only domain-compatible types are offered; already-selected incompatible ones
  // (a domain switch) stay visible as red chips so the manager can remove them.
  const renderSampleTypesControl = (
    idPrefix,
    selectedIds,
    domain,
    onChange,
  ) => {
    const offered = sampleTypes.filter(
      (t) => sampleTypeMatchesDomain(t, domain) || selectedIds.includes(t.id),
    );
    const selectedItems = selectedIds
      .map((id) => sampleTypes.find((t) => t.id === id))
      .filter(Boolean);
    return (
      <div>
        <FilterableMultiSelect
          id={`${idPrefix}-sample-types`}
          titleText={intl.formatMessage({
            id: "label.testCatalog.basicInfo.sampleTypes",
          })}
          helperText={intl.formatMessage({
            id: "helper.testCatalog.basicInfo.sampleTypesMulti",
          })}
          placeholder={intl.formatMessage({
            id: "label.testCatalog.specimenType",
          })}
          clearSelectionDescription={intl.formatMessage({
            id: "carbon.multiselect.totalSelected",
          })}
          clearSelectionText={intl.formatMessage({
            id: "carbon.multiselect.clearSelection",
          })}
          translateWithId={translateMultiSelect}
          locale={intl.locale}
          items={offered}
          itemToString={(item) => (item ? item.name : "")}
          selectedItems={selectedItems}
          onChange={({ selectedItems: items }) =>
            onChange((items || []).map((t) => t.id))
          }
        />
        {selectedItems.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            {selectedItems.map((t) => (
              <Tag
                key={t.id}
                type={sampleTypeMatchesDomain(t, domain) ? "blue" : "red"}
                filter
                onClose={() =>
                  onChange(selectedIds.filter((id) => id !== t.id))
                }
                title={intl.formatMessage({ id: "label.button.remove" })}
              >
                {t.name}
              </Tag>
            ))}
          </div>
        )}
      </div>
    );
  };

  const editSampleTypeIds = form?.sampleTypeIds || [];
  const editIncompatibleTypes = form
    ? editSampleTypeIds
        .map((id) => sampleTypes.find((t) => t.id === id))
        .filter((t) => t && !sampleTypeMatchesDomain(t, form.domain))
    : [];
  const editSampleTypesMissing = form
    ? editSampleTypeIds.length === 0 && (!!form.active || !!form.orderable)
    : false;

  // ── Create (FR-2/FR-3/FR-4) ───────────────────────────────────────────────

  const createValid =
    createForm.name.trim() &&
    createForm.reportingName.trim() &&
    createForm.code.trim() &&
    createForm.sampleTypeIds.length > 0 &&
    createForm.domain;

  const handleCreate = () => {
    if (!createValid) {
      return;
    }
    setSaving(true);
    setCodeError(false);
    // The create endpoint expects `amr` (not `antimicrobialResistance`); map the
    // form's field names to the request body.
    const payload = {
      name: createForm.name,
      reportingName: createForm.reportingName,
      code: createForm.code,
      labUnitId: createForm.labUnitId,
      sampleTypeIds: createForm.sampleTypeIds,
      domain: createForm.domain,
      amr: createForm.antimicrobialResistance,
      orderable: createForm.orderable,
      description: createForm.description,
    };
    postToOpenElisServerFullResponse(
      "/rest/test-catalog/tests",
      JSON.stringify(payload),
      (response) => {
        setSaving(false);
        if (response && response.status === 201) {
          response.json().then((created) => {
            setNotificationVisible(true);
            addNotification({
              kind: "success",
              title: intl.formatMessage({
                id: "label.testCatalog.section.basic-info",
              }),
              message: intl.formatMessage(
                { id: "notification.testCatalog.testCreated" },
                { name: createForm.name },
              ),
            });
            if (onCreated) {
              onCreated(created);
            } else {
              history.push(
                `${base}/TestCatalogEditor/${created.testId}/basic-info`,
              );
            }
          });
        } else if (response && response.status === 409) {
          setCodeError(true);
        } else {
          setNotificationVisible(true);
          addNotification({
            kind: "error",
            title: intl.formatMessage({ id: "error.title" }),
            message: intl.formatMessage({ id: "server.error.msg" }),
          });
        }
      },
    );
  };

  const matchesEditablePayload = (record, payload) => {
    const current = editablePayload(record);
    // Associated sample types are a membership set; display order is managed
    // separately. Preserve every ID while ignoring the backend read order.
    const ids = (values) => [...new Set(values)].sort();
    return (
      JSON.stringify({
        ...current,
        sampleTypeIds: ids(current.sampleTypeIds),
      }) ===
      JSON.stringify({ ...payload, sampleTypeIds: ids(payload.sampleTypeIds) })
    );
  };
  const confirmSaved = (record, version) => {
    if (version !== requestVersion.current) return;
    originalForm.current = editablePayload(record);
    setForm(record);
    setVerificationPayload(null);
    setSaveError(null);
    setNotificationVisible(true);
    addNotification({
      kind: "success",
      title: intl.formatMessage({ id: "label.testCatalog.section.basic-info" }),
      message: intl.formatMessage({ id: "label.testCatalog.basicInfo.saved" }),
    });
    onSaved?.();
  };
  const verifyUpdate = async (payload, version) => {
    const record = await new Promise((resolve) =>
      getFromOpenElisServer(
        `/rest/test-catalog/tests/${encodeURIComponent(testId)}/basic-info`,
        resolve,
      ),
    );
    if (version !== requestVersion.current) return;
    if (!completeBasicInfo(record, testId)) {
      setSaveError("admin.basicEdit.update.verificationFailed");
      return;
    }
    if (!matchesEditablePayload(record, payload)) {
      setVerificationPayload(null);
      setSaveError("admin.basicEdit.update.notConfirmed");
      return;
    }
    confirmSaved(record, version);
  };
  const retryVerification = async () => {
    if (!verificationPayload || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    const version = requestVersion.current;
    try {
      await verifyUpdate(verificationPayload, version);
    } catch {
      if (version === requestVersion.current)
        setSaveError("admin.basicEdit.update.verificationFailed");
    } finally {
      if (version === requestVersion.current) {
        submitLock.current = false;
        setSaving(false);
      }
    }
  };
  const saveModal = async (payload, version) => {
    try {
      const response = await new Promise((resolve) =>
        putToOpenElisServerFullResponse(
          `/rest/test-catalog/tests/${encodeURIComponent(testId)}/basic-info`,
          JSON.stringify(payload),
          resolve,
        ),
      );
      if (version !== requestVersion.current) return;
      if (response?.status >= 400 && !response.redirected) {
        setSaveError(
          response.status === 404
            ? "admin.basicEdit.notFound"
            : response.status === 422
              ? "admin.basicEdit.invalid"
              : response.status === 409
                ? "admin.basicEdit.conflict"
                : "admin.basicEdit.saveFailed",
        );
        return;
      }
      if (response?.ok && response.status === 200 && !response.redirected) {
        let record;
        try {
          record = await response.json();
        } catch {
          /* Verify the server state before a retry. */
        }
        if (version !== requestVersion.current) return;
        if (
          completeBasicInfo(record, testId) &&
          matchesEditablePayload(record, payload)
        ) {
          confirmSaved(record, version);
          return;
        }
      }
      setVerificationPayload(payload);
      await verifyUpdate(payload, version);
    } catch {
      if (version === requestVersion.current) {
        setVerificationPayload(payload);
        setSaveError("admin.basicEdit.update.verificationFailed");
      }
    } finally {
      if (version === requestVersion.current) {
        submitLock.current = false;
        setSaving(false);
      }
    }
  };

  const handleSave = () => {
    if (
      submitLock.current ||
      !form ||
      (modalEdit &&
        (verificationPayload ||
          !completeBasicInfo(form, testId) ||
          !dirty ||
          referenceError ||
          !referencesLoaded.lab ||
          !referencesLoaded.samples ||
          referenceIdentityMissing))
    )
      return;
    submitLock.current = true;
    setSaving(true);
    setSaveError(null);
    const version = requestVersion.current;
    if (modalEdit) {
      saveModal(editablePayload(form), version);
      return;
    }
    putToOpenElisServer(
      `/rest/test-catalog/tests/${testId}/basic-info`,
      JSON.stringify(modalEdit ? editablePayload(form) : form),
      (status) => {
        if (version !== requestVersion.current) return;
        submitLock.current = false;
        setSaving(false);
        if (status === 200) {
          originalForm.current = editablePayload(form);
          setNotificationVisible(true);
          addNotification({
            kind: "success",
            title: intl.formatMessage({
              id: "label.testCatalog.section.basic-info",
            }),
            message: intl.formatMessage({
              id: "label.testCatalog.basicInfo.saved",
            }),
          });
          onSaved?.();
        } else {
          setSaveError(
            status === 404
              ? "admin.basicEdit.notFound"
              : status === 422
                ? "admin.basicEdit.invalid"
                : status === 409
                  ? "admin.basicEdit.conflict"
                  : "admin.basicEdit.saveFailed",
          );
        }
      },
    );
  };

  const handleActivate = (gapsAcknowledged) => {
    postToOpenElisServerJsonResponse(
      `/rest/test-catalog/tests/${testId}/activate`,
      JSON.stringify(gapsAcknowledged ? { gapsAcknowledged } : {}),
      (res) => {
        if (res && (res.status === 422 || res.statusCode === 422)) {
          // FR-57/FR-59 — incomplete test: surface the checklist, never silently
          // succeed or flip the toggle.
          setCompletenessReport(res);
        } else if (res && (res.status === 409 || res.statusCode === 409)) {
          setCoverageReport(res);
          setAckModalOpen(true);
        } else if (res && !res.error) {
          setAckModalOpen(false);
          setCoverageReport(null);
          update({ active: true });
          setNotificationVisible(true);
          addNotification({
            kind: "success",
            title: intl.formatMessage({
              id: "label.testCatalog.section.basic-info",
            }),
            message: intl.formatMessage({
              id: "label.testCatalog.ranges.activated",
            }),
          });
        } else {
          setNotificationVisible(true);
          addNotification({
            kind: "error",
            title: intl.formatMessage({ id: "error.title" }),
            message: intl.formatMessage({ id: "server.error.msg" }),
          });
        }
      },
    );
  };

  const cancelAck = () => {
    setAckModalOpen(false);
    setCoverageReport(null);
  };

  if (isCreate) {
    const createFields = (
      <Stack gap={6} className="test-catalog-create-form">
        <TextInput
          id="basic-info-name"
          labelText={intl.formatMessage({ id: "label.testCatalog.testName" })}
          value={createForm.name}
          onChange={(e) => {
            const name = e.target.value;
            // Auto-suggest the code from the name until the admin edits it (FR-2).
            updateCreate(codeEdited ? { name } : { name, code: name });
          }}
        />
        <TextInput
          id="basic-info-reporting-name"
          labelText={intl.formatMessage({
            id: "label.testCatalog.basicInfo.reportingName",
          })}
          value={createForm.reportingName}
          onChange={(e) => updateCreate({ reportingName: e.target.value })}
        />
        <TextInput
          id="basic-info-code"
          labelText={intl.formatMessage({ id: "label.testCatalog.testCode" })}
          value={createForm.code}
          invalid={codeError}
          invalidText={intl.formatMessage({
            id: "error.testCatalog.codeExists",
          })}
          onChange={(e) => {
            setCodeEdited(true);
            setCodeError(false);
            updateCreate({ code: e.target.value });
          }}
        />
        <ComboBox
          id="basic-info-lab-unit"
          titleText={intl.formatMessage({
            id: "label.testCatalog.basicInfo.labUnit",
          })}
          translateWithId={translateMultiSelect}
          items={labUnits}
          itemToString={(item) => (item ? item.name : "")}
          selectedItem={labUnits.find((u) => u.id === createForm.labUnitId)}
          onChange={({ selectedItem }) =>
            updateCreate({ labUnitId: selectedItem ? selectedItem.id : "" })
          }
        />
        {renderSampleTypesControl(
          "basic-info",
          createForm.sampleTypeIds,
          createForm.domain,
          (ids) => updateCreate({ sampleTypeIds: ids }),
        )}
        {createForm.sampleTypeIds.length === 0 && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({
              id: "error.testCatalog.basicInfo.sampleTypeRequired",
            })}
          />
        )}
        <RadioButtonGroup
          name="basic-info-create-domain"
          legendText={intl.formatMessage({ id: "label.testCatalog.domain" })}
          valueSelected={createForm.domain}
          onChange={(value) => updateCreate({ domain: value })}
        >
          {domains.map((d) => (
            <RadioButton
              key={d.id}
              id={`create-domain-${d.id}`}
              value={d.id}
              labelText={intl.formatMessage({ id: d.labelKey })}
            />
          ))}
        </RadioButtonGroup>
        <Toggle
          id="basic-info-create-amr"
          labelText={intl.formatMessage({
            id: "label.testCatalog.basicInfo.amr",
          })}
          labelA={intl.formatMessage({ id: "label.no" })}
          labelB={intl.formatMessage({ id: "label.yes" })}
          toggled={createForm.antimicrobialResistance}
          onToggle={(checked) =>
            updateCreate({ antimicrobialResistance: checked })
          }
        />
        <Toggle
          id="basic-info-create-orderable"
          labelText={intl.formatMessage({
            id: "label.testCatalog.basicInfo.orderable",
          })}
          labelA={intl.formatMessage({ id: "label.no" })}
          labelB={intl.formatMessage({ id: "label.yes" })}
          toggled={createForm.orderable}
          onToggle={(checked) => updateCreate({ orderable: checked })}
        />
        <TextArea
          id="basic-info-create-description"
          labelText={intl.formatMessage({
            id: "label.testCatalog.basicInfo.description",
          })}
          value={createForm.description}
          onChange={(e) => updateCreate({ description: e.target.value })}
          rows={2}
        />
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({
            id: "label.testCatalog.basicInfo.createInactiveHint",
          })}
        />
        {!embedded && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              kind="primary"
              disabled={saving || !createValid}
              onClick={handleCreate}
            >
              <FormattedMessage id="label.button.save" />
            </Button>
            <Button
              kind="secondary"
              onClick={() => history.push(`${base}/TestCatalogList`)}
            >
              <FormattedMessage id="label.button.cancel" />
            </Button>
          </div>
        )}
      </Stack>
    );

    if (embedded) {
      return (
        <Modal
          className="oe-admin-modal oe-admin-modal--large test-catalog-create-modal"
          open
          size="lg"
          modalHeading={intl.formatMessage({
            id: "button.testCatalog.newTest",
          })}
          iconDescription={intl.formatMessage({ id: "label.button.close" })}
          selectorPrimaryFocus="#basic-info-name"
          primaryButtonText={intl.formatMessage({ id: "label.button.save" })}
          secondaryButtonText={intl.formatMessage({
            id: "label.button.cancel",
          })}
          primaryButtonDisabled={saving || !createValid}
          onRequestSubmit={handleCreate}
          onRequestClose={onCancel}
          preventCloseOnClickOutside
        >
          {createFields}
        </Modal>
      );
    }

    return createFields;
  }

  if (loading) {
    const state = (
      <Loading
        description={intl.formatMessage({ id: "label.loading" })}
        withOverlay={false}
      />
    );
    return modalEdit ? editModal(state) : state;
  }
  if (error || !form) {
    const state = (
      <>
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({ id: "error.title" })}
          subtitle={intl.formatMessage({
            id: "label.testCatalog.editor.loadError",
          })}
        />
        <Button kind="tertiary" onClick={() => setLoadRevision((n) => n + 1)}>
          {intl.formatMessage({ id: "button.retry" })}
        </Button>
      </>
    );
    return modalEdit ? editModal(state) : state;
  }

  const editFields = (
    <Stack gap={6}>
      {saveError && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({ id: saveError })}
        />
      )}
      {referenceIdentityMissing && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({
            id: "admin.basicEdit.referencesMissing",
          })}
        />
      )}
      {referenceError && (
        <Button
          kind="tertiary"
          disabled={saving}
          onClick={() => setReferenceRevision((n) => n + 1)}
        >
          {intl.formatMessage({ id: "button.retry" })}
        </Button>
      )}
      {referenceError && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({ id: "admin.basicEdit.referencesFailed" })}
        />
      )}
      {modalEdit && (
        <p className="test-catalog-basic-modal__hint">
          {intl.formatMessage({ id: "admin.basicEdit.catalogScope" })}
          <Button
            kind="ghost"
            size="sm"
            disabled={saving || dirty}
            onClick={onConfigure}
          >
            {intl.formatMessage({ id: "common.action.relatedConfiguration" })}
          </Button>
        </p>
      )}

      <TextInput
        id="basic-info-name"
        labelText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.name",
        })}
        value={form.name || ""}
        readOnly
        helperText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.name.helper",
        })}
      />
      <TextInput
        id="basic-info-code"
        labelText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.code",
        })}
        value={form.code || ""}
        onChange={(e) => update({ code: e.target.value })}
      />
      <TextArea
        id="basic-info-description"
        labelText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.description",
        })}
        value={form.description || ""}
        onChange={(e) => update({ description: e.target.value })}
        rows={2}
      />

      <ComboBox
        id="basic-info-edit-lab-unit"
        titleText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.labUnit",
        })}
        translateWithId={translateMultiSelect}
        items={labUnits}
        itemToString={(item) => (item ? item.name : "")}
        selectedItem={labUnits.find((u) => u.id === form.labUnitId) || null}
        onChange={({ selectedItem }) =>
          update({ labUnitId: selectedItem ? selectedItem.id : "" })
        }
      />
      <div id="basic-info-edit-sample-type">
        {renderSampleTypesControl(
          "basic-info-edit",
          editSampleTypeIds,
          form.domain,
          (ids) => update({ sampleTypeIds: ids }),
        )}
      </div>
      {editSampleTypesMissing && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({
            id: "error.testCatalog.basicInfo.sampleTypeRequired",
          })}
          data-testid="sample-type-required-error"
        />
      )}
      {editIncompatibleTypes.length > 0 && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({
            id: "error.testCatalog.basicInfo.sampleTypeDomain",
          })}
          subtitle={editIncompatibleTypes.map((t) => t.name).join(", ")}
          data-testid="sample-type-domain-error"
        />
      )}

      <RadioButtonGroup
        key={domainRadioKey}
        name="basic-info-domain"
        legendText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.domain",
        })}
        valueSelected={form.domain || "CLINICAL"}
        onChange={(value) => {
          if (value !== form.domain) {
            setPendingDomain(value);
          }
        }}
      >
        {domains.map((d) => (
          <RadioButton
            key={d.id}
            id={`domain-${d.id}`}
            value={d.id}
            labelText={intl.formatMessage({ id: d.labelKey })}
          />
        ))}
      </RadioButtonGroup>

      <Toggle
        id="basic-info-amr"
        labelText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.amr",
        })}
        labelA={intl.formatMessage({ id: "label.no" })}
        labelB={intl.formatMessage({ id: "label.yes" })}
        toggled={!!form.antimicrobialResistance}
        onToggle={(checked) => update({ antimicrobialResistance: checked })}
      />
      {!modalEdit && (
        <Toggle
          id="basic-info-active"
          labelText={intl.formatMessage({
            id: "label.testCatalog.basicInfo.active",
          })}
          labelA={intl.formatMessage({ id: "label.no" })}
          labelB={intl.formatMessage({ id: "label.yes" })}
          toggled={!!form.active}
          onToggle={(checked) => {
            if (checked && !form.active) {
              handleActivate(null);
            } else {
              update({ active: checked });
            }
          }}
        />
      )}
      {modalEdit && (
        <p>
          {intl.formatMessage({ id: "label.testCatalog.list.col.status" })}：
          {intl.formatMessage({
            id: form.active
              ? "label.testCatalog.basicInfo.active"
              : "label.testCatalog.list.filter.inactive",
          })}
        </p>
      )}
      {!modalEdit && !form.active && completenessGaps.length > 0 && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({
            id: "label.testCatalog.activation.incomplete.heading",
          })}
          subtitle={completenessGaps.join(" ")}
          data-testid="completeness-checklist"
        />
      )}
      <Toggle
        id="basic-info-orderable"
        labelText={intl.formatMessage({
          id: "label.testCatalog.basicInfo.orderable",
        })}
        labelA={intl.formatMessage({ id: "label.no" })}
        labelB={intl.formatMessage({ id: "label.yes" })}
        toggled={!!form.orderable}
        onToggle={(checked) => update({ orderable: checked })}
      />

      {!modalEdit && (
        <div>
          <Button
            kind="primary"
            disabled={
              saving ||
              editSampleTypesMissing ||
              editIncompatibleTypes.length > 0
            }
            onClick={handleSave}
          >
            <FormattedMessage id="label.button.save" />
          </Button>
        </div>
      )}

      {pendingDomain !== null && (
        <Modal
          open
          modalHeading={intl.formatMessage({
            id: "label.testCatalog.basicInfo.domainModal.title",
          })}
          primaryButtonText={intl.formatMessage({ id: "label.button.confirm" })}
          secondaryButtonText={intl.formatMessage({
            id: "label.button.cancel",
          })}
          onRequestClose={cancelDomainChange}
          onSecondarySubmit={cancelDomainChange}
          onRequestSubmit={() => {
            update({ domain: pendingDomain });
            setPendingDomain(null);
          }}
        >
          <p>
            {intl.formatMessage(
              { id: "label.testCatalog.basicInfo.domainModal.body" },
              {
                domain: pendingDomain
                  ? intl.formatMessage({
                      id: `label.testCatalog.basicInfo.domain.${pendingDomain}`,
                    })
                  : "",
              },
            )}
          </p>
        </Modal>
      )}

      {ackModalOpen && (
        <ActivationAckModal
          open={ackModalOpen}
          report={coverageReport}
          onAcknowledge={() => handleActivate(JSON.stringify(coverageReport))}
          onCancel={cancelAck}
        />
      )}

      {completenessReport && (
        <Modal
          open={!!completenessReport}
          passiveModal
          modalHeading={intl.formatMessage({
            id: "label.testCatalog.activation.incomplete.heading",
          })}
          onRequestClose={() => setCompletenessReport(null)}
        >
          <p style={{ marginBottom: "1rem" }}>
            <FormattedMessage id="label.testCatalog.activation.incomplete.body" />
          </p>
          <ul style={{ listStyle: "disc", paddingLeft: "1.5rem" }}>
            {(completenessReport.messages || []).map((msg, idx) => (
              <li key={idx} style={{ marginBottom: "0.25rem" }}>
                {msg}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </Stack>
  );
  return modalEdit
    ? editModal(
        <fieldset
          ref={editFieldsElement}
          disabled={saving || !!verificationPayload || referenceIdentityMissing}
          className="test-catalog-basic-modal__fields"
        >
          {editFields}
        </fieldset>,
      )
    : editFields;
};

export default BasicInfoSection;
