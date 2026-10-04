import React, { useMemo, useState, useRef, useLayoutEffect } from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableSelectRow,
  TableSelectAll,
  TableExpandRow,
  TableExpandedRow,
  TableExpandHeader,
  Tag,
  Button,
  InlineLoading,
  InlineNotification,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@carbon/react";
import { useIntl, FormattedMessage } from "react-intl";
import { Folder, Document, TrashCan, Chemistry } from "@carbon/icons-react";
import { postToOpenElisServerFullResponse } from "../utils/Utils";
import {
  statusPresentation,
  canCancelTest,
  cancellationMatches,
  validSampleId,
} from "./sampleStatus";
import {
  cancellationPendingKey,
  cancellationPending,
  rememberCancellation,
  clearCancellation,
  canceledTestConfirmed,
} from "./sampleCancelPending";
import "../admin/AdminModal.css";

/**
 * SampleResultsTable - Display search results for sample items in a data table.
 *
 * Features:
 * - Carbon DataTable with multi-select capability
 * - Expandable rows to show ordered tests
 * - Parent-child hierarchy indicators
 * - Quantity display with unit of measure
 * - Status visualization with tags
 * - Nesting level indicators
 * - Test cancellation/removal functionality
 * - React Intl for internationalization
 *
 * Props:
 * - sampleItems: Array<SampleItemDTO> - array of sample items to display
 * - onSelectionChange: (selectedIds) => void - callback when selection changes
 * - canCancelTests: explicit current-user cancellation permission from the API
 * - onTestCanceled: (sampleItemId, analysisId, test) => void - apply confirmed returned state
 *
 * Related: Feature 001-sample-management, User Story 1, Task T034
 */
