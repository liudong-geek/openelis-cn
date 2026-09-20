import React, { useContext, useEffect, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import {
  Button,
  Checkbox,
  FileUploader,
  InlineLoading,
  Select,
  SelectItem,
  TextArea,
  TextInput,
} from "@carbon/react";
import {
  getFromOpenElisServer,
  postToOpenElisServer,
  postToOpenElisServerFormData,
} from "../../../utils/Utils";
import {
  AlertDialog,
  NotificationKinds,
} from "../../../common/CustomNotification";
import { NotificationContext } from "../../../layout/Layout";
import { FormattedMessage, useIntl } from "react-intl";
import { refreshCurrentRoute } from "../../../utils/NavigationUtils";

interface GenericConfigEditProps {
  menuType: string;
  ID: string;
  embedded?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
}

interface ConfigLocalization {
  english?: string;
  french?: string;
  localeValues?: Record<string, string>;
}

interface FormEntryConfig {
  paramName: string;
  description: string;
  value: string;
  valueType: "boolean" | "dictionary" | "logoUpload" | "text" | "freeText";
  tag?: string;
  dictionaryValues?: string[];
  localization?: ConfigLocalization;
}

interface NotificationContextValue {
  notificationVisible: boolean;
  setNotificationVisible: (visible: boolean) => void;
  addNotification: (notification: {
    kind: string;
    title: string;
    message: string;
  }) => void;
}

const GenericConfigEdit = ({
  menuType,
  ID,
  embedded = false,
  onCancel,
  onSaved,
}: GenericConfigEditProps) => {
  const intl = useIntl();
  const [config, setConfig] = useState<FormEntryConfig | null>(null);
  const [textInputEnglishValue, setTextInputEnglishValue] = useState("");
  const [textInputFrenchValue, setTextInputFrenchValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;

  const showAlertMessage = (message: string, kind: string) => {
    setNotificationVisible(true);
    addNotification({
      kind,
      title: intl.formatMessage({ id: "notification.title" }),
      message,
    });
  };

  useEffect(() => {
    setIsLoading(true);
    setConfig(null);
    setFile(null);
    setImg(null);
    setRemoveImage(false);
    getFromOpenElisServer(
      `/rest/${menuType}?ID=${ID}`,
      (response?: FormEntryConfig) => {
        if (!response) {
          setIsLoading(false);
          showAlertMessage(
            intl.formatMessage({ id: "server.error.msg" }),
            NotificationKinds.error,
          );
          return;
        }
        const normalized = {
          ...response,
          paramName: String(response.paramName || ""),
          description: String(response.description || ""),
          value: String(response.value || ""),
          dictionaryValues: Array.isArray(response.dictionaryValues)
            ? response.dictionaryValues.map(String)
            : [],
        };
        setConfig(normalized);
        setTextInputEnglishValue(
          response.localization?.english ||
            response.localization?.localeValues?.en ||
            "",
        );
        setTextInputFrenchValue(
          response.localization?.french ||
            response.localization?.localeValues?.fr ||
            "",
        );
        if (response.valueType === "logoUpload") {
          getFromOpenElisServer(
            `/dbImage/siteInformation/${response.paramName}`,
            (logoResponse?: { value?: string }) => {
              setImg(logoResponse?.value || null);
            },
          );
        }
        setIsLoading(false);
      },
    );
    // Alert helpers use the current locale and notification context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuType, ID]);

  const updateConfig = (newState: Partial<FormEntryConfig>) => {
    setConfig((previous) =>
      previous ? { ...previous, ...newState } : previous,
    );
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => updateConfig({ value: event.target.value });

  const handleInputEnglishChange = (event: ChangeEvent<HTMLInputElement>) => {
    const english = event.target.value;
    setTextInputEnglishValue(english);
    updateConfig({
      localization: { ...config?.localization, english },
    });
  };

  const handleInputFrenchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const french = event.target.value;
    setTextInputFrenchValue(french);
    updateConfig({
      localization: { ...config?.localization, french },
    });
  };

  const handleSubmit = (status: number) => {
    setIsSaving(false);
    if (status === 200) {
      showAlertMessage(
        intl.formatMessage({ id: "save.config.success.msg" }),
        NotificationKinds.success,
      );
      if (onSaved) onSaved();
      else refreshCurrentRoute();
      return;
    }
    showAlertMessage(
      intl.formatMessage({ id: "server.error.msg" }),
      NotificationKinds.error,
    );
  };

  const handleSubmitButton = () => {
    if (!config || isSaving) return;
    setIsSaving(true);
    if (config.valueType === "logoUpload") {
      const formData = new FormData();
      if (file && !removeImage) formData.append("logoFile", file);
      formData.append("logoName", config.paramName);
      formData.append("removeImage", removeImage ? "true" : "false");
      postToOpenElisServerFormData("/rest/logoUpload", formData, handleSubmit);
      return;
    }
    postToOpenElisServer(
      `/rest/${menuType}?ID=${ID}`,
      JSON.stringify(config),
      handleSubmit,
    );
  };

  const MAX_LOGO_SIZE = 2 * 1024 * 1024;
  const handleFileUpload = (event: SyntheticEvent<HTMLElement>) => {
    const input = event.target as HTMLInputElement;
    const selectedFile = input.files?.[0];
    if (!selectedFile) return;
    if (selectedFile.size > MAX_LOGO_SIZE) {
      showAlertMessage(
        intl.formatMessage({ id: "admin.config.logo.error.fileTooLarge" }),
        NotificationKinds.error,
      );
      input.value = "";
      return;
    }
    setFile(selectedFile);
    setRemoveImage(false);
    const reader = new FileReader();
    reader.onloadend = () => setImg(reader.result as string);
    reader.readAsDataURL(selectedFile);
  };

  const cancel = () => {
    if (onCancel) onCancel();
    else refreshCurrentRoute();
  };

  const logoSaveDisabled =
    config?.valueType === "logoUpload" && !file && !removeImage;

  return (
    <div
      className={
        embedded
          ? "config-editor config-editor--embedded"
          : "adminPageContent config-editor"
      }
    >
      {!embedded && notificationVisible && <AlertDialog />}
      {isLoading && (
        <InlineLoading
          description={intl.formatMessage({ id: "loading.description" })}
        />
      )}
      {config && (
        <>
          {!embedded && (
            <header className="config-editor__heading">
              <h1>
                <FormattedMessage id="admin.page.configuration.formEntryConfigMenu.editRecord" />
              </h1>
              <p>
                <FormattedMessage id="config.workspace.edit.description" />
              </p>
            </header>
          )}

          <div className="config-editor__summary">
            <span>
              <FormattedMessage id="admin.page.configuration.formEntryConfigMenu.name" />
            </span>
            <strong>{config.paramName || "—"}</strong>
            <p>{config.description || "—"}</p>
          </div>

          <div className="config-editor__field">
            {config.valueType === "boolean" && (
              <Select
                id={`config-boolean-${ID}`}
                labelText={intl.formatMessage({
                  id: "admin.page.configuration.formEntryConfigMenu.value",
                })}
                value={config.value}
                onChange={(event) =>
                  updateConfig({ value: event.target.value })
                }
              >
                <SelectItem
                  value="true"
                  text={intl.formatMessage({
                    id: "config.workspace.boolean.true",
                  })}
                />
                <SelectItem
                  value="false"
                  text={intl.formatMessage({
                    id: "config.workspace.boolean.false",
                  })}
                />
              </Select>
            )}

            {config.valueType === "dictionary" && (
              <Select
                id={`config-dictionary-${ID}`}
                labelText={intl.formatMessage({
                  id: "admin.page.configuration.formEntryConfigMenu.value",
                })}
                value={config.value}
                onChange={(event) =>
                  updateConfig({ value: event.target.value })
                }
              >
                {(config.dictionaryValues || []).map((value) => (
                  <SelectItem key={value} value={value} text={value} />
                ))}
              </Select>
            )}

            {config.valueType === "logoUpload" && (
              <div className="config-editor__logo">
                {!removeImage && (
                  <FileUploader
                    buttonLabel={intl.formatMessage({
                      id: "import.selectFile",
                    })}
                    buttonKind="secondary"
                    size="sm"
                    filenameStatus="edit"
                    accept={[".jpg", ".jpeg", ".png", ".gif"]}
                    multiple={false}
                    iconDescription={intl.formatMessage({
                      id: "label.button.delete",
                    })}
                    onChange={handleFileUpload}
                  />
                )}
                <p className="config-editor__hint">
                  <FormattedMessage id="admin.config.logo.formats" />
                </p>
                {img && !removeImage && (
                  <img
                    src={img}
                    alt={intl.formatMessage({
                      id: "site.branding.current.logo",
                    })}
                  />
                )}
                <Checkbox
                  labelText={intl.formatMessage({
                    id: "config.workspace.removeImage",
                  })}
                  id={`config-remove-image-${ID}`}
                  checked={removeImage}
                  onChange={(_event, state) => {
                    const checked = Boolean(state.checked);
                    setRemoveImage(checked);
                    if (checked) {
                      setFile(null);
                      setImg(null);
                    }
                  }}
                />
              </div>
            )}

            {(config.valueType === "text" || config.valueType === "freeText") &&
              config.tag !== "localization" &&
              (config.valueType === "freeText" ? (
                <TextArea
                  id={`config-text-${ID}`}
                  labelText={intl.formatMessage({
                    id: "admin.page.configuration.formEntryConfigMenu.value",
                  })}
                  value={config.value}
                  rows={5}
                  onChange={handleInputChange}
                />
              ) : (
                <TextInput
                  id={`config-text-${ID}`}
                  labelText={intl.formatMessage({
                    id: "admin.page.configuration.formEntryConfigMenu.value",
                  })}
                  value={config.value}
                  onChange={handleInputChange}
                />
              ))}

            {(config.valueType === "text" || config.valueType === "freeText") &&
              config.tag === "localization" && (
                <div className="config-editor__localized-fields">
                  <TextInput
                    id={`config-english-${ID}`}
                    labelText={<FormattedMessage id="english.label" />}
                    value={textInputEnglishValue}
                    onChange={handleInputEnglishChange}
                  />
                  <TextInput
                    id={`config-french-${ID}`}
                    labelText={<FormattedMessage id="french.label" />}
                    value={textInputFrenchValue}
                    onChange={handleInputFrenchChange}
                  />
                </div>
              )}
          </div>

          <div className="config-editor__actions">
            <Button kind="secondary" onClick={cancel} disabled={isSaving}>
              <FormattedMessage id="button.cancel" />
            </Button>
            <Button
              data-cy="save-Button"
              onClick={handleSubmitButton}
              disabled={isLoading || isSaving || logoSaveDisabled}
            >
              {isSaving
                ? intl.formatMessage({ id: "config.workspace.saving" })
                : intl.formatMessage({
                    id: "admin.page.configuration.formEntryConfigMenu.button.save",
                  })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default GenericConfigEdit;
