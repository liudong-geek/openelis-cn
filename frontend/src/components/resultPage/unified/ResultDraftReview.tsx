import React, { useState } from "react";
import { Button, Column, Grid, Modal, Tag, Tile } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import type { EntryDraft, EntryRow } from "./resultEntryState";
import { canResumeDraft } from "./resultEntryState";
import "./result-draft-review.scss";

interface Props {
  drafts: [string, EntryDraft][];
  currentRows: EntryRow[];
  enabled: boolean;
  onResume: (key: string) => void;
  onDiscard: (key: string) => void;
  displayValue: (row: EntryRow) => string;
  rowKey: (row: EntryRow) => string;
}
export default function ResultDraftReview({
  drafts,
  currentRows,
  enabled,
  onResume,
  onDiscard,
  displayValue,
  rowKey,
}: Props) {
  const intl = useIntl();
  const [discardKey, setDiscardKey] = useState<string | null>(null);
  const discardable = drafts.find(
    ([key, draft]) =>
      key === discardKey &&
      draft.held &&
      ["editing", "rejected"].includes(draft.disposition),
  );
  const visible = drafts.filter(
    ([, draft]) => draft.held || draft.disposition !== "editing",
  );
  if (!visible.length) return null;
  return (
    <section
      className="result-draft-review"
      aria-label={intl.formatMessage({ id: "results.workbench.drafts.title" })}
    >
      <h2>
        <FormattedMessage id="results.workbench.drafts.title" />
      </h2>
      <p>
        <FormattedMessage id="results.workbench.drafts.description" />
      </p>
      {visible.map(([key, draft]) => {
        const current = currentRows.find((row) => rowKey(row) === key);
        return (
          <Tile key={key} className="result-draft-review__item">
            <h3>
              {draft.row.accessionNumber} · {draft.row.testName}
            </h3>
            <Tag
              type={
                draft.disposition === "unknown" ||
                draft.disposition === "pending"
                  ? "magenta"
                  : "blue"
              }
            >
              <FormattedMessage
                id={
                  draft.uncertainOperation === "signature"
                    ? "results.workbench.drafts.signatureUnconfirmed"
                    : draft.disposition === "unknown" ||
                        draft.disposition === "pending"
                      ? "results.workbench.drafts.unconfirmed"
                      : "results.workbench.drafts.unsaved"
                }
              />
            </Tag>
            <Grid condensed>
              <Column sm={4} md={4} lg={8}>
                <dl>
                  <dt>
                    <FormattedMessage id="results.workbench.drafts.localValue" />
                  </dt>
                  <dd>{displayValue(draft.row) || "—"}</dd>
                </dl>
              </Column>
              <Column sm={4} md={4} lg={8}>
                <dl>
                  <dt>
                    <FormattedMessage id="results.workbench.drafts.originalTube" />
                  </dt>
                  <dd>
                    {String(
                      draft.row.sampleItemExternalId ||
                        draft.row.sampleItemId ||
                        "—",
                    )}
                  </dd>
                </dl>
              </Column>
            </Grid>
            {canResumeDraft(draft, current) ? (
              <Button
                kind="tertiary"
                size="sm"
                disabled={!enabled}
                onClick={() => onResume(key)}
              >
                <FormattedMessage id="results.workbench.drafts.resume" />
              </Button>
            ) : (
              <p>
                <FormattedMessage
                  id={
                    draft.uncertainOperation === "signature"
                      ? "results.workbench.drafts.signatureNoRetry"
                      : draft.disposition === "unknown" ||
                          draft.disposition === "pending"
                        ? "results.workbench.drafts.noRetry"
                        : "results.workbench.drafts.changed"
                  }
                />
              </p>
            )}
            {draft.held &&
              ["editing", "rejected"].includes(draft.disposition) && (
                <Button
                  kind="ghost"
                  size="sm"
                  disabled={!enabled}
                  onClick={() => setDiscardKey(key)}
                >
                  <FormattedMessage id="results.workbench.drafts.discard" />
                </Button>
              )}
          </Tile>
        );
      })}
      {discardable && (
        <Modal
          open
          modalHeading={intl.formatMessage({
            id: "results.workbench.drafts.discardConfirm",
          })}
          primaryButtonText={intl.formatMessage({
            id: "results.workbench.drafts.discard",
          })}
          secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
          primaryButtonDisabled={!enabled}
          onRequestClose={() => setDiscardKey(null)}
          onRequestSubmit={() => {
            if (enabled) onDiscard(discardable[0]);
            setDiscardKey(null);
          }}
        >
          <p>
            <FormattedMessage id="results.workbench.drafts.discardDescription" />
          </p>
          <p>
            {discardable[1].row.accessionNumber} · {discardable[1].row.testName}
          </p>
        </Modal>
      )}
    </section>
  );
}
