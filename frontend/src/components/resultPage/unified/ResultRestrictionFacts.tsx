import React from "react";
import { InlineNotification, Tag } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { ResultRestriction } from "./resultRestrictionRequest";
import { entryReasons } from "./resultEntryState";
export default function ResultRestrictionFacts({
  data,
}: {
  data: ResultRestriction;
}) {
  const intl = useIntl();
  const t = (key: string) =>
    intl.formatMessage({ id: `results.restriction.${key}` });
  const reason =
    data.blockedReason && entryReasons.has(data.blockedReason)
      ? data.blockedReason
      : "results.workbench.entryUnavailable";
  return (
    <div className="result-restriction-facts">
      <dl className="result-restriction-facts__identity">
        {[
          ["labNumber", data.identity.labNumber],
          ["sampleItem", data.identity.sampleItemId],
          ["analysis", data.identity.analysisId],
        ].map(([key, value]) => (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <dl className="result-restriction-facts__facts">
        {(["specimenStatus", "analysisStatus"] as const).map((key) => {
          const status = data[key];
          return (
            <div key={key}>
              <dt>{t(key)}</dt>
              <dd>
                {status.known &&
                Object.prototype.hasOwnProperty.call(
                  intl.messages,
                  `results.restriction.status.${status.statusType}.${status.statusCode}`,
                )
                  ? intl.formatMessage({
                      id: `results.restriction.status.${status.statusType}.${status.statusCode}`,
                      defaultMessage: status.statusName || t("state.UNKNOWN"),
                    })
                  : t("state.UNKNOWN")}
                {(!status.known ||
                  !Object.prototype.hasOwnProperty.call(
                    intl.messages,
                    `results.restriction.status.${status.statusType}.${status.statusCode}`,
                  )) &&
                  status.statusId && (
                    <span>
                      {t("recordId")} {status.statusId}
                    </span>
                  )}
              </dd>
            </div>
          );
        })}
      </dl>
      {data.blockedReason && (
        <InlineNotification
          hideCloseButton
          lowContrast
          kind="warning"
          title={intl.formatMessage({ id: reason })}
        />
      )}
      <p>{t("factsHelp")}</p>
      <dl className="result-restriction-facts__facts">
        {(["collection", "receipt", "request", "acceptance"] as const).map(
          (key) => {
            const fact = data.facts[key];
            return (
              <div key={key}>
                <dt>{t(`fact.${key}`)}</dt>
                <dd>
                  <Tag
                    type={
                      fact.state === "RECORDED"
                        ? "green"
                        : fact.state === "MISSING"
                          ? "warm-gray"
                          : "magenta"
                    }
                  >
                    {t(`state.${fact.state}`)}
                  </Tag>
                  {fact.value && (
                    <span>
                      {fact.state === "RECORDED"
                        ? `${intl.formatDate(fact.value, { year: "numeric", month: "2-digit", day: "2-digit" })} ${intl.formatTime(fact.value, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}`
                        : fact.value}
                    </span>
                  )}
                  {fact.id && (
                    <span>
                      {t("recordId")} {fact.id}
                    </span>
                  )}
                  {fact.statusCode && (
                    <span>{t(`request.${fact.statusCode}`)}</span>
                  )}
                  {fact.decision && (
                    <span>{t(`decision.${fact.decision}`)}</span>
                  )}
                </dd>
              </div>
            );
          },
        )}
      </dl>
      {data.diagnosticCodes.length > 0 && (
        <ul>
          {data.diagnosticCodes.map((code) => (
            <li key={code}>
              {intl.formatMessage({
                id: `results.restriction.diagnostic.${code}`,
                defaultMessage: t("diagnosticUnknown"),
              })}
            </li>
          ))}
        </ul>
      )}
      {data.warningCodes.length > 0 && <p role="note">{t("warning")}</p>}
      <p>{t("writeBoundary")}</p>
      {!data.canOpenIntake && (
        <p role="status">
          {intl.formatMessage({
            id: `results.restriction.unavailable.${data.actionUnavailableReason}`,
            defaultMessage: t("unavailable"),
          })}
        </p>
      )}
    </div>
  );
}
