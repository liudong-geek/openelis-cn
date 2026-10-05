import React, { useEffect, useRef, useState } from "react";
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableExpandHeader,
  TableExpandRow,
  TableExpandedRow,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  Pagination,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { TaskAdd } from "@carbon/icons-react";
import CustomLabNumberInput from "../common/CustomLabNumberInput";
import {
  electronicOrderStatusLabel,
  electronicOrderPriorityLabel,
} from "./electronicOrderLabels";

const UNAVAILABLE_REASONS = new Set([
  "NO_RECEIVE_PERMISSION",
  "NOT_PENDING",
  "UNKNOWN_STATUS",
  "INVALID_IDENTITY",
  "LINKED_LOCAL_ORDER",
  "AMBIGUOUS_EXTERNAL_ID",
  "INCOMPLETE_ORDER_DATA",
]);
const WARNING_CODES = new Set([
  "PATIENT_MISSING",
  "LOCAL_DATA_INCOMPLETE",
  "TASK_DATA_UNAVAILABLE",
  "FHIR_RESOURCE_NOT_FOUND",
  "FHIR_DETAILS_UNAVAILABLE",
  "SOURCE_IDENTITY_MISMATCH",
  "SOURCE_IDENTITY_UNCONFIRMED",
]);

const rowIdentity = (order) =>
  JSON.stringify([
    order.id,
    order.electronicOrderId,
    order.externalOrderId,
    order.statusId,
    order.statusCode,
    order.canReceive,
    order.labNumber,
    order.labNo ?? "",
  ]);

const cancelRequest = (request) => {
  clearTimeout(request.timer);
  request.controller.abort();
};

const patientName = (order) => {
  const first = String(order.patientFirstName ?? "").trim();
  const last = String(order.patientLastName ?? "").trim();
  return /[\u3400-\u9fff]/u.test(`${last}${first}`)
    ? `${last}${first}` || "—"
    : `${first} ${last}`.trim() || "—";
};

