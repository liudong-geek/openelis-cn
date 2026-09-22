import React, { useState, useContext, useRef, useLayoutEffect } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { useIntl } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import ESignatureModal from "./ESignatureModal";
import { SignatureMeaning, isEsigEnabled } from "./api";

/**
 * ESignatureButton - A reusable button component that triggers the electronic signature ceremony.
 *
 * This component abstracts the e-signature flow for use across different notebooks and pages.
 * It handles checking if e-signatures are enabled and manages the modal state internally.
 *
 * Usage:
 * ```jsx
 * <ESignatureButton
 *   meaning="AUTHORED"
 *   context="Sign 3 result(s) as authored"
 *   recordType="RESULT"
 *   recordId={123}
 *   onSign={(signature) => handleResultSigned(signature)}
 *   label="Save"
 * />
 * ```
 *
 * Props:
 * - meaning: string - The signature meaning (AUTHORED, VALIDATED_AND_RELEASED, REJECTED)
 * - context: string - Description of what is being signed (displayed in modal)
 * - recordType: string - The type of record being signed (e.g., "RESULT", "ANALYSIS")
 * - recordId: number - The ID of the record being signed
 * - onSign: function(signature) - Called when signature is successfully executed
 * - onCancel: function - Called when user cancels the signature (optional)
 * - onBeforeSign: function - Called before the signature modal opens (optional, use to close parent modals)
 * - label: string - Button label (optional, defaults to "Sign")
 * - kind: string - Carbon button kind (optional, defaults to "primary")
 * - size: string - Carbon button size (optional)
 * - disabled: boolean - Whether the button is disabled (optional)
 * - style: object - Custom styles for the button (optional)
 * - className: string - Custom CSS class (optional)
 * - children: node - Custom button content (optional, overrides label)
 * - skipEsigCheck: boolean - Skip checking if e-sig is enabled (optional, for testing)
 *
 * @param {{
 *   meaning: string,
 *   context: string,
 *   recordType: string,
 *   recordId: string | number,
 *   onSign: (signature: unknown) => void | Promise<void>,
 *   onCancel?: () => void,
 *   onBeforeSign?: () => void,
 *   label?: import("react").ReactNode,
 *   kind?: import("react").ComponentProps<typeof Button>["kind"],
 *   size?: import("react").ComponentProps<typeof Button>["size"],
 *   disabled?: boolean,
 *   style?: import("react").CSSProperties,
 *   className?: string,
 *   children?: import("react").ReactNode,
 *   skipEsigCheck?: boolean,
 *   signatureApi?: import("../resultPage/unified/resultSignatureApi").ResultSignatureApi
 * }} props
 */
