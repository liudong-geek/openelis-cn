import React, { useState, useContext, useEffect, useRef } from "react";
import { Field, Formik } from "formik";
import {
  Button,
  Checkbox,
  Column,
  Form,
  Grid,
  InlineNotification,
  Pagination,
  TextArea,
} from "@carbon/react";
import { Copy, Launch } from "@carbon/icons-react";
import DataTable from "react-data-table-component";
import { FormattedMessage, useIntl } from "react-intl";
import ValidationSearchFormValues from "../formModel/innitialValues/ValidationSearchFormValues";
import { NotificationKinds } from "../common/CustomNotification";
import { hasRole, Roles } from "../utils/Utils";
import { NotificationContext } from "../layout/Layout";
import { ConfigurationContext } from "../layout/Layout";
import { convertAlphaNumLabNumForDisplay } from "../utils/Utils";
import config from "../../config.json";
import ReviewSubmissionButton from "./ReviewSubmissionButton";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { useHistory } from "react-router-dom";
import ReviewResultDetails, { reviewRowIdentity } from "./ReviewResultDetails";
import { hasReviewQuery, reviewContextErrorKey } from "./reviewTransport";

const Validation = (props) => {
  const componentMounted = useRef(false);
  const history = useHistory();

  const { setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { configurationProperties } = useContext(ConfigurationContext);
  const { userSessionDetails } = useContext(UserSessionDetailsContext);

  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, refreshSelection] = useState(0);
  const submitting = useRef(false);
  const [detailIdentity, setDetailIdentity] = useState(null);
  const detailRow =
    hasReviewQuery(props.results?.queryId) &&
    props.results.resultList?.find(
      (row) => reviewRowIdentity(props.results.queryId, row) === detailIdentity,
    );
  useEffect(() => {
    setDetailIdentity(null);
  }, [props.results]);

  useEffect(() => {
    componentMounted.current = true;
    return () => {
      componentMounted.current = false;
    };
  }, []);

  const columns = [
    {
      id: "sampleInfo",
      name: intl.formatMessage({ id: "column.name.sampleInfo" }),
      cell: (row, index, column, id) => {
        return renderCell(row, index, column, id);
      },
      selector: (row) => row.accessionNumber,
      sortable: true,
      width: "14rem",
    },
    {
      id: "testName",
      name: intl.formatMessage({ id: "column.name.testName" }),
      selector: (row) => row.testName,
      cell: (row, index, column, id) => {
        return renderCell(row, index, column, id);
      },
      sortable: true,
      width: "14rem",
    },
    {
      id: "normalRange",
      name: intl.formatMessage({ id: "column.name.normalRange" }),
      selector: (row) => row.normalRange,
      sortable: true,
      width: "8rem",
    },
    {
      id: "result",
      name: intl.formatMessage({ id: "column.name.result" }),
      cell: (row, index, column, id) => {
        return renderCell(row, index, column, id);
      },
      width: "8rem",
    },
    {
      id: "save",
      name: intl.formatMessage({ id: "validation.review.accept" }),
      cell: (row, index, column, id) => {
        return renderCell(row, index, column, id);
      },
      width: "8rem",
    },
    {
      id: "retest",
      name: intl.formatMessage({ id: "validation.review.return" }),
      cell: (row, index, column, id) => {
        return renderCell(row, index, column, id);
      },
      width: "8rem",
    },
    {
      id: "notes",
      name: intl.formatMessage({ id: "validation.review.notes" }),
      cell: (row, index, column, id) => {
        return renderCell(row, index, column, id);
      },
      width: "14rem",
    },
  ];

  const buildSignContext = (payload) => {
    const selected = payload.resultList.filter(
      (row) => row.isAccepted || row.isRejected,
    );
    const accepted = new Set(
      selected.filter((row) => row.isAccepted).map((row) => row.analysisId),
    ).size;
    const returned = new Set(
      selected.filter((row) => row.isRejected).map((row) => row.analysisId),
    ).size;
    const accessions = [...new Set(selected.map((row) => row.accessionNumber))];
    return intl.formatMessage(
      { id: "validation.review.signContext" },
      {
        accepted,
        returned,
        results: selected.length,
        accessions: accessions.join(", "),
      },
    );
  };

  const showError = (id) => {
    addNotification({
      kind: NotificationKinds.error,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id }),
    });
    setNotificationVisible(true);
  };
  const prepareSubmission = () => {
    if (
      !componentMounted.current ||
      submitting.current ||
      !hasReviewQuery(props.results?.queryId)
    )
      return null;
    const selected = props.results.resultList.filter(
      (row) => row.isAccepted || row.isRejected,
    );
    if (!selected.length) {
      showError("validation.review.selectRequired");
      return null;
    }
    if (selected.some((row) => row.isRejected && !row.note?.trim())) {
      showError("validation.review.reasonRequired");
      return null;
    }
    if (selected.some((row) => row.isAccepted && row.qcReleaseBlocked)) {
      showError("validation.qc.releaseBlocked.submit");
      return null;
    }
    return JSON.parse(JSON.stringify(props.results));
  };
  const handleBusy = (value) => {
    submitting.current = value;
    setIsSubmitting(value);
    props.onSubmissionChange?.(value);
  };
  const handleResponse = (status) => {
    let message = intl.formatMessage({
      id:
        status === 400
          ? "validation.review.invalidSubmission"
          : status === 422
            ? "validation.qc.releaseBlocked.submit"
            : [401, 403, 409].includes(status)
              ? reviewContextErrorKey(status)
              : "validation.query.submitUnconfirmed",
    });
    let kind = NotificationKinds.error;
    setIsSubmitting(false);
    props.onSubmissionChange?.(false);
    if (status == 200) {
      message = intl.formatMessage({ id: "validation.save.success" });
      kind = NotificationKinds.success;
      history.replace(`/validation${props.params || ""}`);
    }
    addNotification({
      kind: kind,
      title: intl.formatMessage({ id: "notification.title" }),
      message: message,
    });
    setNotificationVisible(true);
    // A submission consumes the server context. Always obtain a fresh batch
    // before another attempt, including unknown transport outcomes.
    setDetailIdentity(null);
    props.onContextInvalid?.();
  };

  const handlePageChange = (pageInfo) => {
    if (page != pageInfo.page) {
      setPage(pageInfo.page);
    }
    if (pageSize != pageInfo.pageSize) {
      setPageSize(pageInfo.pageSize);
    }
  };

  const canReviewRow = (row) => !row.readOnly && row.showAcceptReject !== false;
  const groups = new Map();
  props.results.resultList?.forEach((row) => {
    if (!groups.has(row.analysisId)) groups.set(row.analysisId, []);
    groups.get(row.analysisId).push(row);
  });
  const groupFor = (row) => groups.get(row.analysisId) || [];
  const canReview = (row) =>
    canReviewRow(row) && groupFor(row).every(canReviewRow);
  const handleChange = (e, rowId) => {
    if (submitting.current) return;
    const row = props.results.resultList[rowId];
    if (!canReview(row)) return;
    groupFor(row).forEach((member) => {
      member.note = e.target.value;
    });
    refreshSelection((version) => version + 1);
  };
  const setDecision = (row, field, checked) => {
    row[field] = checked;
    if (checked)
      row[field === "isAccepted" ? "isRejected" : "isAccepted"] = false;
  };
  const handleCheckBox = (e, rowId) => {
    if (submitting.current) return;
    const row = props.results.resultList[rowId];
    if (!canReview(row)) return;
    const field = e.target.name.endsWith("isAccepted")
      ? "isAccepted"
      : "isRejected";
    groupFor(row).forEach((member) =>
      setDecision(member, field, e.target.checked),
    );
    refreshSelection((version) => version + 1);
  };
  const bulkRows = (onlyNormal = false, field) =>
    props.results.resultList.filter(
      (row) =>
        canReview(row) &&
        !(field === "isAccepted" && row.qcReleaseBlocked) &&
        (!onlyNormal ||
          groupFor(row).every((member) => member.normal === true)),
    );
  const bulkChecked = (field, onlyNormal = false) => {
    const rows = bulkRows(onlyNormal, field);
    return rows.length > 0 && rows.every((row) => row[field] === true);
  };
  const handleAutomatedCheck = (checked, field, onlyNormal = false) => {
    if (submitting.current) return;
    bulkRows(onlyNormal, field).forEach((row) =>
      setDecision(row, field, checked),
    );
    refreshSelection((version) => version + 1);
  };

  const renderCell = (row, index, column, id) => {
    let formatLabNum = configurationProperties.AccessionFormat === "ALPHANUM";
    const fullTestName = row.testName;
    const splitIndex = fullTestName.lastIndexOf("(");
    const testName = fullTestName.substring(0, splitIndex);
    const sampleType = fullTestName.substring(splitIndex);
    switch (column.id) {
      case "sampleInfo":
        return (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              <Button
                onClick={async () => {
                  if ("clipboard" in navigator) {
                    return await navigator.clipboard.writeText(
                      row.accessionNumber,
                    );
                  } else {
                    return document.execCommand(
                      "copy",
                      true,
                      row.accessionNumber,
                    );
                  }
                }}
                kind="ghost"
                iconDescription={intl.formatMessage({
                  id: "instructions.copy.labnum",
                })}
                hasIconOnly
                renderIcon={Copy}
              />
              {row.patientInfo !== "---" &&
                hasRole(userSessionDetails, Roles.RECEPTION) && (
                  <Button
                    kind="ghost"
                    hasIconOnly
                    renderIcon={Launch}
                    iconDescription={intl.formatMessage({
                      id: "label.validation.viewPatient",
                    })}
                    href={`/PatientManagement?labNumber=${encodeURIComponent(
                      row.accessionNumber,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    as="a"
                  />
                )}
            </div>
            <div className="sampleInfo" data-testid="LabNo">
              <br></br>
              {formatLabNum
                ? convertAlphaNumLabNumForDisplay(row.accessionNumber)
                : row.accessionNumber}
              <br></br>
              {row.patientInfo !== "---" ? row.patientName : null} <br></br>
              {row.patientInfo}
              <br></br>
              <br></br>
            </div>
            {row.nonconforming && (
              <picture>
                <img
                  src={config.serverBaseUrl + "/images/nonconforming.gif"}
                  alt={intl.formatMessage({
                    id: "label.validation.nonconforming",
                  })}
                  width="20"
                  height="15"
                />
              </picture>
            )}
          </>
        );
      case "testName": {
        const unitsOnly = row.units ? row.units.split(" (")[0].trim() : "";
        return (
          <div className="sampleInfo" data-testid="sampleInfo">
            <br></br>
            {testName}
            {unitsOnly && (
              <>
                <br></br>
                {unitsOnly}
              </>
            )}
            <br></br>
            {sampleType}
            <Button
              type="button"
              kind="ghost"
              size="sm"
              disabled={!hasReviewQuery(props.results?.queryId)}
              onClick={() =>
                setDetailIdentity(reviewRowIdentity(props.results.queryId, row))
              }
            >
              <FormattedMessage id="validation.details.open" />
            </Button>
          </div>
        );
      }

      case "save":
        return (
          <>
            <div data-testid="Checkbox">
              <Field name="isAccepted">
                {({ field }) => (
                  <Checkbox
                    id={"resultList" + row.id + ".isAccepted"}
                    name={"resultList[" + row.id + "].isAccepted"}
                    labelText=""
                    value={true}
                    checked={row.isAccepted === true}
                    disabled={
                      !canReview(row) || row.qcReleaseBlocked || isSubmitting
                    }
                    onChange={(e) => handleCheckBox(e, row.id)}
                  />
                )}
              </Field>
            </div>
          </>
        );

      case "retest":
        return (
          <>
            <Field name="isRejected">
              {({ field }) => (
                <Checkbox
                  id={"resultList" + row.id + ".isRejected"}
                  name={"resultList[" + row.id + "].isRejected"}
                  labelText=""
                  value={true}
                  checked={row.isRejected === true}
                  disabled={!canReview(row) || isSubmitting}
                  onChange={(e) => handleCheckBox(e, row.id)}
                />
              )}
            </Field>
          </>
        );

      case "notes":
        return (
          <>
            <div className="note">
              <TextArea
                id={"resultList" + row.id + ".note"}
                name={"resultList[" + row.id + "].note"}
                disabled={!canReview(row) || isSubmitting}
                value={row.note ?? ""}
                type="text"
                labelText=""
                rows={2}
                onChange={(e) => handleChange(e, row.id)}
              ></TextArea>
            </div>
          </>
        );

      case "pastNotes":
        return (
          <>
            <div className="note" style={{ whiteSpace: "pre-wrap" }}>
              {row.pastNotes?.replace(/<br\s*\/?>/gi, "\n")}
            </div>
          </>
        );

      case "result":
        switch (row.resultType) {
          case "M":
          case "C": {
            const labelFor = (dictId) =>
              row.dictionaryResults?.find((result) => result.id == dictId)
                ?.value || dictId;
            let groups;
            try {
              groups = JSON.parse(row.multiSelectResultValues || "{}");
            } catch {
              groups = {};
            }
            const lines = Object.keys(groups)
              .sort((a, b) => Number(a) - Number(b))
              .map((k) =>
                groups[k].split(",").filter(Boolean).map(labelFor).join(", "),
              )
              .filter(Boolean);
            return (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {lines.map((line, index) => (
                  <div key={index}>
                    {row.resultType === "C" ? `[ ${line} ]` : line}
                  </div>
                ))}
              </div>
            );
          }
          case "D":
            return (
              <>
                {
                  row.dictionaryResults.find(
                    (result) => result.id == row.result,
                  )?.value
                }
              </>
            );
          default:
            return row.result;
        }

      default:
    }
    return row.result;
  };

  return (
    <>
      {props.results?.resultList?.some((row) => row.qcReleaseBlocked) && (
        <InlineNotification
          lowContrast
          hideCloseButton
          kind="error"
          title={intl.formatMessage({
            id: "validation.qc.releaseBlocked.title",
          })}
          subtitle={intl.formatMessage(
            { id: "validation.qc.releaseBlocked.description" },
            {
              count: new Set(
                props.results.resultList
                  .filter((row) => row.qcReleaseBlocked)
                  .map((row) => row.analysisId),
              ).size,
            },
          )}
        />
      )}
      {props.results?.resultList?.length > 0 && (
        <Grid style={{ marginTop: "20px" }} className="gridBoundary">
          <Column lg={7} md={8} sm={2}>
            <picture>
              <img
                src={config.serverBaseUrl + "/images/nonconforming.gif"}
                alt={intl.formatMessage({
                  id: "label.validation.nonconforming",
                })}
                width="25" // Set your desired width
                height="20" // Set your desired height
              />
            </picture>
            <b>
              {" "}
              <FormattedMessage id="validation.label.nonconform" />
            </b>
          </Column>
          <Column lg={3} md={2} sm={4}>
            <Checkbox
              checked={bulkChecked("isAccepted", true)}
              id={"saveallnormal"}
              name={"autochecks"}
              labelText={intl.formatMessage({ id: "validation.accept.normal" })}
              disabled={isSubmitting}
              onChange={(e) =>
                handleAutomatedCheck(e.target.checked, "isAccepted", true)
              }
            />
          </Column>
          <Column lg={3} md={2} sm={4}>
            <Checkbox
              checked={bulkChecked("isAccepted")}
              id={"saveallresults"}
              name={"autochecks"}
              labelText={intl.formatMessage({ id: "validation.accept.all" })}
              disabled={isSubmitting}
              onChange={(e) =>
                handleAutomatedCheck(e.target.checked, "isAccepted")
              }
            />
          </Column>
          <Column lg={3} md={2} sm={4}>
            <Checkbox
              checked={bulkChecked("isRejected")}
              id={"retestalltests"}
              name={"autochecks"}
              labelText={intl.formatMessage({ id: "validation.reject.all" })}
              disabled={isSubmitting}
              onChange={(e) =>
                handleAutomatedCheck(e.target.checked, "isRejected")
              }
            />
          </Column>
        </Grid>
      )}
      {props.results?.resultList?.length > 0 ? (
        <Formik
          initialValues={ValidationSearchFormValues}
          //validationSchema={}
          onSubmit
          onChange
        >
          {({ handleChange }) => (
            <Form onChange={handleChange}>
              <div
                className="validation-results-table"
                role="region"
                tabIndex={0}
                aria-label={intl.formatMessage({
                  id: "validation.table.scroll",
                })}
              >
                <DataTable
                  data={props.results.resultList.slice(
                    (page - 1) * pageSize,
                    page * pageSize,
                  )}
                  columns={columns}
                  isSortable
                />
              </div>
              <Pagination
                onChange={handlePageChange}
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 20, 30, 50, 100]}
                totalItems={props.results.resultList.length}
                forwardText={intl.formatMessage({ id: "pagination.forward" })}
                backwardText={intl.formatMessage({
                  id: "pagination.backward",
                })}
                itemRangeText={(min, max, total) =>
                  intl.formatMessage(
                    { id: "pagination.item-range" },
                    { min: min, max: max, total: total },
                  )
                }
                itemsPerPageText={intl.formatMessage({
                  id: "pagination.items-per-page",
                })}
                itemText={(min, max) =>
                  intl.formatMessage(
                    { id: "pagination.item" },
                    { min: min, max: max },
                  )
                }
                pageNumberText={intl.formatMessage({
                  id: "pagination.page-number",
                })}
                pageRangeText={(_current, total) =>
                  intl.formatMessage(
                    { id: "pagination.page-range" },
                    { total: total },
                  )
                }
                pageText={(page, pagesUnknown) =>
                  intl.formatMessage(
                    { id: "pagination.page" },
                    { page: pagesUnknown ? "" : page },
                  )
                }
              />

              <ReviewSubmissionButton
                queryId={props.results?.queryId}
                prepare={prepareSubmission}
                isCurrent={(payload) =>
                  JSON.stringify(props.results) === JSON.stringify(payload)
                }
                context={buildSignContext}
                onBusy={handleBusy}
                onOutcome={handleResponse}
                onError={showError}
                disabled={
                  isSubmitting || !hasReviewQuery(props.results?.queryId)
                }
              >
                <FormattedMessage id="validation.review.submit" />
              </ReviewSubmissionButton>
            </Form>
          )}
        </Formik>
      ) : (
        <div className="validation-empty-state" role="status">
          <h3>
            <FormattedMessage id="validation.empty.title" />
          </h3>
          <p>
            <FormattedMessage id="validation.empty.message" />
          </p>
        </div>
      )}
      {detailRow && (
        <ReviewResultDetails
          row={detailRow}
          displayValue={renderCell(detailRow, 0, { id: "result" })}
          onClose={() => setDetailIdentity(null)}
        />
      )}
    </>
  );
};

export default Validation;
