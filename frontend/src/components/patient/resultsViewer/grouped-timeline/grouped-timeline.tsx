import React, { useContext } from "react";
import { useIntl, type IntlShape } from "react-intl";
import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Button,
} from "@carbon/react";
import { ChartLine } from "@carbon/react/icons";
import { EmptyState } from "../commons";
import { navigate } from "../commons/framework/navigation";
import FilterContext from "../filter/filter-context";

// Map an observation interpretation to a Carbon Tag color so abnormal /
// high / low / critical results stand out without leaning on custom CSS.
export function interpretationToTagType(
  interp?: string,
): "red" | "purple" | "green" | "magenta" | "gray" {
  const i = (interp || "").toUpperCase();
  if (i.includes("CRITICAL")) return "red";
  if (i.includes("HIGH")) return "red";
  if (i.includes("LOW")) return "purple";
  if (i === "NORMAL") return "green";
  if (i.includes("ABNORMAL")) return "magenta";
  return "gray";
}

function formatDateHeader(iso: string, intl: IntlShape): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return intl.formatDate(d, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const GroupedTimeline = () => {
  const { activeTests, timelineData, checkboxes, someChecked } =
    useContext(FilterContext);
  const intl = useIntl();

  if (!activeTests || !timelineData || !timelineData.loaded) return null;

  const {
    data: {
      parsedTime: { sortedTimes = [] } = { sortedTimes: [] },
      rowData = [],
    },
  } = timelineData;

  const visibleRows: any[] = !someChecked
    ? rowData
    : (rowData || []).filter((row: any) => checkboxes[row.flatName]);

  if (!visibleRows.length) {
    return (
      <EmptyState
        displayText={intl.formatMessage({
          id: "patient.resultsViewer.timeline.data",
        })}
        headerTitle={intl.formatMessage({
          id: "patient.resultsViewer.timeline.title",
        })}
      />
    );
  }

  // Static "Test" column + one column per sorted date (desc). The matrix
  // shape is positional: row.entries[i] aligns with sortedTimes[i].
  const headers = [
    {
      key: "test",
      header: intl.formatMessage({
        id: "patient.resultsViewer.timeline.test",
      }),
    },
    ...sortedTimes.map((time: string, i: number) => ({
      key: `d${i}`,
      header: formatDateHeader(time, intl),
    })),
  ];

  const rows = visibleRows.map((row: any, ri: number) => {
    // Always show units when present, even when no reference range exists —
    // units are independent context that should not be suppressed by a
    // missing range (e.g., qualitative results with a unit but no range).
    const rangeAndUnits = [row.range, row.units].filter(Boolean).join(" ");
    const rangeSuffix = rangeAndUnits ? ` (${rangeAndUnits})` : "";
    const entries = row.entries || [];
    const base: any = {
      id: row.flatName ?? `row-${ri}`,
      test: {
        label: `${row.display}${rangeSuffix}`,
        conceptUuid: row.conceptUuid,
        hasNumericResult: entries.some((entry: any) => {
          const rawValue = String(entry?.value ?? "").trim();
          return rawValue !== "" && Number.isFinite(Number(rawValue));
        }),
      },
    };
    entries.forEach((entry: any, i: number) => {
      const hasLowNormal =
        entry?.lowNormal !== null && entry?.lowNormal !== undefined;
      const hasHighNormal =
        entry?.hiNormal !== null && entry?.hiNormal !== undefined;
      const observationRange =
        hasLowNormal || hasHighNormal
          ? `${hasLowNormal ? entry.lowNormal : "—"} – ${
              hasHighNormal ? entry.hiNormal : "—"
            }`
          : "";
      base[`d${i}`] = entry
        ? {
            value: String(entry.value ?? entry.rawValue ?? ""),
            interpretation: entry.interpretation,
            // The backend only keeps node-level metadata when every historic
            // observation agrees. Otherwise show the metadata beside the
            // corresponding result so ranges are never applied across dates.
            units: row.units ? "" : entry.units || "",
            range: row.range ? "" : observationRange,
          }
        : null;
    });
    return base;
  });

  return (
    <DataTable rows={rows} headers={headers}>
      {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
        <TableContainer>
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((h: any) => (
                  <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                    {h.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow key={row.id} {...getRowProps({ row })}>
                  {row.cells.map((cell: any) => {
                    if (cell.info.header === "test") {
                      const test = cell.value;
                      return (
                        <TableCell key={cell.id}>
                          <div>
                            <span>{test.label}</span>
                            {test.conceptUuid && test.hasNumericResult && (
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={ChartLine}
                                onClick={() =>
                                  navigate({
                                    to: `${window.location.pathname}${window.location.search}#trendline/${encodeURIComponent(
                                      test.conceptUuid,
                                    )}`,
                                  })
                                }
                              >
                                {intl.formatMessage({
                                  id: "patient.resultsViewer.trend.view",
                                  defaultMessage: "View trend",
                                })}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      );
                    }
                    const v = cell.value;
                    if (!v) return <TableCell key={cell.id}>—</TableCell>;
                    const tagType = interpretationToTagType(v.interpretation);
                    const displayValue =
                      tagType === "gray"
                        ? `${v.value} · ${intl.formatMessage({
                            id: "patient.resultsViewer.interpretation.notAssessed",
                            defaultMessage: "Not assessed",
                          })}`
                        : v.value;
                    const valueWithUnits = [displayValue, v.units]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <TableCell key={cell.id}>
                        <Tag type={tagType} size="sm">
                          {valueWithUnits}
                        </Tag>
                        {v.range && (
                          <div>
                            {intl.formatMessage({ id: "label.results.range" })}:{" "}
                            {v.range}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
};

export default GroupedTimeline;