const ESignatureButton = ({
  meaning,
  context,
  recordType,
  recordId,
  onSign,
  onCancel,
  onBeforeSign,
  label,
  kind = "primary",
  size,
  disabled = false,
  style,
  className,
  children,
  skipEsigCheck = false,
  signatureApi = /** @type {import("../resultPage/unified/resultSignatureApi").ResultSignatureApi | undefined} */ (
    undefined
  ),
}) => {
  const intl = useIntl();
  const { userSessionDetails } = useContext(UserSessionDetailsContext);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEsigEnabledState, setIsEsigEnabledState] = useState(null);
  const [isCheckingEsig, setIsCheckingEsig] = useState(false);
  const [injectedError, setInjectedError] = useState(null);
  const ceremony = useRef(null);
  const mounted = useRef(true);

  useLayoutEffect(
    () => () => {
      mounted.current = false;
      ceremony.current?.api.dispose();
      ceremony.current = null;
    },
    [],
  );

  // An injected capability belongs to this click, not a later parent render.
  const handleInjectedClick = async () => {
    if (ceremony.current || disabled) return;
    const fixed = {
      api: signatureApi,
      meaning,
      context,
      recordType,
      recordId,
      onSign,
      onCancel,
      onBeforeSign,
    };
    ceremony.current = fixed;
    setInjectedError(null);
    setIsCheckingEsig(true);
    try {
      fixed.api.assertCurrent();
      const result = await fixed.api.isEsigEnabled();
      fixed.api.assertCurrent();
      if (!mounted.current || ceremony.current !== fixed) return;
      if (typeof result?.enabled !== "boolean") throw new Error();
      if (result.enabled === false) {
        fixed.onSign?.(null);
        ceremony.current = null;
        return;
      }
      fixed.onBeforeSign?.();
      fixed.api.assertCurrent();
      if (mounted.current && ceremony.current === fixed) setIsModalOpen(true);
    } catch (error) {
      if (mounted.current && ceremony.current === fixed) {
        setInjectedError(
          intl.formatMessage({
            id: error.messageId || "esig.error.loadingStatus",
          }),
        );
        ceremony.current = null;
      }
    } finally {
      if (mounted.current) setIsCheckingEsig(false);
    }
  };

  // Default label based on meaning
  const getDefaultLabel = () => {
    switch (meaning) {
      case SignatureMeaning.AUTHORED:
        return intl.formatMessage({
          id: "esig.button.saveAndSign",
          defaultMessage: "Save",
        });
      case SignatureMeaning.VALIDATED_AND_RELEASED:
        return intl.formatMessage({
          id: "esig.button.validate",
          defaultMessage: "Validate",
        });
      case SignatureMeaning.REJECTED:
        return intl.formatMessage({
          id: "esig.button.reject",
          defaultMessage: "Reject",
        });
      default:
        return intl.formatMessage({
          id: "esig.button.sign",
          defaultMessage: "Sign",
        });
    }
  };

  const buttonLabel = label || getDefaultLabel();

  const handleClick = async () => {
    if (signatureApi) return handleInjectedClick();
    // Check if e-signatures are enabled (only once)
    if (!skipEsigCheck && isEsigEnabledState === null) {
      setIsCheckingEsig(true);
      try {
        const result = await isEsigEnabled();
        if (typeof result?.enabled !== "boolean") {
          throw new Error("电子签名开关响应无效");
        }
        setIsEsigEnabledState(result.enabled);

        if (result.enabled === false) {
          // E-signatures disabled - call onSign directly without modal
          // This allows the action to proceed without signature requirement
          if (onSign) {
            onSign(null);
          }
          return;
        }
      } catch (error) {
        // On error, assume e-signatures are enabled for safety
        setIsEsigEnabledState(true);
      } finally {
        setIsCheckingEsig(false);
      }
    }

    // If we already know e-sig is disabled, proceed without modal
    if (isEsigEnabledState === false) {
      if (onSign) {
        onSign(null);
      }
      return;
    }

    // Call onBeforeSign callback (e.g., to close parent modals before e-sig modal opens)
    if (onBeforeSign) {
      onBeforeSign();
    }

    // Small delay to allow parent modal to close before opening e-sig modal
    // This prevents the visual "stacking" of modals
    setTimeout(() => {
      setIsModalOpen(true);
    }, 50);
  };

  const handleModalClose = () => {
    if (ceremony.current) {
      const fixed = ceremony.current;
      ceremony.current = null;
      fixed.api.dispose();
      setIsModalOpen(false);
      fixed.onCancel?.();
      return;
    }
    setIsModalOpen(false);
    if (onCancel) {
      onCancel();
    }
  };

  const handleSignatureSuccess = (signature) => {
    if (ceremony.current) {
      const fixed = ceremony.current;
      fixed.api.assertCurrent();
      ceremony.current = null;
      setIsModalOpen(false);
      fixed.onSign?.(signature);
      return;
    }
    setIsModalOpen(false);
    if (onSign) {
      onSign(signature);
    }
  };

  // Check if user is logged in
  const isLoggedIn = !!userSessionDetails?.userId;

  return (
    <>
      <Button
        kind={kind}
        size={size}
        disabled={
          disabled ||
          !isLoggedIn ||
          isCheckingEsig ||
          (signatureApi && isModalOpen)
        }
        onClick={handleClick}
        style={style}
        className={className}
      >
        {children || buttonLabel}
      </Button>

      {injectedError && (
        <InlineNotification
          kind="error"
          title={intl.formatMessage({ id: "esig.error.title" })}
          subtitle={injectedError}
          lowContrast
          hideCloseButton
        />
      )}

      <ESignatureModal
        open={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleSignatureSuccess}
        meaning={ceremony.current?.meaning ?? meaning}
        context={ceremony.current?.context ?? context}
        recordType={ceremony.current?.recordType ?? recordType}
        recordId={ceremony.current?.recordId ?? recordId}
        signatureApi={ceremony.current?.api}
      />
    </>
  );
};

// Export SignatureMeaning for convenience
export { SignatureMeaning };

export default ESignatureButton;
