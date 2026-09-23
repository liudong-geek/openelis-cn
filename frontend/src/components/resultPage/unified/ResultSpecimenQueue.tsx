import React from "react";
import { Button, Tag } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { positiveId } from "./resultEntryState";

interface QueueRow {
  analysisId: string;
  sampleItemId?: unknown;
  accessionNumber?: string;
  patientInfo?: string;
  patientName?: string;
  testName?: string;
}

export interface ResultSpecimenGroup<T extends QueueRow> {
  key: string;
  rows: T[];
  analysisCount: number;
}

// Display grouping only. Never infer specimen identity from a patient name or
// printed barcode; missing specimen IDs keep each analysis separate.
export function resultSpecimenKey(row: QueueRow): string {
  return JSON.stringify([
    positiveId(row.sampleItemId) ? "specimen" : "analysis",
    positiveId(row.sampleItemId) ? row.sampleItemId : row.analysisId,
    row.accessionNumber || "",
  ]);
}

export function groupResultSpecimens<T extends QueueRow>(
  rows: T[],
): ResultSpecimenGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = resultSpecimenKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups].map(([key, members]) => ({
    key,
    rows: members,
    analysisCount: new Set(members.map((row) => row.analysisId)).size,
  }));
}

export function specimenSubject<T extends QueueRow>(
  group: ResultSpecimenGroup<T>,
): T {
  // A summary must preserve the strictest identity mask in its source rows.
  return group.rows.some((row) => row.patientInfo?.trim() === "---")
    ? { ...group.rows[0], patientInfo: "---", patientName: "" }
    : group.rows[0];
}

interface Props<T extends QueueRow> {
  groups: ResultSpecimenGroup<T>[];
  selectedKey: string | null;
  disabled: boolean;
  countsAvailable?: boolean;
  draftStates: Map<string, "unsaved" | "unconfirmed">;
  onSelect: (key: string | null) => void;
  renderSubject: (row: T) => React.ReactNode;
}

export default function ResultSpecimenQueue<T extends QueueRow>({
  groups,
  selectedKey,
  disabled,
  countsAvailable = true,
  draftStates,
  onSelect,
  renderSubject,
}: Props<T>) {
  const intl = useIntl();
  return (
    <aside
      className="result-specimen-queue"
      aria-labelledby="result-specimen-queue-title"
    >
      <div className="result-specimen-queue__heading">
        <h2 id="result-specimen-queue-title">
          <FormattedMessage
            id="results.workbench.queue.title"
            defaultMessage="Specimen queue"
          />
        </h2>
        <p>
          <FormattedMessage
            id="results.workbench.queue.subtitle"
            defaultMessage="Select a specimen to focus its test results."
          />
        </p>
      </div>
      <Button
        kind={selectedKey === null ? "primary" : "tertiary"}
        size="sm"
        className="result-specimen-queue__all"
        aria-pressed={selectedKey === null}
        disabled={disabled || groups.length === 0}
        onClick={() => onSelect(null)}
      >
        <FormattedMessage
          id="results.workbench.queue.all"
          defaultMessage="All specimen records"
        />
        {countsAvailable && <span>{groups.length}</span>}
      </Button>
      <ul className="result-specimen-queue__items">
        {groups.map((group) => {
          const draftState = draftStates.get(group.key);
          return (
            <li key={group.key}>
              <Button
                kind="ghost"
                className="result-specimen-queue__item"
                aria-pressed={selectedKey === group.key}
                aria-controls="result-specimen-detail"
                disabled={disabled}
                onClick={() => onSelect(group.key)}
              >
                <span className="result-specimen-queue__identity">
                  {renderSubject(specimenSubject(group))}
                  {!positiveId(group.rows[0].sampleItemId) && (
                    <span className="result-specimen-queue__fallback">
                      {group.rows[0].testName || group.rows[0].analysisId}
                    </span>
                  )}
                </span>
                <span className="result-specimen-queue__meta">
                  {countsAvailable && (
                    <span>
                      {intl.formatMessage(
                        {
                          id: "results.workbench.queue.tests",
                          defaultMessage: "{count} tests",
                        },
                        { count: group.analysisCount },
                      )}
                    </span>
                  )}
                  {draftState && (
                    <Tag
                      type={draftState === "unconfirmed" ? "magenta" : "blue"}
                    >
                      <FormattedMessage
                        id={`results.workbench.drafts.${draftState}`}
                      />
                    </Tag>
                  )}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
