import React, { useState } from "react";
import { Button, Modal } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory, useLocation } from "react-router-dom";
import { listReturnLocation } from "./listWorkspace";

export default function ListReturnButton({ fallback, confirmLeave = false }) {
  const history = useHistory();
  const location = useLocation();
  const intl = useIntl();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const returnToList = () => {
    setConfirmOpen(false);
    history.push(listReturnLocation(location.state, fallback));
  };
  return (
    <>
      <Button
        className="list-return-button"
        kind="ghost"
        size="sm"
        renderIcon={ArrowLeft}
        onClick={() => (confirmLeave ? setConfirmOpen(true) : returnToList())}
      >
        <FormattedMessage id="button.back" />
      </Button>
      {confirmOpen && (
        <Modal
          open
          modalHeading={intl.formatMessage({ id: "workspace.leave.title" })}
          primaryButtonText={intl.formatMessage({
            id: "workspace.leave.confirm",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "workspace.leave.cancel",
          })}
          closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
          onRequestClose={() => setConfirmOpen(false)}
          onRequestSubmit={returnToList}
        >
          <p>
            <FormattedMessage id="workspace.leave.helper" />
          </p>
        </Modal>
      )}
    </>
  );
}
