import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  ComposedModal,
  InlineLoading,
  InlineNotification,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Select,
  SelectItem,
  Tag,
  TextInput,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  postToOpenElisServerFullResponse,
  putToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { normalizeName } from "./helpers";
import "./LabelPresetWorkspace.css";

const BARCODE_TYPES = ["CODE_128", "QR", "DATAMATRIX"];

const EMPTY_FORM = {
  name: "",
  heightMm: 20,
  widthMm: 40,
  barcodeType: "CODE_128",
  printsPerOrder: false,
  printsPerSample: true,
  defaultPerOrder: 0,
  maxPerOrder: 10,
  defaultPerSample: 1,
  maxPerSample: 10,
  isActive: true,
  fields: [],
};

const formFromPreset = (preset) => ({
  name: preset?.name ?? "",
  heightMm: preset?.heightMm ?? 20,
  widthMm: preset?.widthMm ?? 40,
  barcodeType: preset?.barcodeType ?? "CODE_128",
  printsPerOrder: preset?.printsPerOrder ?? false,
  printsPerSample: preset?.printsPerSample ?? true,
  defaultPerOrder: preset?.defaultPerOrder ?? 0,
  maxPerOrder: preset?.maxPerOrder ?? 10,
  defaultPerSample: preset?.defaultPerSample ?? 1,
  maxPerSample: preset?.maxPerSample ?? 10,
  isActive: preset?.isActive ?? true,
  fields: preset?.fields ?? [],
});

