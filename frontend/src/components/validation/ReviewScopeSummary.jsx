import React from "react";
import { Tag } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { parseReviewQuerySummary } from "./reviewQuerySummary";

export default function ReviewScopeSummary({ results, queryState }) {
  const intl = useIntl();
  if (queryState.phase !== "ready") return null;
  const summary = parseReviewQuerySummary(results.summary, queryState.scope);
  return (
    <section
      className="validation-query-summary"
      aria-labelledby="validation-query-summary-title"
    >
      <h3 id="validation-query-summary-title">
        <FormattedMessage id={`validation.summary.${queryState.scope}`} />
      </h3>
      {summary && summary.state !== "unqueried" ? (
        <>
          <div className="validation-query-summary__counts">
            {[
              ["analysisCount", "analyses"],
              ["accessionCount", "accessions"],
              ["displayRowCount", "rows"],
              ["qcBlockedAnalysisCount", "qcBlocked"],
            ].map(
              ([key, label]) =>
                summary[key] !== null && (
                  <Tag
                    key={key}
                    type={
                      key === "qcBlockedAnalysisCount" ? "warm-gray" : "blue"
                    }
                  >
                    <FormattedMessage
                      id={`validation.summary.${label}`}
                      values={{ count: summary[key] }}
                    />
                  </Tag>
                ),
            )}
          </div>
          {summary.state === "partial" && (
            <p>
              <FormattedMessage id="validation.summary.partial" />
            </p>
          )}
          <p>
            <FormattedMessage
              id="validation.summary.snapshot"
              values={{
                time: intl.formatDate(summary.generatedAt, {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
              }}
            />
          </p>
          <p>
            <FormattedMessage id="validation.summary.qcHelp" />
          </p>
        </>
      ) : (
        <p>
          <FormattedMessage id="validation.summary.unavailable" />
        </p>
      )}
    </section>
  );
}
