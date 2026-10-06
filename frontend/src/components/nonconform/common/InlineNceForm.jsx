import React from "react";
import NceRegistrationModal from "./NceRegistrationModal";
import "./InlineNceForm.css";

// The existing result entry callback continues only after an authoritative CREATE receipt.
const InlineNceForm = ({ resultRow, onClose, onSubmitSuccess }) => (
  <NceRegistrationModal
    resultRow={resultRow}
    onClose={onClose}
    onSaved={(receipt) => {
      onSubmitSuccess?.(receipt);
      onClose?.();
    }}
  />
);
export default InlineNceForm;
