import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import ReportNonConformingEvent from "./ReportNonConformingEvent";
import "../../admin/AdminModal.css";

export const NceRegistrationModal = ({
  onClose,
  onSaved,
  onScopeUnavailable,
  resultRow = null,
}) => {
  const intl = useIntl(),
    history = useHistory();
  const formState = useRef({ dirty: false, busy: false, unknown: false });
  const [discard, setDiscard] = useState(false),
    [blocked, setBlocked] = useState(false);
  const discardLauncher = useRef(null);
  useEffect(() => {
    if (discard) return;
    const launcher = discardLauncher.current;
    discardLauncher.current = null;
    if (launcher?.isConnected) launcher.focus();
  }, [discard]);
  const close = (event) => {
    if (event?.key === "Escape") {
      const modals = document.querySelectorAll(".cds--modal.is-visible");
      const top = modals[modals.length - 1];
      if (top && !top.classList.contains("nce-registration-modal"))
        return false;
    }
    if (discard) return false;
    if (formState.current.busy || formState.current.unknown) {
      setBlocked(true);
      return false;
    }
    if (formState.current.dirty) {
      discardLauncher.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setDiscard(true);
    } else onClose();
    return false;
  };
  useEffect(() => {
    const unload = (event) => {
      if (
        formState.current.dirty ||
        formState.current.busy ||
        formState.current.unknown
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    const unblock = history.block(() => {
      if (formState.current.busy || formState.current.unknown) {
        setBlocked(true);
        return false;
      }
      if (formState.current.dirty) {
        discardLauncher.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setDiscard(true);
        return false;
      }
      return undefined;
    });
    return () => {
      window.removeEventListener("beforeunload", unload);
      unblock();
    };
  }, [history]);
  const t = (id) => intl.formatMessage({ id });
  return (
    <>
      <ComposedModal
        open
        size="lg"
        preventCloseOnClickOutside
        className="oe-admin-modal oe-admin-modal--large nce-registration-modal"
        onClose={close}
        selectorsFloatingMenus={[".nce-discard-confirmation"]}
        selectorPrimaryFocus=".cds--modal-close"
        aria-label={t("nce.form.title")}
      >
        <ModalHeader
          title={t("nce.form.title")}
          label={t("nce.form.subtitle")}
          iconDescription={t("label.button.close")}
          closeModal={close}
        />
        <ModalBody>
          {blocked && (
            <InlineNotification
              kind="warning"
              hideCloseButton
              title={t("nce.workspace.closeBlocked")}
            />
          )}
          <ReportNonConformingEvent
            resultRow={resultRow}
            onScopeUnavailable={onScopeUnavailable}
            onCancel={close}
            onSaved={(receipt) => {
              formState.current = { dirty: false, busy: false, unknown: false };
              onSaved(receipt);
            }}
            onStateChange={(value) => {
              formState.current = value;
            }}
          />
        </ModalBody>
      </ComposedModal>
      {discard && (
        <ComposedModal
          open
          preventCloseOnClickOutside
          className="oe-admin-modal nce-discard-confirmation"
          selectorPrimaryFocus=".cds--btn--secondary"
          onClose={() => {
            setDiscard(false);
            return false;
          }}
          aria-label={t("nce.workspace.discardTitle")}
        >
          <ModalHeader
            title={t("nce.workspace.discardTitle")}
            closeModal={() => setDiscard(false)}
            iconDescription={t("label.button.close")}
          />
          <ModalBody>
            <p>{t("nce.workspace.discardBody")}</p>
          </ModalBody>
          <ModalFooter>
            <Button kind="secondary" onClick={() => setDiscard(false)}>
              {t("nce.workspace.keepEditing")}
            </Button>
            <Button
              kind="danger"
              onClick={() => {
                formState.current = {
                  dirty: false,
                  busy: false,
                  unknown: false,
                };
                onClose();
              }}
            >
              {t("nce.workspace.discard")}
            </Button>
          </ModalFooter>
        </ComposedModal>
      )}
    </>
  );
};
export default NceRegistrationModal;
