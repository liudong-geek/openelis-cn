import React, { useEffect, useRef, useState, useContext } from "react";
import { Button } from "@carbon/react";
import { useIntl } from "react-intl";
import ESignatureModal from "../esignature/ESignatureModal";
import { SignatureMeaning } from "../esignature/ESignatureButton";
import { createResultSignatureApi } from "../resultPage/unified/resultSignatureApi";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { postReviewResults } from "./reviewTransport";

// The modal collects credentials; the server signs and applies the frozen
// decisions in one transaction. There is no preliminary /esig/sign write.
export default function ReviewSubmissionButton({
  queryId,
  prepare,
  isCurrent,
  context,
  disabled,
  onBusy,
  onOutcome,
  onError,
  children,
}) {
  const intl = useIntl();
  const session = useContext(UserSessionDetailsContext);
  const { userSessionDetails = {} } = session;
  const binding = JSON.stringify([
    queryId,
    userSessionDetails,
    session.sessionPhase,
    session.errorLoadingSessionDetails,
    localStorage.getItem("CSRF"),
  ]);
  const current = useRef(binding);
  current.current = binding;
  const currentCheck = useRef(isCurrent);
  currentCheck.current = isCurrent;
  const mounted = useRef(false);
  const ceremony = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ceremony.current?.dispose();
      ceremony.current = null;
    };
  }, []);
  useEffect(() => {
    if (ceremony.current && ceremony.current.binding !== binding) {
      ceremony.current.dispose();
      ceremony.current = null;
      setDialog(null);
      setBusy(false);
      onBusy(false);
    }
  }, [binding]);

  const start = async () => {
    if (!mounted.current || ceremony.current || disabled) return;
    let fixed;
    try {
      const payload = prepare();
      if (!payload) return;
      const csrf = localStorage.getItem("CSRF") || "";
      const guard = () =>
        mounted.current &&
        current.current === binding &&
        localStorage.getItem("CSRF") === csrf &&
        ceremony.current === fixed &&
        currentCheck.current(payload);
      const controller = new AbortController();
      let consumed = false;
      const base = createResultSignatureApi({
        username: userSessionDetails.loginName,
        userId: userSessionDetails.userId,
        recordId: payload.resultList.find(
          (row) => row.isAccepted || row.isRejected,
        )?.analysisId,
        csrf,
        guard,
        onUnknown: () => finish(0),
      });
      const finish = (status) => {
        if (!guard()) return;
        ceremony.current = null;
        setDialog(null);
        setBusy(false);
        base.dispose();
        controller.abort();
        onOutcome(status);
      };
      const submit = (credentials) => {
        base.assertCurrent();
        if (consumed) throw new Error("REVIEW_ALREADY_SUBMITTED");
        if (
          credentials &&
          (credentials.username !== base.username ||
            typeof credentials.password !== "string" ||
            !credentials.password ||
            credentials.password.length > 4096)
        ) {
          throw new Error("INVALID_REVIEW_CREDENTIALS");
        }
        consumed = true;
        return new Promise((resolve, reject) => {
          postReviewResults(
            {
              ...payload,
              ...(credentials
                ? {
                    reviewSignature: {
                      username: credentials.username,
                      password: credentials.password,
                    },
                  }
                : {}),
            },
            (status) => {
              if (!guard()) return reject(new Error("REVIEW_CONTEXT_CHANGED"));
              if (status !== 200) {
                finish(status);
                return reject(new Error("REVIEW_SUBMISSION_FAILED"));
              }
              resolve({ queryId: payload.queryId, status });
            },
            { csrf, signal: controller.signal },
          );
        });
      };
      fixed = {
        binding,
        payload,
        finish,
        dispatched: () => consumed,
        dispose: () => {
          base.dispose();
          controller.abort();
        },
        api: { ...base, executeSignature: submit },
      };
      ceremony.current = fixed;
      setBusy(true);
      onBusy(true);
      const result = await base.isEsigEnabled();
      base.assertCurrent();
      if (result.enabled) setDialog(fixed);
      else {
        await submit();
        finish(200);
      }
    } catch (error) {
      if (fixed && ceremony.current !== fixed) return;
      if (fixed) fixed.dispose();
      ceremony.current = null;
      if (!mounted.current || current.current !== binding) return;
      setDialog(null);
      setBusy(false);
      onBusy(false);
      onError(error.messageId || "validation.query.submitUnconfirmed");
    }
  };
  const cancel = () => {
    const fixed = ceremony.current;
    if (fixed?.dispatched()) {
      fixed.finish(0);
      return;
    }
    ceremony.current = null;
    fixed?.dispose();
    setDialog(null);
    setBusy(false);
    onBusy(false);
  };
  return (
    <>
      <Button
        type="button"
        disabled={disabled || busy}
        onClick={start}
        style={{ marginTop: "16px" }}
      >
        {children}
      </Button>
      {dialog && (
        <ESignatureModal
          open
          onClose={cancel}
          onSuccess={() => dialog.finish(200)}
          signatureApi={dialog.api}
          meaning={SignatureMeaning.VALIDATED_AND_RELEASED}
          meaningLabel={intl.formatMessage({
            id: "validation.review.signMeaning",
          })}
          context={context(dialog.payload)}
          recordType="ANALYSIS"
          recordId={Number(
            dialog.payload.resultList.find(
              (row) => row.isAccepted || row.isRejected,
            ).analysisId,
          )}
          actionLabel={intl.formatMessage({ id: "label.button.validate" })}
        />
      )}
    </>
  );
}