function SampleResultsTable({
  sampleItems = [],
  onSelectionChange,
  canCancelTests = false,
  checkingStatus = false,
  onTestCanceled,
  actorId,
  requestContext,
  onRecheck,
}) {
  const intl = useIntl();

  // Track which tests are being cancelled (loading state)
  const [cancellingTests, setCancellingTests] = useState({});
  const [uncertainTests, setUncertainTests] = useState({});
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelErrorKey, setCancelErrorKey] = useState("");
  const mounted = useRef(true);
  const submitting = useRef(false);
  const current = useRef({
    sampleItems,
    canCancelTests,
    actorId,
    requestContext,
  });
  current.current = { sampleItems, canCancelTests, actorId, requestContext };
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Table headers configuration.
   */
  const headers = useMemo(
    () => [
      {
        key: "sampleAccessionNumber",
        header: intl.formatMessage({
          id: "sample.management.table.header.accessionNumber",
        }),
      },
      {
        key: "externalId",
        header: intl.formatMessage({
          id: "sample.management.table.header.externalId",
        }),
      },
      {
        key: "sampleType",
        header: intl.formatMessage({
          id: "sample.management.table.header.sampleType",
        }),
      },
      {
        key: "quantity",
        header: intl.formatMessage({
          id: "sample.management.table.header.quantity",
        }),
      },
      {
        key: "remainingQuantity",
        header: intl.formatMessage({
          id: "sample.management.table.header.remainingQuantity",
        }),
      },
      {
        key: "status",
        header: intl.formatMessage({
          id: "sample.management.table.header.status",
        }),
      },
      {
        key: "tests",
        header: intl.formatMessage({
          id: "sample.management.table.header.tests",
        }),
      },
      {
        key: "hierarchy",
        header: intl.formatMessage({
          id: "sample.management.table.header.hierarchy",
        }),
      },
    ],
    [intl],
  );

  /**
   * Transform sample items to table rows.
   * Uses effectiveRemainingQuantity from backend (already calculated with fallback logic).
   */
  const rows = useMemo(() => {
    return sampleItems.map((item) => {
      // Backend sends effectiveRemainingQuantity which handles null remainingQuantity
      const displayRemaining = item.effectiveRemainingQuantity;
      const testCount = item.orderedTests ? item.orderedTests.length : 0;

      return {
        id: item.id,
        sampleAccessionNumber: item.sampleAccessionNumber || "-",
        externalId: item.externalId || "-",
        sampleType: item.sampleType || "-",
        quantity: item.quantity
          ? `${item.quantity} ${item.unitOfMeasure || ""}`
          : "-",
        remainingQuantity: displayRemaining
          ? `${displayRemaining} ${item.unitOfMeasure || ""}`
          : "-",
        statusId: item.statusId,
        statusCode: item.statusCode,
        isAliquot: item.isAliquot,
        nestingLevel: item.nestingLevel || 0,
        hasRemainingQuantity: item.hasRemainingQuantity,
        childAliquotCount: item.childAliquots ? item.childAliquots.length : 0,
        parentExternalId: item.parentExternalId,
        orderedTests: item.orderedTests || [],
        testCount: testCount,
        tests: testCount > 0 ? `${testCount}` : "-",
      };
    });
  }, [sampleItems]);

  const message = (id) => intl.formatMessage({ id });
  const pendingKey = (sampleId, analysisId) =>
    cancellationPendingKey(current.current.actorId, sampleId, analysisId);
  const pendingTest = (sampleId, test) => {
    const key = pendingKey(sampleId, test.analysisId);
    return (
      uncertainTests[test.analysisId] ||
      (key && cancellationPending(key) && !canceledTestConfirmed(test))
    );
  };
  const sessionCurrent = () => {
    try {
      return (
        validSampleId(current.current.actorId) &&
        current.current.requestContext?.current?.() === true
      );
    } catch {
      return false;
    }
  };

  const openCancelConfirmation = (sampleId, test) => {
    const sample = current.current.sampleItems.find(
      (item) => item.id === sampleId,
    );
    if (
      submitting.current ||
      !sessionCurrent() ||
      pendingTest(sampleId, test) ||
      !canCancelTest(sample, test, current.current.canCancelTests)
    )
      return;
    setCancelErrorKey("");
    setCancelTarget({
      sampleId,
      test,
      accessionNumber: sample.sampleAccessionNumber,
      externalId: sample.externalId,
    });
  };

  const closeCancelConfirmation = () => {
    if (submitting.current) return false;
    setCancelTarget(null);
    setCancelErrorKey("");
    return true;
  };

  const confirmCancel = () => {
    if (
      !cancelTarget ||
      submitting.current ||
      !sessionCurrent() ||
      pendingTest(cancelTarget.sampleId, cancelTarget.test)
    )
      return;
    const target = cancelTarget;
    const sample = current.current.sampleItems.find(
      (item) => item.id === target.sampleId,
    );
    const test = sample?.orderedTests?.find(
      (entry) => entry.analysisId === target.test.analysisId,
    );
    if (!canCancelTest(sample, test, current.current.canCancelTests)) {
      setCancelErrorKey("sample.management.cancelTest.error.changed");
      return;
    }
    const marker = pendingKey(target.sampleId, test.analysisId);
    const originatingSession = current.current.requestContext;
    try {
      rememberCancellation(marker, originatingSession);
    } catch (_error) {
      setUncertainTests((previous) => ({
        ...previous,
        [test.analysisId]: true,
      }));
      setCancelErrorKey("sample.management.cancelTest.error.unconfirmed");
      return;
    }
    submitting.current = true;
    setCancelErrorKey("");
    setCancellingTests((previous) => ({
      ...previous,
      [test.analysisId]: true,
    }));
    const finishUnconfirmed = () => {
      setUncertainTests((previous) => ({
        ...previous,
        [test.analysisId]: true,
      }));
      setCancelErrorKey("sample.management.cancelTest.error.unconfirmed");
    };
    postToOpenElisServerFullResponse(
      "/rest/sample-management/cancel-test",
      JSON.stringify({
        analysisId: test.analysisId,
        sampleItemId: target.sampleId,
      }),
      async (response) => {
        if (!mounted.current || originatingSession.current() !== true) return;
        try {
          if ([400, 401, 403, 404, 409].includes(response?.status)) {
            let rejected;
            try {
              rejected = await response.json();
            } catch {
              finishUnconfirmed();
              return;
            }
            if (!mounted.current || originatingSession.current() !== true)
              return;
            if (
              !rejected ||
              !(
                typeof rejected.error === "string" ||
                typeof rejected.errorKey === "string" ||
                typeof rejected.messageKey === "string"
              )
            ) {
              finishUnconfirmed();
              return;
            }
            clearCancellation(marker);
            setCancelErrorKey(
              [401, 403].includes(response.status)
                ? "sample.management.cancelTest.error.permission"
                : response.status === 404
                  ? "sample.management.cancelTest.error.missing"
                  : "sample.management.cancelTest.error.changed",
            );
            return;
          }
          if (response?.ok !== true) {
            finishUnconfirmed();
            return;
          }
          const body = await response.json();
          if (!mounted.current || originatingSession.current() !== true) return;
          if (!cancellationMatches(body, target.sampleId, test)) {
            finishUnconfirmed();
            return;
          }
          onTestCanceled?.(target.sampleId, test.analysisId, body.test);
          setCancelTarget(null);
        } catch (_error) {
          if (mounted.current && originatingSession.current() === true)
            finishUnconfirmed();
        } finally {
          if (mounted.current && originatingSession.current() === true) {
            submitting.current = false;
            setCancellingTests((previous) => ({
              ...previous,
              [test.analysisId]: false,
            }));
          }
        }
      },
    );
  };

  const renderStatusTag = (dataTableRow) => {
    const originalRow = rows.find((row) => row.id === dataTableRow.id);
    if (!originalRow) return null;
    const [labelKey, type] = statusPresentation(
      originalRow.statusCode,
      "sample",
    );
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
        <Tag type={type}>{message(labelKey)}</Tag>
        {!originalRow.hasRemainingQuantity && (
          <Tag type="gray">
            {message("sample.management.status.allVolumeDispensed")}
          </Tag>
        )}
      </div>
    );
  };

  /**
   * Render tests count with icon.
   */
  const renderTestsCount = (dataTableRow) => {
    const originalRow = rows.find((r) => r.id === dataTableRow.id);
    if (!originalRow) return null;

    if (originalRow.testCount > 0) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Chemistry size={16} />
          <span>{originalRow.testCount}</span>
        </div>
      );
    }
    return <span style={{ color: "#6f6f6f" }}>-</span>;
  };

  /**
   * Render hierarchy indicator showing parent-child relationships.
   * Finds the original row data to access all properties.
   */
  const renderHierarchyIndicator = (dataTableRow) => {
    // Find the original row data by ID
    const originalRow = rows.find((r) => r.id === dataTableRow.id);
    if (!originalRow) return null;

    const nestingIndent = originalRow.nestingLevel * 16; // 16px per level

    return (
      <div style={{ display: "flex", alignItems: "center" }}>
        {originalRow.nestingLevel > 0 && (
          <span
            style={{ marginLeft: `${nestingIndent}px`, marginRight: "4px" }}
          >
            {"└─"}
          </span>
        )}
        {originalRow.childAliquotCount > 0 ? (
          <Folder size={16} style={{ marginRight: "4px" }} />
        ) : (
          <Document size={16} style={{ marginRight: "4px" }} />
        )}
        {originalRow.isAliquot && originalRow.parentExternalId && (
          <span
            style={{ fontSize: "0.75rem", color: "#6f6f6f", marginLeft: "4px" }}
          >
            {intl.formatMessage(
              { id: "sample.management.hierarchy.aliquotOf" },
              { parent: originalRow.parentExternalId },
            )}
          </span>
        )}
        {originalRow.childAliquotCount > 0 && (
          <span
            style={{ fontSize: "0.75rem", color: "#6f6f6f", marginLeft: "4px" }}
          >
            ({originalRow.childAliquotCount}{" "}
            {intl.formatMessage({
              id: "sample.management.hierarchy.aliquots",
            })}
            )
          </span>
        )}
      </div>
    );
  };

  /**
   * Render expanded row content with test details.
   */
  const renderExpandedContent = (row) => {
    const originalRow = rows.find((r) => r.id === row.id);
    if (!originalRow || originalRow.orderedTests.length === 0) {
      return (
        <div
          style={{
            padding: "1rem",
            color: "#6f6f6f",
            fontStyle: "italic",
          }}
        >
          <FormattedMessage id="sample.management.table.noTests" />
        </div>
      );
    }

    return (
      <div style={{ padding: "1rem" }}>
        <div
          style={{
            fontWeight: "600",
            marginBottom: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Chemistry size={20} />
          <FormattedMessage
            id="sample.management.table.orderedTests"
            values={{ count: originalRow.orderedTests.length }}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "0.5rem",
          }}
        >
          {originalRow.orderedTests.map((test, index) => (
            <div
              key={
                validSampleId(test.analysisId)
                  ? test.analysisId
                  : `invalid-test-${index}`
              }
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.5rem 0.75rem",
                backgroundColor: "#f4f4f4",
                borderRadius: "4px",
                border: "1px solid #e0e0e0",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "500" }}>{test.testName}</div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#6f6f6f",
                    display: "flex",
                    gap: "0.75rem",
                    marginTop: "0.25rem",
                  }}
                >
                  <Tag
                    type={statusPresentation(test.statusCode, "analysis")[1]}
                    size="sm"
                  >
                    {message(
                      statusPresentation(test.statusCode, "analysis")[0],
                    )}
                  </Tag>
                  {test.orderedDate && (
                    <span>
                      <FormattedMessage id="sample.management.table.orderedDate" />
                      : {intl.formatDate(new Date(test.orderedDate))}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ marginLeft: "0.5rem" }}>
                {cancellingTests[test.analysisId] ? (
                  <InlineLoading
                    description={intl.formatMessage({
                      id: "sample.management.table.cancelling",
                    })}
                    status="active"
                  />
                ) : (
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    iconDescription={intl.formatMessage({
                      id: "sample.management.table.cancelTest",
                    })}
                    hasIconOnly
                    onClick={() => openCancelConfirmation(row.id, test)}
                    disabled={
                      !sessionCurrent() ||
                      pendingTest(row.id, test) ||
                      !canCancelTest(originalRow, test, canCancelTests)
                    }
                    tooltipPosition="left"
                  />
                )}
                {(!sessionCurrent() ||
                  !canCancelTest(originalRow, test, canCancelTests)) &&
                  !pendingTest(row.id, test) && (
                    <p style={{ fontSize: "0.75rem", maxWidth: "18rem" }}>
                      {message(
                        checkingStatus
                          ? "sample.management.cancelTest.unavailable.checking"
                          : !sessionCurrent() || canCancelTests !== true
                            ? "sample.management.cancelTest.unavailable.permission"
                            : statusPresentation(
                                  originalRow.statusCode,
                                  "sample",
                                )[0] === "sample.management.status.unconfirmed"
                              ? "sample.management.cancelTest.unavailable.sample"
                              : "sample.management.cancelTest.unavailable.state",
                      )}
                    </p>
                  )}
                {pendingTest(row.id, test) &&
                  !cancellingTests[test.analysisId] && (
                    <div style={{ fontSize: "0.75rem", maxWidth: "18rem" }}>
                      <p role="status">
                        {message(
                          "sample.management.cancelTest.error.unconfirmed",
                        )}
                      </p>
                      {onRecheck && (
                        <Button kind="ghost" size="sm" onClick={onRecheck}>
                          {message("sample.management.cancelTest.recheck")}
                        </Button>
                      )}
                    </div>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (sampleItems.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "#6f6f6f",
        }}
      >
        {intl.formatMessage({ id: "sample.management.table.noResults" })}
      </div>
    );
  }

  return (
    <>
      <DataTable
        rows={rows}
        headers={headers}
        isSortable
        render={({
          rows,
          headers,
          getHeaderProps,
          getRowProps,
          getSelectionProps,
          getTableProps,
          getExpandHeaderProps,
          selectedRows,
          selectRow,
        }) => {
          // Notify parent of selection changes
          const notifySelectionChange = (newSelectedRows) => {
            if (onSelectionChange) {
              onSelectionChange(newSelectedRows.map((r) => r.id));
            }
          };

          return (
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  <TableExpandHeader
                    aria-label={intl.formatMessage({
                      id: "sampleManagement.hierarchy.expand",
                    })}
                    {...getExpandHeaderProps()}
                  />
                  <TableSelectAll
                    {...getSelectionProps()}
                    onSelect={() => {
                      // Toggle select all
                      if (selectedRows.length === rows.length) {
                        // Deselect all
                        rows.forEach((row) => {
                          if (selectedRows.some((r) => r.id === row.id)) {
                            selectRow(row.id);
                          }
                        });
                        notifySelectionChange([]);
                      } else {
                        // Select all
                        rows.forEach((row) => {
                          if (!selectedRows.some((r) => r.id === row.id)) {
                            selectRow(row.id);
                          }
                        });
                        notifySelectionChange(rows);
                      }
                    }}
                  />
                  {headers.map((header) => (
                    <TableHeader
                      key={header.key}
                      {...getHeaderProps({ header })}
                    >
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  // Find original row data for styling and expansion
                  const originalRow = sampleItems.find(
                    (item) => item.id === row.id,
                  );
                  const isAliquotRow = originalRow?.isAliquot;
                  const hasTests =
                    originalRow?.orderedTests &&
                    originalRow.orderedTests.length > 0;

                  return (
                    <React.Fragment key={row.id}>
                      <TableExpandRow
                        {...getRowProps({ row })}
                        style={{
                          // Add subtle left border for aliquots
                          borderLeft: isAliquotRow
                            ? "3px solid #0f62fe"
                            : "none",
                          backgroundColor: isAliquotRow ? "#f0f7ff" : "inherit",
                        }}
                      >
                        <TableSelectRow
                          {...getSelectionProps({ row })}
                          onSelect={() => {
                            selectRow(row.id);
                            // Calculate new selection after toggle
                            const isCurrentlySelected = selectedRows.some(
                              (r) => r.id === row.id,
                            );
                            const newSelection = isCurrentlySelected
                              ? selectedRows.filter((r) => r.id !== row.id)
                              : [...selectedRows, row];
                            notifySelectionChange(newSelection);
                          }}
                        />
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>
                            {cell.info.header === "status"
                              ? renderStatusTag(row)
                              : cell.info.header === "hierarchy"
                                ? renderHierarchyIndicator(row)
                                : cell.info.header === "tests"
                                  ? renderTestsCount(row)
                                  : cell.value}
                          </TableCell>
                        ))}
                      </TableExpandRow>
                      <TableExpandedRow
                        colSpan={headers.length + 2}
                        className="sample-expanded-row"
                        style={{
                          backgroundColor: hasTests ? "#fafafa" : "#fff",
                        }}
                      >
                        {renderExpandedContent(row)}
                      </TableExpandedRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          );
        }}
      />
      {cancelTarget && (
        <ComposedModal
          open
          size="sm"
          className="oe-admin-modal oe-confirm-modal"
          preventCloseOnClickOutside
          onClose={closeCancelConfirmation}
        >
          <ModalHeader
            title={message("sample.management.cancelTest.confirm.title")}
            iconDescription={message("label.button.close")}
          />
          <ModalBody>
            <p className="oe-confirm-modal__message">
              {message("sample.management.cancelTest.confirm.message")}
            </p>
            {cancelTarget && (
              <div className="oe-confirm-modal__subject">
                <p>
                  <strong>{cancelTarget.test.testName}</strong>
                </p>
                <p>
                  {[cancelTarget.accessionNumber, cancelTarget.externalId]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Tag
                  type={
                    statusPresentation(
                      cancelTarget.test.statusCode,
                      "analysis",
                    )[1]
                  }
                  size="sm"
                >
                  {message(
                    statusPresentation(
                      cancelTarget.test.statusCode,
                      "analysis",
                    )[0],
                  )}
                </Tag>
              </div>
            )}
            {cancelErrorKey && (
              <InlineNotification
                role="alert"
                kind={
                  cancelErrorKey.endsWith("unconfirmed") ? "warning" : "error"
                }
                lowContrast
                hideCloseButton
                title={message("sample.management.error.title")}
                subtitle={message(cancelErrorKey)}
              />
            )}
            {cancelErrorKey.endsWith("unconfirmed") && onRecheck && (
              <Button kind="ghost" size="sm" onClick={onRecheck}>
                {message("sample.management.cancelTest.recheck")}
              </Button>
            )}
            {submitting.current && (
              <InlineLoading
                description={message("sample.management.table.cancelling")}
                status="active"
              />
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              kind="secondary"
              data-modal-primary-focus
              disabled={submitting.current}
              onClick={closeCancelConfirmation}
            >
              {message("label.cancel")}
            </Button>
            <Button
              kind="danger"
              dangerDescription={message(
                "sample.management.cancelTest.confirm.danger",
              )}
              aria-label={message(
                "sample.management.cancelTest.confirm.submit",
              )}
              disabled={
                submitting.current ||
                pendingTest(cancelTarget.sampleId, cancelTarget.test)
              }
              onClick={confirmCancel}
            >
              {message("sample.management.cancelTest.confirm.submit")}
            </Button>
          </ModalFooter>
        </ComposedModal>
      )}
    </>
  );
}

export default SampleResultsTable;
