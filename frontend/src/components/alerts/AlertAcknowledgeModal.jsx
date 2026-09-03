import React, { useState } from "react";
import { Modal, TextArea } from "@carbon/react";
import { useIntl } from "react-intl";
import { formatAlertMessage } from "./alertLocalization";

const AlertAcknowledgeModal = ({ open, alert, onClose, onSubmit }) => {
  const intl = useIntl();
  const [comment, setComment] = useState("");

  if (!open || !alert) return null;

  const isCritical = alert.severity === "CRITICAL";

  const handleSubmit = () => {
    if (isCritical && !comment.trim()) {
      return;
    }
    onSubmit(alert.id, comment);
    setComment("");
  };

  const handleClose = () => {
    setComment("");
    onClose();
  };

  return (
    <Modal
      open={open}
      closeButtonLabel={intl.formatMessage({ id: "button.close" })}
      modalHeading={intl.formatMessage({ id: "alerts.acknowledge.title" })}
      primaryButtonText={intl.formatMessage({
        id: "alerts.acknowledge.button",
      })}
      secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
      onRequestClose={handleClose}
      onRequestSubmit={handleSubmit}
      primaryButtonDisabled={isCritical && !comment.trim()}
    >
      <p style={{ marginBottom: "1rem" }}>{formatAlertMessage(alert, intl)}</p>
      {isCritical && (
        <p
          style={{
            marginBottom: "0.5rem",
            color: "#da1e28",
            fontWeight: "bold",
          }}
        >
          {intl.formatMessage({ id: "alerts.acknowledge.comment.required" })}
        </p>
      )}
      <TextArea
        id="acknowledge-comment"
        labelText={intl.formatMessage({ id: "alerts.acknowledge.comment" })}
        placeholder={intl.formatMessage({
          id: "alerts.acknowledge.comment.placeholder",
        })}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
      />
    </Modal>
  );
};

export default AlertAcknowledgeModal;
