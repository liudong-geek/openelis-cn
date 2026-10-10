import React, { useContext } from "react";
import { FormattedMessage } from "react-intl";
import { InlineNotification } from "@carbon/react";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";

export default function GlobalAdminConfiguration({ children }) {
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const allowed =
    userSessionDetails?.authenticated === true &&
    Array.isArray(userSessionDetails.roles) &&
    userSessionDetails.roles.some(
      (role) => String(role).trim() === "Global Administrator",
    );
  if (!allowed)
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={<FormattedMessage id="admin.entry.accessDenied.title" />}
        subtitle={<FormattedMessage id="admin.entry.accessDenied.message" />}
      />
    );
  return children;
}
