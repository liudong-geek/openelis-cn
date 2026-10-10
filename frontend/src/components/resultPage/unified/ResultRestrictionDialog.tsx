import React, { useEffect } from "react";
import { Button, InlineNotification, Modal } from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import {
  RestrictionIdentity,
  intakeHandoffPath,
} from "./resultRestrictionHandoff";
import ResultRestrictionFacts from "./ResultRestrictionFacts";
import { useResultRestriction } from "./useResultRestriction";
import "./result-restriction.scss";
export default function ResultRestrictionDialog({
  identity,
  returnPath,
  scopeToken,
  enabled,
  onClose,
}: {
  identity: RestrictionIdentity;
  returnPath: string;
  scopeToken: string;
  enabled: boolean;
  onClose: () => void;
}) {
  const intl = useIntl(),
    history = useHistory();
  const t = (key: string) =>
    intl.formatMessage({ id: `results.restriction.${key}` });
  const read = useResultRestriction(scopeToken, enabled),
    key = JSON.stringify(identity);
  useEffect(() => {
    void read.read(identity);
  }, [key, scopeToken, enabled]);
  const openIntake = async () => {
    const fresh = await read.read(identity);
    if (fresh?.canOpenIntake && read.isCurrent())
      history.push(intakeHandoffPath(identity, returnPath));
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading={t("title")}
      onRequestClose={() => {
        read.invalidate();
        onClose();
      }}
    >
      {read.phase === "loading" && <p role="status">{t("loading")}</p>}
      {read.error && (
        <InlineNotification
          hideCloseButton
          kind="error"
          title={t(`error.${read.error}`)}
        />
      )}
      {read.data && <ResultRestrictionFacts data={read.data} />}
      {read.data?.canOpenIntake && (
        <Button
          onClick={openIntake}
          disabled={!enabled || read.phase === "loading"}
        >
          {t("openIntake")}
        </Button>
      )}
      {read.phase === "error" && (
        <Button
          kind="tertiary"
          onClick={() => void read.read(identity)}
          disabled={!enabled}
        >
          {t("retry")}
        </Button>
      )}
      {!enabled && <p role="status">{t("contextChanged")}</p>}
    </Modal>
  );
}
