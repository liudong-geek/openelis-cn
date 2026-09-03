import React from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  Button,
  Pagination,
} from "@carbon/react";
import { useIntl } from "react-intl";
import { formatAlertMessage, formatAlertType } from "./alertLocalization";

const SEVERITY_TAG_MAP = {
  CRITICAL: "red",
  WARNING: "warm-gray",
};

const STATUS_TAG_MAP = {
  OPEN: "red",
  ACKNOWLEDGED: "blue",
  RESOLVED: "green",
};

const AlertsTable = ({
  alerts,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onAcknowledge,
}) => {
  const intl = useIntl();

  const headers = [
    {
      key: "alertType",
      header: intl.formatMessage({ id: "alerts.table.type" }),
    },
    {
      key: "severity",
      header: intl.formatMessage({ id: "alerts.table.severity" }),
    },
    {
      key: "message",
      header: intl.formatMessage({ id: "alerts.table.message" }),
    },
    {
      key: "status",
      header: intl.formatMessage({ id: "alerts.table.status" }),
    },
    {
      key: "startTime",
      header: intl.formatMessage({ id: "alerts.table.created" }),
    },
    {
      key: "actions",
      header: intl.formatMessage({ id: "alerts.table.actions" }),
    },
  ];

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString(intl.locale);
    } catch {
      return intl.formatMessage({ id: "status.unknown" });
    }
  };

  const rows = (alerts || []).map((alert) => ({
    id: String(alert.id),
    alertType: formatAlertType(alert.alertType, intl),
    severity: alert.severity,
    message: formatAlertMessage(alert, intl),
    status: alert.status,
    startTime: formatDate(alert.startTime),
    actions: alert.status === "OPEN" ? "acknowledge" : "",
    _original: alert,
  }));

  return (
    <>
      <DataTable rows={rows} headers={headers}>
        {({
          rows: tableRows,
          headers: tableHeaders,
          getTableProps,
          getHeaderProps,
          getRowProps,
        }) => (
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {tableHeaders.map((header) => (
                  <TableHeader key={header.key} {...getHeaderProps({ header })}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {tableRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={headers.length}>
                    {intl.formatMessage({ id: "alerts.empty" })}
                  </TableCell>
                </TableRow>
              ) : (
                tableRows.map((row) => {
                  const original = (alerts || []).find(
                    (a) => String(a.id) === row.id,
                  );
                  return (
                    <TableRow key={row.id} {...getRowProps({ row })}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === "severity") {
                          const severityMessageId = `alerts.severity.${(cell.value || "").toLowerCase()}`;
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={SEVERITY_TAG_MAP[cell.value] || "gray"}
                                size="sm"
                              >
                                {intl.formatMessage({
                                  id:
                                    severityMessageId in intl.messages
                                      ? severityMessageId
                                      : "status.unknown",
                                })}
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "status") {
                          const statusMessageId = `alerts.status.${(cell.value || "").toLowerCase()}`;
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={STATUS_TAG_MAP[cell.value] || "gray"}
                                size="sm"
                              >
                                {intl.formatMessage({
                                  id:
                                    statusMessageId in intl.messages
                                      ? statusMessageId
                                      : "status.unknown",
                                })}
                              </Tag>
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "actions") {
                          return (
                            <TableCell key={cell.id}>
                              {original && original.status === "OPEN" && (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  onClick={() => onAcknowledge(original)}
                                >
                                  {intl.formatMessage({
                                    id: "alerts.acknowledge.button",
                                  })}
                                </Button>
                              )}
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </DataTable>
      {totalCount > 0 && (
        <Pagination
          backwardText={intl.formatMessage({ id: "pagination.previousPage" })}
          forwardText={intl.formatMessage({ id: "pagination.nextPage" })}
          itemRangeText={(min, max, total) =>
            intl.formatMessage(
              { id: "pagination.item-range" },
              { min, max, total },
            )
          }
          itemsPerPageText={intl.formatMessage({
            id: "pagination.itemsPerPage",
          })}
          pageRangeText={(_current, total) =>
            intl.formatMessage({ id: "pagination.page-range" }, { total })
          }
          pageSelectLabelText={(total) =>
            intl.formatMessage({ id: "pagination.page-select" }, { total })
          }
          pageText={(currentPage) =>
            intl.formatMessage({ id: "pagination.page" }, { page: currentPage })
          }
          totalItems={totalCount}
          page={page + 1}
          pageSize={pageSize}
          pageSizes={[25, 50, 100, 200]}
          onChange={({ page: newPage, pageSize: newPageSize }) => {
            onPageChange(newPage - 1, newPageSize);
          }}
        />
      )}
    </>
  );
};

export default AlertsTable;