export default function LabelPresetEditor({ preset, onClose }) {
  const intl = useIntl();
  const isEdit = preset != null;
  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    const next = formFromPreset(preset);
    setForm(next);
    setInitialForm(next);
    setErrors({});
    setApiError(null);
  }, [preset]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({
      ...current,
      [name]: undefined,
      scope: undefined,
    }));
  };

  const validate = () => {
    const next = {};
    if (!form.name?.trim()) {
      next.name = intl.formatMessage({
        id: "admin.labelPresets.validation.name.required",
      });
    } else if (form.name.trim().length > 120) {
      next.name = intl.formatMessage({
        id: "admin.labelPresets.validation.name.toolong",
      });
    }
    if (!form.heightMm || form.heightMm < 5 || form.heightMm > 200) {
      next.heightMm = intl.formatMessage({
        id: "admin.labelPresets.validation.dimension.range",
      });
    }
    if (!form.widthMm || form.widthMm < 5 || form.widthMm > 200) {
      next.widthMm = intl.formatMessage({
        id: "admin.labelPresets.validation.dimension.range",
      });
    }
    if (!form.barcodeType) {
      next.barcodeType = intl.formatMessage({
        id: "admin.labelPresets.validation.barcodeType.required",
      });
    }
    if (!form.printsPerOrder && !form.printsPerSample) {
      next.scope = intl.formatMessage({
        id: "admin.labelPresets.validation.scope.required",
      });
    }
    if (
      form.printsPerOrder &&
      Number(form.maxPerOrder) < Number(form.defaultPerOrder)
    ) {
      next.maxPerOrder = intl.formatMessage({
        id: "admin.labelPresets.validation.max.lte",
      });
    }
    if (
      form.printsPerSample &&
      Number(form.maxPerSample) < Number(form.defaultPerSample)
    ) {
      next.maxPerSample = intl.formatMessage({
        id: "admin.labelPresets.validation.max.lte",
      });
    }
    return next;
  };

  const submit = () => {
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    setApiError(null);
    const payload = { ...form, name: normalizeName(form.name) };
    const handleResponse = (response) => {
      setSubmitting(false);
      if (response && (response.status === 200 || response.status === 201)) {
        onClose(true);
        return;
      }
      if (response?.status === 422) {
        response.json().then((body) => {
          setErrors(
            (body?.fieldErrors || []).reduce((result, error) => {
              result[error.field] = error.defaultMessage;
              return result;
            }, {}),
          );
          if (body?.globalErrors?.length)
            setApiError(body.globalErrors.join("; "));
        });
        return;
      }
      setApiError(intl.formatMessage({ id: "admin.labelPresets.saveFailed" }));
    };
    if (isEdit) {
      putToOpenElisServerFullResponse(
        `/api/labelPresets/${preset.id}`,
        JSON.stringify(payload),
        handleResponse,
      );
    } else {
      postToOpenElisServerFullResponse(
        "/api/labelPresets",
        JSON.stringify(payload),
        handleResponse,
      );
    }
  };

  const numberValue = (name) => (_event, data) =>
    setField(name, Number(data.value));
  const requestClose = () => {
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onClose(false);
  };
  const previewWidth = Math.min(260, Math.max(150, Number(form.widthMm) * 4));
  const previewHeight = Math.min(160, Math.max(76, Number(form.heightMm) * 4));

  return (
    <>
      <ComposedModal
        open
        onClose={requestClose}
        size="lg"
        data-testid="label-preset-editor"
        className="label-preset-editor"
      >
        <ModalHeader
          title={intl.formatMessage({
            id: isEdit
              ? "admin.labelPresets.editor.titleEdit"
              : "admin.labelPresets.editor.titleAdd",
          })}
          label={intl.formatMessage({
            id: "admin.labelPresets.editor.subtitle",
          })}
        />
        <ModalBody>
          {apiError && (
            <InlineNotification
              kind="error"
              title={apiError}
              lowContrast
              hideCloseButton
            />
          )}
          <div className="label-preset-editor__layout">
            <aside className="label-preset-editor__preview-panel">
              <div className="label-preset-editor__preview-heading">
                <h3>
                  <FormattedMessage id="admin.labelPresets.editor.previewTitle" />
                </h3>
                <Tag type={form.isActive ? "green" : "gray"} size="sm">
                  <FormattedMessage
                    id={
                      form.isActive
                        ? "admin.labelPresets.status.active"
                        : "admin.labelPresets.status.inactive"
                    }
                  />
                </Tag>
              </div>
              <div className="label-preset-editor__canvas">
                <div
                  className={`label-preset-editor__label label-preset-editor__label--${form.barcodeType.toLowerCase()}`}
                  style={{ width: previewWidth, height: previewHeight }}
                >
                  <strong>
                    {form.name ||
                      intl.formatMessage({
                        id: "admin.labelPresets.editor.previewName",
                      })}
                  </strong>
                  <div className="label-preset-editor__barcode" />
                  <span>240001 · SAMPLE</span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>
                    <FormattedMessage id="admin.labelPresets.col.dimensions" />
                  </dt>
                  <dd>
                    {form.widthMm} × {form.heightMm} mm
                  </dd>
                </div>
                <div>
                  <dt>
                    <FormattedMessage id="admin.labelPresets.col.barcodeType" />
                  </dt>
                  <dd>{form.barcodeType}</dd>
                </div>
              </dl>
              <p>
                <FormattedMessage id="admin.labelPresets.editor.previewHelper" />
              </p>
            </aside>

            <div className="label-preset-editor__form">
              <section>
                <header>
                  <h3>
                    <FormattedMessage id="admin.labelPresets.editor.section.basicInfo" />
                  </h3>
                  <p>
                    <FormattedMessage id="admin.labelPresets.editor.basicHelper" />
                  </p>
                </header>
                <div className="label-preset-editor__fields label-preset-editor__fields--basic">
                  <TextInput
                    id="preset-name"
                    labelText={intl.formatMessage({
                      id: "admin.labelPresets.field.name",
                    })}
                    value={form.name}
                    invalid={Boolean(errors.name)}
                    invalidText={errors.name}
                    disabled={isEdit && preset?.isSystem}
                    onChange={(event) => setField("name", event.target.value)}
                  />
                  <Checkbox
                    id="preset-isActive"
                    aria-label={intl.formatMessage({
                      id: "admin.labelPresets.field.isActive",
                    })}
                    labelText={intl.formatMessage({
                      id: "admin.labelPresets.field.isActive",
                    })}
                    checked={form.isActive}
                    onChange={(_event, { checked }) =>
                      setField("isActive", checked)
                    }
                  />
                </div>
              </section>

              <section>
                <header>
                  <h3>
                    <FormattedMessage id="admin.labelPresets.editor.section.dimensions" />
                  </h3>
                  <p>
                    <FormattedMessage id="admin.labelPresets.editor.dimensionsHelper" />
                  </p>
                </header>
                <div className="label-preset-editor__fields label-preset-editor__fields--two">
                  <NumberInput
                    id="preset-widthMm"
                    label={intl.formatMessage({
                      id: "admin.labelPresets.field.widthMm",
                    })}
                    value={form.widthMm}
                    min={5}
                    max={200}
                    invalid={Boolean(errors.widthMm)}
                    invalidText={errors.widthMm}
                    onChange={numberValue("widthMm")}
                  />
                  <NumberInput
                    id="preset-heightMm"
                    label={intl.formatMessage({
                      id: "admin.labelPresets.field.heightMm",
                    })}
                    value={form.heightMm}
                    min={5}
                    max={200}
                    invalid={Boolean(errors.heightMm)}
                    invalidText={errors.heightMm}
                    onChange={numberValue("heightMm")}
                  />
                </div>
              </section>

              <section>
                <header>
                  <h3>
                    <FormattedMessage id="admin.labelPresets.editor.section.barcodeSettings" />
                  </h3>
                  <p>
                    <FormattedMessage id="admin.labelPresets.editor.barcodeHelper" />
                  </p>
                </header>
                <div className="label-preset-editor__fields">
                  <Select
                    id="preset-barcodeType"
                    labelText={intl.formatMessage({
                      id: "admin.labelPresets.field.barcodeType",
                    })}
                    value={form.barcodeType}
                    invalid={Boolean(errors.barcodeType)}
                    invalidText={errors.barcodeType}
                    onChange={(event) =>
                      setField("barcodeType", event.target.value)
                    }
                  >
                    {BARCODE_TYPES.map((type) => (
                      <SelectItem
                        key={type}
                        value={type}
                        text={intl.formatMessage({
                          id: `admin.labelPresets.barcode.${type}`,
                        })}
                      />
                    ))}
                  </Select>
                </div>
              </section>

              <section>
                <header>
                  <h3>
                    <FormattedMessage id="admin.labelPresets.editor.section.printScope" />
                  </h3>
                  <p>
                    <FormattedMessage id="admin.labelPresets.editor.scopeHelper" />
                  </p>
                </header>
                {errors.scope && (
                  <p className="label-preset-editor__error" role="alert">
                    {errors.scope}
                  </p>
                )}
                <div className="label-preset-editor__scope-grid">
                  <article
                    className={
                      form.printsPerOrder
                        ? "label-preset-editor__scope--selected"
                        : undefined
                    }
                  >
                    <Checkbox
                      id="scope-order"
                      aria-label={intl.formatMessage({
                        id: "admin.labelPresets.scope.order",
                      })}
                      labelText={intl.formatMessage({
                        id: "admin.labelPresets.scope.order",
                      })}
                      checked={form.printsPerOrder}
                      onChange={(_event, { checked }) =>
                        setField("printsPerOrder", checked)
                      }
                    />
                    <div className="label-preset-editor__quantity-grid">
                      <NumberInput
                        id="defaultPerOrder"
                        label={intl.formatMessage({
                          id: "admin.labelPresets.field.defaultShort",
                        })}
                        value={form.defaultPerOrder}
                        min={0}
                        disabled={!form.printsPerOrder}
                        onChange={numberValue("defaultPerOrder")}
                      />
                      <NumberInput
                        id="maxPerOrder"
                        label={intl.formatMessage({
                          id: "admin.labelPresets.field.maximumShort",
                        })}
                        value={form.maxPerOrder}
                        min={0}
                        disabled={!form.printsPerOrder}
                        invalid={Boolean(errors.maxPerOrder)}
                        invalidText={errors.maxPerOrder}
                        onChange={numberValue("maxPerOrder")}
                      />
                    </div>
                  </article>
                  <article
                    className={
                      form.printsPerSample
                        ? "label-preset-editor__scope--selected"
                        : undefined
                    }
                  >
                    <Checkbox
                      id="scope-sample"
                      aria-label={intl.formatMessage({
                        id: "admin.labelPresets.scope.sample",
                      })}
                      labelText={intl.formatMessage({
                        id: "admin.labelPresets.scope.sample",
                      })}
                      checked={form.printsPerSample}
                      onChange={(_event, { checked }) =>
                        setField("printsPerSample", checked)
                      }
                    />
                    <div className="label-preset-editor__quantity-grid">
                      <NumberInput
                        id="defaultPerSample"
                        label={intl.formatMessage({
                          id: "admin.labelPresets.field.defaultShort",
                        })}
                        value={form.defaultPerSample}
                        min={0}
                        disabled={!form.printsPerSample}
                        onChange={numberValue("defaultPerSample")}
                      />
                      <NumberInput
                        id="maxPerSample"
                        label={intl.formatMessage({
                          id: "admin.labelPresets.field.maximumShort",
                        })}
                        value={form.maxPerSample}
                        min={0}
                        disabled={!form.printsPerSample}
                        invalid={Boolean(errors.maxPerSample)}
                        invalidText={errors.maxPerSample}
                        onChange={numberValue("maxPerSample")}
                      />
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" disabled={submitting} onClick={requestClose}>
            <FormattedMessage id="label.button.cancel" />
          </Button>
          <Button
            kind="primary"
            disabled={submitting || (isEdit && !isDirty)}
            onClick={submit}
          >
            {submitting ? (
              <InlineLoading
                description={intl.formatMessage({
                  id: "admin.labelPresets.workspace.saving",
                })}
              />
            ) : (
              <FormattedMessage id="label.button.save" />
            )}
          </Button>
        </ModalFooter>
      </ComposedModal>
      {discardOpen && (
        <Modal
          open
          danger
          modalHeading={intl.formatMessage({
            id: "admin.labelPresets.editor.discardTitle",
          })}
          primaryButtonText={intl.formatMessage({
            id: "admin.labelPresets.editor.discard",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "label.button.cancel",
          })}
          onRequestClose={() => setDiscardOpen(false)}
          onRequestSubmit={() => onClose(false)}
        >
          <p>
            <FormattedMessage id="admin.labelPresets.editor.discardConfirm" />
          </p>
        </Modal>
      )}
    </>
  );
}
