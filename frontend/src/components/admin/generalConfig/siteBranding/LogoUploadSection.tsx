/**
 * Logo Upload Section Component
 *
 * Handles logo file upload with validation and preview
 *
 * Task Reference: T032
 */

import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import type { SyntheticEvent } from "react";
import {
  FileUploader,
  Button,
  InlineNotification,
  Checkbox,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { postToOpenElisServerFormData } from "../../../utils/Utils";
import { TrashCan } from "@carbon/icons-react";
import { removeLogo } from "../../../utils/BrandingUtils";
import config from "../../../../config.json";
import { Modal } from "@carbon/react";

type LogoType = "header" | "login" | "favicon";

interface LogoUploadResult {
  success: boolean;
  noFile?: boolean;
}

export interface LogoUploadSectionHandle {
  uploadFile: () => Promise<LogoUploadResult>;
  hasPendingFile: () => boolean;
}

interface LogoUploadSectionProps {
  type: LogoType;
  currentLogoUrl?: string | null;
  onLogoUploaded?: (url: string) => void;
  onLogoRemoved?: () => void;
  onFileSelected?: (file: File, type: LogoType) => void;
  useHeaderLogoForLogin?: boolean;
  onUseHeaderLogoChange?: (useHeaderLogo: boolean) => void;
}

const LogoUploadSection = forwardRef<
  LogoUploadSectionHandle,
  LogoUploadSectionProps
>(function LogoUploadSection(
  {
    type,
    currentLogoUrl,
    onLogoUploaded,
    onLogoRemoved,
    onFileSelected,
    useHeaderLogoForLogin = false,
    onUseHeaderLogoChange,
  }: LogoUploadSectionProps,
  ref,
) {
  const intl = useIntl();
  const [file, setFile] = useState<File | null>(null);
  // Add serverBaseUrl prefix for REST endpoints (like Header.js does)
  const getDisplayUrl = (url?: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith("data:")) return url; // base64 preview
    if (url.startsWith(config.serverBaseUrl)) return url; // already prefixed
    return `${config.serverBaseUrl}${url}?v=${Date.now()}`; // add prefix and cache-busting
  };
  const [preview, setPreview] = useState(getDisplayUrl(currentLogoUrl));
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Update preview when currentLogoUrl prop changes
  useEffect(() => {
    const newPreviewUrl = getDisplayUrl(currentLogoUrl);
    console.debug(`LogoUploadSection [${type}] - currentLogoUrl changed:`, {
      currentLogoUrl,
      newPreviewUrl,
    });
    setPreview(newPreviewUrl);
  }, [currentLogoUrl, type]);

  // Expose upload function to parent via ref
  useImperativeHandle(ref, () => ({
    uploadFile: () => {
      return new Promise<LogoUploadResult>((resolve, reject) => {
        if (!file) {
          resolve({ success: true, noFile: true });
          return;
        }

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append("file", file);

        postToOpenElisServerFormData(
          `/rest/site-branding/logo/${type}`,
          formData,
          (status: number) => {
            setIsUploading(false);
            if (status === 200 || status === 201) {
              const logoUrl = `/rest/site-branding/logo/${type}`;
              setPreview(getDisplayUrl(logoUrl));
              setFile(null);
              if (onLogoUploaded) {
                onLogoUploaded(logoUrl);
              }
              resolve({ success: true });
            } else {
              setError(intl.formatMessage({ id: "site.branding.save.error" }));
              reject(new Error("Upload failed"));
            }
          },
        );
      });
    },
    hasPendingFile: () => !!file,
  }));

  const handleFileChange = (event: SyntheticEvent<HTMLElement>) => {
    const selectedFile = (event.target as HTMLInputElement).files?.[0];
    if (!selectedFile) return;

    // Validate file format
    const allowedFormats = [
      "image/png",
      "image/svg+xml",
      "image/jpeg",
      "image/jpg",
    ];
    if (!allowedFormats.includes(selectedFile.type)) {
      setError(intl.formatMessage({ id: "site.branding.file.format.error" }));
      return;
    }

    // Validate file size (2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (selectedFile.size > maxSize) {
      setError(intl.formatMessage({ id: "site.branding.file.size.error" }));
      return;
    }

    setError(null);
    setFile(selectedFile);

    // Notify parent that a file was selected
    if (onFileSelected) {
      onFileSelected(selectedFile, type);
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleRemove = () => {
    // Task Reference: T064 - Show confirmation dialog before removal
    setShowRemoveConfirm(true);
  };

  const confirmRemove = () => {
    setShowRemoveConfirm(false);
    setError(null);

    removeLogo(type, async (response) => {
      try {
        if (!response) {
          setError(intl.formatMessage({ id: "site.branding.error.remove" }));
          return;
        }
        const status = response.status || 200;
        if (status === 200 || status === 204) {
          // Parse response body if available
          if (response.ok) {
            try {
              await response.json();
            } catch {
              // Response might not have JSON body
            }
          }

          setFile(null);
          setPreview(null);
          if (onLogoRemoved) {
            onLogoRemoved();
          }
        } else {
          setError(intl.formatMessage({ id: "site.branding.error.remove" }));
        }
      } catch (error) {
        console.error("Error removing logo:", error);
        setError(intl.formatMessage({ id: "site.branding.error.remove" }));
      }
    });
  };

  const cancelRemove = () => {
    setShowRemoveConfirm(false);
  };

  const getTitleKey = () => {
    switch (type) {
      case "header":
        return "site.branding.header.logo";
      case "login":
        return "site.branding.login.logo";
      case "favicon":
        return "site.branding.favicon";
      default:
        return "site.branding.upload.logo";
    }
  };

  const getDescriptionKey = () => {
    switch (type) {
      case "header":
        return "site.branding.header.logo.description";
      case "login":
        return "site.branding.login.logo.description";
      case "favicon":
        return "site.branding.favicon.description";
      default:
        return "";
    }
  };

  const getUploadButtonKey = () => {
    switch (type) {
      case "header":
        return "site.branding.upload.header.logo";
      case "login":
        return "site.branding.upload.login.logo";
      case "favicon":
        return "site.branding.upload.favicon";
      default:
        return "site.branding.upload.logo";
    }
  };

  const getRemoveButtonKey = () => {
    switch (type) {
      case "header":
        return "site.branding.remove.header.logo";
      case "login":
        return "site.branding.remove.login.logo";
      case "favicon":
        return "site.branding.remove.favicon";
      default:
        return "site.branding.remove.logo";
    }
  };

  return (
    <article className={`branding-logo-card branding-logo-card--${type}`}>
      <header>
        <span className="branding-logo-card__type" aria-hidden="true">
          {type === "favicon" ? "16 × 16" : type === "header" ? "TOP" : "LOGIN"}
        </span>
        <div>
          <h3>
            <FormattedMessage id={getTitleKey()} />
          </h3>
          {getDescriptionKey() && (
            <p>
              <FormattedMessage id={getDescriptionKey()} />
            </p>
          )}
        </div>
      </header>

      {error && (
        <InlineNotification
          kind="error"
          title={intl.formatMessage({ id: "error.title" })}
          subtitle={error}
          onClose={() => setError(null)}
        />
      )}

      {type === "login" && onUseHeaderLogoChange && (
        <div className="branding-logo-card__reuse">
          <Checkbox
            id="use-header-logo-for-login"
            labelText={intl.formatMessage({
              id: "site.branding.use.header.logo.for.login",
            })}
            checked={useHeaderLogoForLogin}
            onChange={(_event, { checked }) =>
              onUseHeaderLogoChange(Boolean(checked))
            }
          />
        </div>
      )}

      <div className="branding-logo-card__preview">
        {preview && !(type === "login" && useHeaderLogoForLogin) ? (
          <img src={preview} alt={intl.formatMessage({ id: getTitleKey() })} />
        ) : (
          <span>
            <FormattedMessage
              id={
                type === "login" && useHeaderLogoForLogin
                  ? "site.branding.login.using.header.logo"
                  : "site.branding.no.logo"
              }
            />
          </span>
        )}
      </div>

      {!(type === "login" && useHeaderLogoForLogin) && (
        <div className="branding-logo-card__upload">
          <FileUploader
            buttonLabel={intl.formatMessage({ id: getUploadButtonKey() })}
            iconDescription={intl.formatMessage({ id: getUploadButtonKey() })}
            filenameStatus={file ? "complete" : "edit"}
            accept={["image/png", "image/svg+xml", "image/jpeg", "image/jpg"]}
            multiple={false}
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <p>
            <FormattedMessage id="site.branding.formats" />
          </p>
        </div>
      )}

      {preview && !(type === "login" && useHeaderLogoForLogin) && (
        <Button
          className="branding-logo-card__remove"
          data-testid="remove-logo-button"
          kind="danger--ghost"
          size="sm"
          renderIcon={TrashCan}
          onClick={handleRemove}
        >
          <FormattedMessage id={getRemoveButtonKey()} />
        </Button>
      )}

      {file && preview?.startsWith("data:") && (
        <p className="branding-logo-card__pending">
          <FormattedMessage id="site.branding.file.pending" />
        </p>
      )}

      <Modal
        open={showRemoveConfirm}
        modalHeading={intl.formatMessage({
          id: "site.branding.confirm.remove",
        })}
        primaryButtonText={intl.formatMessage({
          id: "label.button.remove",
        })}
        secondaryButtonText={intl.formatMessage({
          id: "label.button.cancel",
        })}
        onRequestClose={cancelRemove}
        onRequestSubmit={confirmRemove}
        danger
      >
        <p>
          {intl.formatMessage({
            id: "site.branding.confirm.remove.message",
          })}
        </p>
      </Modal>
    </article>
  );
});

export default LogoUploadSection;