const EOrder = ({
  eOrders,
  setEOrders,
  eOrderRef,
  queryState = { phase: "success" },
  onPageChange,
  onReviewOrder,
  readAction,
}) => {
  const intl = useIntl();
  const [rowFeedback, setRowFeedback] = useState({});
  const requests = useRef(new Map());
  const current = useRef();
  current.current = { eOrders, queryState };

  useEffect(() => {
    requests.current.forEach(cancelRequest);
    requests.current.clear();
    setRowFeedback({});
    return () => {
      requests.current.forEach(cancelRequest);
      requests.current.clear();
    };
  }, [queryState.owner, queryState.epoch, queryState.phase]);

  useEffect(() => {
    requests.current.forEach((request, rowId) => {
      const order = eOrders.find((item) => item.id === rowId);
      if (!order || rowIdentity(order) !== request.identity) {
        cancelRequest(request);
        requests.current.delete(rowId);
      }
    });
  }, [eOrders]);

  const canReceive = (order) =>
    Boolean(order) &&
    queryState.phase === "success" &&
    typeof queryState.owner === "string" &&
    queryState.owner.length > 0 &&
    queryState.epoch != null &&
    order.canReceive === true &&
    order.statusCode === "ENTERED" &&
    typeof order.statusId === "string" &&
    order.statusId.trim().length > 0 &&
    typeof order.id === "string" &&
    order.id === order.electronicOrderId &&
    typeof order.externalOrderId === "string" &&
    order.externalOrderId.trim().length > 0 &&
    eOrders.filter((item) => item.id === order.id).length === 1;

  const requestIsCurrent = (request) => {
    const context = current.current;
    const order = context.eOrders.find((item) => item.id === request.rowId);
    return (
      !request.controller.signal.aborted &&
      requests.current.get(request.rowId) === request &&
      context.queryState.phase === "success" &&
      context.queryState.owner === request.owner &&
      context.queryState.epoch === request.epoch &&
      order &&
      rowIdentity(order) === request.identity
    );
  };

  const clearRowRequest = (rowId) => {
    const request = requests.current.get(rowId);
    if (request) cancelRequest(request);
    requests.current.delete(rowId);
  };

  const setFeedback = (rowId, value) =>
    setRowFeedback((previous) => ({ ...previous, [rowId]: value }));

  const changeLabNumber = (order, event, rawValue) => {
    if (!canReceive(order)) return;
    const value = rawValue ?? event?.target?.value ?? "";
    clearRowRequest(order.id);
    setFeedback(order.id, null);
    const identity = rowIdentity(order);
    setEOrders((orders) =>
      orders.map((item) =>
        item.id === order.id && rowIdentity(item) === identity
          ? { ...item, labNo: value }
          : item,
      ),
    );
  };

  const readLabNumber = async (order, kind) => {
    if (
      !canReceive(order) ||
      typeof readAction !== "function" ||
      requests.current.has(order.id)
    )
      return;
    const labNo = order.labNo ?? "";
    if (kind === "validate" && !labNo) return;
    const request = {
      rowId: order.id,
      identity: rowIdentity(order),
      owner: queryState.owner,
      epoch: queryState.epoch,
      controller: new AbortController(),
    };
    requests.current.set(order.id, request);
    setFeedback(order.id, { identity: request.identity, busy: kind });
    request.timer = setTimeout(() => {
      if (requestIsCurrent(request)) {
        setFeedback(order.id, {
          identity: request.identity,
          error:
            kind === "generate"
              ? "eorder.number.generateFailed"
              : "eorder.number.validationFailed",
        });
      }
      if (requests.current.get(order.id) === request)
        requests.current.delete(order.id);
      request.controller.abort();
    }, 20_000);
    const params = new URLSearchParams({
      ignoreYear: "false",
      ignoreUsage: "false",
      field: "labNo",
      accessionNumber: labNo,
    });
    const url =
      kind === "generate"
        ? "/rest/SampleEntryGenerateScanProvider"
        : "/rest/SampleEntryAccessionNumberValidation?" + params.toString();
    try {
      const response = await readAction(
        url,
        request.controller.signal,
        request.owner,
        order,
      );
      if (!requestIsCurrent(request)) return;
      if (
        typeof response?.status !== "boolean" ||
        typeof response.body !== "string"
      )
        throw new Error("invalid-number-response");
      if (kind === "generate") {
        if (!response.status || !response.body.trim())
          throw new Error("number-generation-failed");
        setEOrders((orders) =>
          orders.map((item) =>
            item.id === request.rowId &&
            rowIdentity(item) === request.identity &&
            !request.controller.signal.aborted &&
            current.current.queryState.phase === "success" &&
            current.current.queryState.owner === request.owner &&
            current.current.queryState.epoch === request.epoch
              ? { ...item, labNo: response.body }
              : item,
          ),
        );
        setFeedback(order.id, null);
      } else {
        setFeedback(
          order.id,
          response.status
            ? null
            : {
                identity: request.identity,
                error: "eorder.number.invalid",
              },
        );
      }
    } catch {
      if (requestIsCurrent(request))
        setFeedback(order.id, {
          identity: request.identity,
          error:
            kind === "generate"
              ? "eorder.number.generateFailed"
              : "eorder.number.validationFailed",
        });
    } finally {
      clearTimeout(request.timer);
      if (requests.current.get(order.id) === request)
        requests.current.delete(order.id);
    }
  };

  const reviewOrder = async (order) => {
    if (
      !canReceive(order) ||
      typeof onReviewOrder !== "function" ||
      requests.current.has(order.id)
    )
      return;
    const request = {
      rowId: order.id,
      identity: rowIdentity(order),
      owner: queryState.owner,
      epoch: queryState.epoch,
      controller: new AbortController(),
    };
    requests.current.set(order.id, request);
    setFeedback(order.id, { identity: request.identity, busy: "review" });
    request.timer = setTimeout(() => {
      if (requestIsCurrent(request))
        setFeedback(order.id, {
          identity: request.identity,
          error: "eorder.action.reviewFailed",
        });
      if (requests.current.get(order.id) === request)
        requests.current.delete(order.id);
      request.controller.abort();
    }, 20_000);
    try {
      const result = await onReviewOrder(order, order.labNo ?? "", {
        signal: request.controller.signal,
        owner: request.owner,
        epoch: request.epoch,
      });
      if (requestIsCurrent(request))
        setFeedback(
          order.id,
          result === false
            ? {
                identity: request.identity,
                error: "eorder.action.reviewFailed",
              }
            : null,
        );
    } catch {
      if (requestIsCurrent(request))
        setFeedback(order.id, {
          identity: request.identity,
          error: "eorder.action.reviewFailed",
        });
    } finally {
      clearTimeout(request.timer);
      if (requests.current.get(order.id) === request)
        requests.current.delete(order.id);
    }
  };

  const unavailableMessage = (order) => {
    const reason = UNAVAILABLE_REASONS.has(order.actionUnavailableReason)
      ? order.actionUnavailableReason
      : "UNKNOWN_CAPABILITY";
    // i18n-keys: eorder.actionUnavailable.*
    return intl.formatMessage({ id: `eorder.actionUnavailable.${reason}` });
  };

  const feedbackFor = (order) =>
    rowFeedback[order.id]?.identity === rowIdentity(order)
      ? rowFeedback[order.id]
      : null;

  const renderRowAction = (order) => {
    if (!order) return null;
    const allowed = canReceive(order);
    const feedback = feedbackFor(order);
    const reason = !allowed
      ? unavailableMessage(order)
      : feedback?.error === "eorder.action.reviewFailed"
        ? intl.formatMessage({ id: feedback.error })
        : typeof onReviewOrder !== "function"
          ? unavailableMessage(order)
          : null;
    const reasonId = `eorder-action-reason-${encodeURIComponent(order.id)}`;
    return (
      <div className="eorder-row-action">
        <Button
          type="button"
          kind="primary"
          size="sm"
          renderIcon={TaskAdd}
          aria-label={intl.formatMessage({ id: "eorder.button.reviewReceive" })}
          aria-describedby={reason ? reasonId : undefined}
          title={
            reason ||
            (feedback?.error
              ? intl.formatMessage({ id: feedback.error })
              : intl.formatMessage({ id: "eorder.action.manualSave" }))
          }
          disabled={
            !allowed ||
            Boolean(feedback?.busy) ||
            Boolean(feedback?.error) ||
            typeof onReviewOrder !== "function"
          }
          onClick={() => reviewOrder(order)}
        >
          <FormattedMessage id="eorder.button.reviewReceive" />
        </Button>
        {reason && (
          <span
            id={reasonId}
            className="eorder-row-action__reason"
            role={
              feedback?.error === "eorder.action.reviewFailed"
                ? "alert"
                : undefined
            }
          >
            {reason}
          </span>
        )}
        {feedback?.busy === "review" && (
          <InlineLoading
            description={intl.formatMessage({ id: "eorder.action.reviewing" })}
          />
        )}
      </div>
    );
  };

  const renderExpandedRow = (row) => {
    const order = eOrders.find((item) => item.id === row.id);
    if (!order) return null;
    const allowed = canReceive(order);
    const feedback = feedbackFor(order);
    const busy = Boolean(feedback?.busy);
    const invalid = Boolean(
      feedback?.error && feedback.error !== "eorder.action.reviewFailed",
    );
    return (
      <div className="eorder-row-details">
        {Array.isArray(order.warningCodes) && order.warningCodes.length > 0 && (
          <ul className="eorder-row-details__warnings">
            {[...new Set(order.warningCodes)].map((warning) => {
              const code = WARNING_CODES.has(warning) ? warning : "UNKNOWN";
              // i18n-keys: eorder.warning.*
              return (
                <li key={warning}>
                  {intl.formatMessage({ id: `eorder.warning.${code}` })}
                </li>
              );
            })}
          </ul>
        )}
        <dl className="eorder-row-details__identifiers">
          {[
            ["patientNationalId", "eorder.id.national"],
            ["passportNumber", "eorder.passport.number"],
            ["subjectNumber", "eorder.id.subjectNumber"],
            ["referringLabNumber", "eorder.labnumber.referring"],
            ["labNumber", "eorder.labNumber"],
          ].map(([field, id]) => (
            <div key={field}>
              <dt>{intl.formatMessage({ id })}</dt>
              <dd>{order[field] || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="eorder-row-details__controls">
          <CustomLabNumberInput
            name={`labNo-${order.id}`}
            id={`eorder-labNo-${encodeURIComponent(order.id)}`}
            value={order.labNo ?? ""}
            onBlur={() => readLabNumber(order, "validate")}
            onChange={(event, rawValue) =>
              changeLabNumber(order, event, rawValue)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                readLabNumber(order, "validate");
              }
            }}
            disabled={!allowed || (busy && feedback.busy !== "validate")}
            invalid={invalid}
            invalidText={
              invalid ? intl.formatMessage({ id: feedback.error }) : ""
            }
            labelText={intl.formatMessage({ id: "sample.label.labnumber" })}
            helperText={intl.formatMessage({ id: "label.order.scan.text" })}
            className="inputText"
          />
          <Button
            type="button"
            kind="tertiary"
            size="sm"
            disabled={!allowed || busy || typeof readAction !== "function"}
            onClick={() => readLabNumber(order, "generate")}
          >
            <FormattedMessage id="sample.label.labnumber.generate" />
          </Button>
        </div>
        {busy && feedback.busy !== "review" && (
          <InlineLoading
            description={intl.formatMessage({
              id:
                feedback.busy === "generate"
                  ? "eorder.number.generating"
                  : "eorder.number.validating",
            })}
          />
        )}
        {allowed && (
          <p className="eorder-row-details__manual-save">
            <FormattedMessage id="eorder.action.manualSave" />
          </p>
        )}
      </div>
    );
  };

  const headers = [
    ["requestDateDisplay", "eorder.requestDate"],
    ["patientName", "eorder.patient"],
    ["externalOrderId", "eorder.externalOrderNumber"],
    ["requestingFacility", "eorder.facility.requesting"],
    ["testName", "eorder.test.name"],
    ["priority", "eorder.priority"],
    ["status", "eorder.status"],
    ["action", "eorder.operations"],
  ].map(([key, id]) => ({ key, header: intl.formatMessage({ id }) }));
  const success = queryState.phase === "success";
  const page = queryState.paging?.currentPage ?? 1;
  const pageSize = queryState.pageSize ?? queryState.paging?.pageSize ?? 100;
  const totalResults = queryState.totalResults ?? eOrders.length;

  return (
    <section
      ref={eOrderRef}
      className="eorder-list-panel"
      aria-labelledby="eorder-list-title"
      aria-busy={queryState.phase === "loading"}
    >
      <div className="eorder-list-panel__heading">
        <div>
          <h2 id="eorder-list-title">
            <FormattedMessage id="eorder.list.title" />
          </h2>
          {success && (
            <p>
              <FormattedMessage
                id="eorder.list.count"
                values={{ total: totalResults }}
              />
            </p>
          )}
        </div>
      </div>
      <div className="eorder-list-panel__body">
        {queryState.phase === "loading" && (
          <InlineLoading
            description={intl.formatMessage({ id: "loading.description" })}
          />
        )}
        {queryState.phase === "error" && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "eorder.search.failed" })}
          />
        )}
        {queryState.phase === "idle" && (
          <p role="status">
            <FormattedMessage id="eorder.list.idle" />
          </p>
        )}
        {success && eOrders.length === 0 && (
          <div className="eorder-list-panel__empty" role="status">
            <FormattedMessage id="eorder.search.noresults" />
          </div>
        )}
        <DataTable
          key={`${queryState.owner ?? ""}:${queryState.epoch ?? ""}`}
          id="eOrderTable"
          rows={
            success
              ? eOrders.map((order) => ({
                  ...order,
                  patientName: patientName(order),
                }))
              : []
          }
          headers={headers}
          expandableRows
          translateWithId={(id) => intl.formatMessage({ id })}
        >
          {({
            rows,
            headers: tableHeaders,
            getHeaderProps,
            getRowProps,
            getExpandedRowProps,
            getTableProps,
            getTableContainerProps,
          }) => (
            <TableContainer {...getTableContainerProps()}>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    <TableExpandHeader enableToggle={false} />
                    {tableHeaders.map((header) => (
                      <TableHeader
                        key={header.key}
                        {...getHeaderProps({ header })}
                        className={`eorder-column--${header.key}`}
                      >
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <React.Fragment key={row.id}>
                      <TableExpandRow {...getRowProps({ row })}>
                        {row.cells.map((cell) => {
                          const order = eOrders.find(
                            (item) => item.id === row.id,
                          );
                          const label =
                            cell.info.header === "action"
                              ? renderRowAction(order)
                              : cell.info.header === "status"
                                ? order?.statusCode === "UNKNOWN"
                                  ? intl.formatMessage({
                                      id: "eorder.status.unknown",
                                    })
                                  : electronicOrderStatusLabel(
                                      order?.statusCode ?? cell.value,
                                      intl,
                                    )
                                : cell.info.header === "priority"
                                  ? electronicOrderPriorityLabel(
                                      cell.value,
                                      intl,
                                    )
                                  : ["requestingFacility", "testName"].includes(
                                        cell.info.header,
                                      ) && !String(cell.value ?? "").trim()
                                    ? "—"
                                    : cell.value;
                          return (
                            <TableCell
                              key={cell.id}
                              className={`eorder-column--${cell.info.header}`}
                            >
                              {label}
                            </TableCell>
                          );
                        })}
                      </TableExpandRow>
                      <TableExpandedRow
                        {...getExpandedRowProps({ row })}
                        colSpan={tableHeaders.length + 1}
                        hidden={!row.isExpanded}
                      >
                        {row.isExpanded ? renderExpandedRow(row) : null}
                      </TableExpandedRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
        {success && totalResults > 0 && (
          <Pagination
            onChange={({ page: nextPage, pageSize: nextSize }) => {
              if (nextPage !== page || nextSize !== pageSize)
                onPageChange?.({
                  page: nextSize !== pageSize ? 1 : nextPage,
                  pageSize: nextSize,
                });
            }}
            page={page}
            pageSize={pageSize}
            pageSizes={[10, 20, 50, 100]}
            totalItems={totalResults}
            forwardText={intl.formatMessage({ id: "pagination.forward" })}
            backwardText={intl.formatMessage({ id: "pagination.backward" })}
            itemsPerPageText={intl.formatMessage({
              id: "pagination.items-per-page",
            })}
            pageSelectLabelText={(total) =>
              intl.formatMessage({ id: "pagination.page-select" }, { total })
            }
            itemRangeText={(min, max, total) =>
              intl.formatMessage(
                { id: "pagination.item-range" },
                { min, max, total },
              )
            }
            itemText={(min, max) =>
              intl.formatMessage({ id: "pagination.item" }, { min, max })
            }
            pageRangeText={(_current, total) =>
              intl.formatMessage({ id: "pagination.page-range" }, { total })
            }
            pageText={(currentPage, pagesUnknown) =>
              intl.formatMessage(
                { id: "pagination.page" },
                { page: pagesUnknown ? "" : currentPage },
              )
            }
          />
        )}
      </div>
    </section>
  );
};

export default EOrder;
