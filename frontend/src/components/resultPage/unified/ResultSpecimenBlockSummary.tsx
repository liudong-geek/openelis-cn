import React, { useState } from "react";
import { Button, InlineNotification, Tag } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { EntryRow } from "./resultEntryState";
import { specimenSubject } from "./ResultSpecimenQueue";
import { SpecimenBlock } from "./resultSpecimenBlocks";
import "./result-specimen-blocks.scss";

interface Props<T extends EntryRow> {
  summaries: SpecimenBlock<T>[];
  renderSubject: (row: T) => React.ReactNode;
  selected: boolean;
  canLookupOrders: boolean;
  hasDrafts: boolean;
  lookupReady: boolean;
  countsAvailable?: boolean;
  onLookupOrders: () => void;
}

export default function ResultSpecimenBlockSummary<T extends EntryRow>({
  summaries,
  renderSubject,
  selected,
  canLookupOrders,
  hasDrafts,
  lookupReady,
  countsAvailable = true,
  onLookupOrders,
}: Props<T>) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const detailsVisible = selected || expanded;
  if (!summaries.length) return null;
  return (
    <section
      className={`result-specimen-blocks${selected ? " result-specimen-blocks--selected" : ""}`}
      aria-labelledby="result-specimen-blocks-title"
    >
      <div className="result-specimen-blocks__heading">
        <h3 id="result-specimen-blocks-title">
          <FormattedMessage id="results.workbench.blocked.title" />
        </h3>
        {selected && summaries.length === 1 && countsAvailable && (
          <Tag type="warm-gray">
            <FormattedMessage
              id="results.workbench.blocked.affected"
              values={{ count: summaries[0].analysisCount }}
            />
          </Tag>
        )}
        {!selected && (
          <Button
            kind="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls="result-specimen-block-details"
            onClick={() => setExpanded((value) => !value)}
          >
            <FormattedMessage
              id={`results.workbench.blocked.${expanded ? "collapse" : "expand"}`}
            />
          </Button>
        )}
      </div>
      {!selected && (
        <p className="result-specimen-blocks__overview">
          <FormattedMessage id="results.workbench.blocked.overview" />
        </p>
      )}
      {!selected && expanded && (
        <p
          id="result-specimen-block-scroll-hint"
          className="result-specimen-blocks__overview"
        >
          <FormattedMessage id="results.workbench.blocked.scrollHint" />
        </p>
      )}
      <div
        id="result-specimen-block-details"
        className={`result-specimen-blocks__details${selected ? "" : " result-specimen-blocks__details--all"}`}
        hidden={!detailsVisible}
        tabIndex={!selected && expanded ? 0 : undefined}
        aria-describedby={
          !selected && expanded
            ? "result-specimen-block-scroll-hint"
            : undefined
        }
      >
        {summaries.map((summary) => (
          <div
            key={summary.id}
            id={summary.id}
            className="result-specimen-blocks__item"
            role="note"
            tabIndex={-1}
          >
            <div className="result-specimen-blocks__identity">
              {!selected && renderSubject(specimenSubject(summary.group))}
              {countsAvailable && (!selected || summaries.length > 1) && (
                <Tag type="warm-gray">
                  <FormattedMessage
                    id="results.workbench.blocked.affected"
                    values={{ count: summary.analysisCount }}
                  />
                </Tag>
              )}
            </div>
            <InlineNotification
              kind="warning"
              hideCloseButton
              lowContrast
              role="status"
              aria-live="off"
              title={intl.formatMessage({ id: summary.reason })}
            />
          </div>
        ))}
        <div className="result-specimen-blocks__guidance">
          <p>
            <FormattedMessage
              id={
                canLookupOrders
                  ? "results.workbench.blocked.orderLookupHelp"
                  : "results.workbench.blocked.receptionNeeded"
              }
            />
          </p>
          {canLookupOrders && hasDrafts && (
            <p>
              <FormattedMessage id="results.workbench.blocked.preserveDrafts" />
            </p>
          )}
          {canLookupOrders && !hasDrafts && !lookupReady && (
            <p>
              <FormattedMessage id="results.workbench.blocked.lookupUnavailable" />
            </p>
          )}
          {canLookupOrders && !hasDrafts && lookupReady && (
            <Button kind="tertiary" size="sm" onClick={onLookupOrders}>
              <FormattedMessage id="results.workbench.blocked.openOrders" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
