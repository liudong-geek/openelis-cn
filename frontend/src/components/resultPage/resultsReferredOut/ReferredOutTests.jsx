import React, { useState, useRef, useEffect, useMemo } from "react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import "../../Style.css";
import { encodeDate, getFromOpenElisServer, Roles } from "../../utils/Utils";
import {
  Form,
  Dropdown,
  Heading,
  Grid,
  FilterableMultiSelect,
  Column,
  Section,
  Button,
  Loading,
  InlineNotification,
  DismissibleTag,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableHeader,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TableCell,
  Pagination,
} from "@carbon/react";
import CustomLabNumberInput from "../../common/CustomLabNumberInput";
import config from "../../../config.json";
import CustomDatePicker from "../../common/CustomDatePicker";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import { Formik, Field } from "formik";
import ReferredOutTestsFormValues from "../../formModel/innitialValues/ReferredOutTestsFormValues";
import SearchPatientForm from "../../patient/SearchPatientForm";

let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "referral.label.referredOutTests", link: "/ReferredOutTests" },
];

const referralStatusMessageIds = {
  CREATED: "label.referOut.status.draft",
  SENT: "shipment.state.sent",
  RECEIVED: "label.referOut.status.received",
  FINISHED: "label.referOut.status.completed",
  CANCELED: "label.referOut.status.cancelled",
};

function ReferredOutTests() {
  const [referredOutTestsFormValues, setReferredOutTestsFormValues] = useState(
    ReferredOutTestsFormValues,
  );
  const intl = useIntl();
  const dateTypeList = [
    {
      id: "option-0",
      text: intl.formatMessage({ id: "referral.dateType.sent" }),
      value: "SENT",
    },
    {
      id: "option-1",
      text: intl.formatMessage({ id: "referral.dateType.result" }),
      value: "RESULT",
    },
  ];

  const componentMounted = useRef(false);
  const latestSearchRequestId = useRef(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [testUnits, setTestUnits] = useState([]);
  const [testUnitsIdList, setTestUnitsIdList] = useState([]);
  const [testNames, setTestNames] = useState([]);
  const [testNamesIdList, setTestNamesIdList] = useState([]);
  const [dateType, setDateType] = useState(dateTypeList[0].value);
  const [loading, setLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchType, setSearchType] = useState("");
  const [tests, setTests] = useState([]);
  const [testSections, setTestSections] = useState([]);
  const [responseDataShow, setResponseDataShow] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [reportStatus, setReportStatus] = useState("idle");

  const selectedAnalysisIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedRowIds
            .map(
              (selectedId) =>
                responseDataShow.find((row) => row.id === selectedId)
                  ?.analysisId,
            )
            .filter(Boolean),
        ),
      ),
    [selectedRowIds, responseDataShow],
  );

  const runReferralSearch = ({
    searchTypeOverride,
    formValuesOverride,
  } = {}) => {
    const activeSearchType = searchTypeOverride || searchType;
    const activeFormValues = formValuesOverride || referredOutTestsFormValues;
    const params = new URLSearchParams({
      searchType: activeSearchType,
      dateType,
      startDate: activeFormValues.startDate || "",
      endDate: activeFormValues.endDate || "",
      testUnitIds: testUnitsIdList.join(","),
      _testUnitIds: "1",
      testIds: testNamesIdList.join(","),
      _testIds: "1",
      labNumber: activeFormValues.labNumberInput || "",
      dateOfBirthSearchValue: "",
      selPatient: activeFormValues.selectedPatientId || "",
      _analysisIds: "on",
    });

    setLoading(true);
    setSearchStatus("loading");
    setResponseDataShow([]);
    setSelectedRowIds([]);
    setReportStatus("idle");
    setPage(1);
    const requestId = ++latestSearchRequestId.current;
    getFromOpenElisServer(
      `/rest/ReferredOutTests?${params.toString()}`,
      (response) => handleResponseData(response, requestId),
    );
  };

  const handleResponseData = (res, requestId) => {
    if (
      !componentMounted.current ||
      requestId !== latestSearchRequestId.current
    )
      return;
    setLoading(false);
    if (!res || !Array.isArray(res.referralDisplayItems)) {
      setResponseDataShow([]);
      setSearchStatus("error");
      return;
    }
    const rows = res.referralDisplayItems.map((obj, index) => {
      const statusMessageId = referralStatusMessageIds[obj?.referralStatus];
      return {
        ...obj,
        id: String(index),
        disabled: Boolean(obj?.disabled || !obj?.analysisId),
        referralStatusDisplay: statusMessageId
          ? intl.formatMessage({ id: statusMessageId })
          : obj?.referralStatusDisplay || obj?.referralStatus || "—",
      };
    });
    setResponseDataShow(rows);
    setSearchStatus(rows.length > 0 ? "success" : "empty");
  };

  const handleSubmit = () => runReferralSearch();

  function handleLabNumberSearch(e, rawValue) {
    const nextValue = rawValue ?? e.target.value;
    setReferredOutTestsFormValues({
      ...referredOutTestsFormValues,
      labNumberInput: nextValue,
    });
    setSearchType(referredOutTestsFormValues.searchTypeValues[1]);
  }

  const getSelectedPatient = (patient) => {
    if (!patient?.patientPK) return;
    setSearchType(referredOutTestsFormValues.searchTypeValues[2]);
    setReferredOutTestsFormValues({
      ...referredOutTestsFormValues,
      selectedPatientId: patient.patientPK,
    });
  };

  const handleDatePickerChangeDate = (datePicker, date) => {
    let updatedDate = date;
    let obj = null;
    switch (datePicker) {
      case "startDate":
        obj = {
          ...referredOutTestsFormValues,
          startDate: encodeDate(updatedDate),
        };
        break;
      case "endDate":
        obj = {
          ...referredOutTestsFormValues,
          endDate: encodeDate(updatedDate),
        };
        break;
      default:
        obj = {
          startDate: "",
          endDate: "",
        };
    }
    setReferredOutTestsFormValues({
      ...referredOutTestsFormValues,
      ...obj,
    });
    setSearchType(referredOutTestsFormValues.searchTypeValues[0]);
  };

  const fetchTestSections = (response) => {
    setTestSections(response);
  };

  const getTests = (tests) => {
    if (componentMounted.current) {
      setTests(tests);
    }
  };

  const handlePageChange = ({ page, pageSize }) => {
    setPage(page);
    setPageSize(pageSize);
  };

  const handleReferredOutPatientPrint = () => {
    if (selectedAnalysisIds.length === 0) return;

    const params = new URLSearchParams({
      report: "patientCILNSP_vreduit",
      type: "patient",
      analysisIds: selectedAnalysisIds.join(","),
    });
    const patientReport = `${config.serverBaseUrl}/ReportPrint?${params.toString()}`;

    try {
      const reportWindow = window.open(patientReport, "_blank");
      if (!reportWindow) {
        setReportStatus("error");
        return;
      }
      reportWindow.opener = null;
      reportWindow.focus?.();
      setReportStatus("idle");
    } catch (_error) {
      setReportStatus("error");
    }
  };

  useEffect(() => {
    if (testNames.testNames) {
      var testNamesIdList = testNames.testNames.map((test) => test.id);
      setTestNamesIdList(testNamesIdList);
    }
    if (testUnits.testUnits) {
      var testUnitsIdList = testUnits.testUnits.map((test) => test.id);
      setTestUnitsIdList(testUnitsIdList);
    }
  }, [testNames, testUnits]);

  useEffect(() => {
    componentMounted.current = true;
    let testId = new URLSearchParams(window.location.search).get(
      "selectedTest",
    );
    testId = testId ? testId : "";
    getFromOpenElisServer("/rest/test-list", (fetchedTests) => {
      const availableTests = Array.isArray(fetchedTests) ? fetchedTests : [];
      let test = availableTests.find((test) => test.id === testId);
      if (test) {
        setTestNames({ testNames: [test] });
      }
      getTests(availableTests);
    });

    let testSectionId = new URLSearchParams(window.location.search).get(
      "testSectionId",
    );
    testSectionId = testSectionId ? testSectionId : "";
    getFromOpenElisServer(
      "/rest/user-test-sections/" + Roles.RESULTS,
      (fetchedTestSections) => {
        const availableTestSections = Array.isArray(fetchedTestSections)
          ? fetchedTestSections
          : [];
        let testSection = availableTestSections.find(
          (testSection) => testSection.id === testSectionId,
        );
        if (testSection) {
          setTestUnits({ testUnits: [testSection] });
        }
        fetchTestSections(availableTestSections);
      },
    );
    return () => {
      componentMounted.current = false;
      latestSearchRequestId.current += 1;
    };
  }, []);

  useEffect(() => {
    let patientId = new URLSearchParams(window.location.search).get(
      "patientId",
    );
    if (patientId) {
      let searchValues = {
        ...referredOutTestsFormValues,
        selectedPatientId: patientId,
      };
      setReferredOutTestsFormValues(searchValues);
      setSearchType(referredOutTestsFormValues.searchTypeValues[2]);
      runReferralSearch({
        searchTypeOverride: referredOutTestsFormValues.searchTypeValues[2],
        formValuesOverride: searchValues,
      });
    }
  }, []);

  const isRowSelectable = (rowId) => {
    const row = responseDataShow.find((candidate) => candidate.id === rowId);
    return Boolean(row && !row.disabled && row.analysisId);
  };

  const toggleRowSelection = (rowId) => {
    if (!isRowSelectable(rowId)) return;
    setSelectedRowIds((currentIds) =>
      currentIds.includes(rowId)
        ? currentIds.filter((selectedId) => selectedId !== rowId)
        : [...currentIds, rowId],
    );
  };

  const renderCell = (cell, row) => {
    if (cell.info.header === "select") {
      return (
        <TableSelectRow
          key={cell.id}
          id={cell.id}
          checked={selectedRowIds.includes(row.id)}
          disabled={!isRowSelectable(row.id)}
          name="selectRowCheckbox"
          aria-label={intl.formatMessage({
            id: selectedRowIds.includes(row.id)
              ? "referral.unselect.row"
              : "referral.select.row",
          })}
          onSelect={(event) => {
            event?.stopPropagation();
            toggleRowSelection(row.id);
          }}
        />
      );
    } else if (cell.info.header === "active") {
      return <TableCell key={cell.id}>{String(cell.value ?? "—")}</TableCell>;
    } else if (cell.info.header === "notes") {
      return (
        <TableCell key={cell.id}>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {cell.value?.replace(/<br\s*\/?>/gi, "\n")}
          </div>
        </TableCell>
      );
    } else {
      return <TableCell key={cell.id}>{cell.value ?? "—"}</TableCell>;
    }
  };

  const canSearchByUnit = Boolean(
    referredOutTestsFormValues.startDate ||
    referredOutTestsFormValues.endDate ||
    testUnitsIdList.length ||
    testNamesIdList.length,
  );
  const canSearchByPatient = Boolean(
    referredOutTestsFormValues.selectedPatientId,
  );
  const canSearchByLabNumber = Boolean(
    referredOutTestsFormValues.labNumberInput?.trim(),
  );

  const translateMenu = (messageId) =>
    intl.formatMessage({ id: `carbon.${messageId}` });
  const translateTable = (messageId) => intl.formatMessage({ id: messageId });

  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <Grid fullWidth={true}>
        <Column lg={16}>
          <Section>
            <Section>
              <Heading>
                <FormattedMessage id="referral.out.head" />
              </Heading>
            </Section>
          </Section>
        </Column>
      </Grid>
      {loading && (
        <Loading
          withOverlay={false}
          description={intl.formatMessage({ id: "referral.search.loading" })}
        />
      )}
      <div className="orderLegendBody">
        <Grid fullWidth={true}>
          <Column lg={16} md={8} sm={4}>
            <Section>
              <h5>
                <FormattedMessage id="referral.main.button" />
              </h5>
            </Section>
          </Column>
          <br />
          <Column lg={16} md={8} sm={4}>
            <SearchPatientForm
              getSelectedPatient={getSelectedPatient}
            ></SearchPatientForm>
          </Column>
          <br></br>
          <Column lg={16} md={8} sm={4}>
            <Button
              data-cy="referralsByPatient"
              type="button"
              disabled={!canSearchByPatient || loading}
              onClick={() =>
                runReferralSearch({
                  searchTypeOverride:
                    referredOutTestsFormValues.searchTypeValues[2],
                })
              }
            >
              <FormattedMessage
                id="referral.main.button"
                defaultMessage="Search Referrals By Patient"
              />
            </Button>
          </Column>
        </Grid>
        <hr />
        <br></br>
        <Formik
          initialValues={referredOutTestsFormValues}
          enableReinitialize={true}
          // validationSchema={}
          onSubmit={handleSubmit}
        >
          {({
            values,
            //errors,
            //touched,
            setFieldValue,
            handleChange,
            handleBlur,
            handleSubmit,
          }) => (
            <Form
              onSubmit={handleSubmit}
              onChange={handleChange}
              onBlur={handleBlur}
            >
              <Field name="guid">
                {({ field }) => (
                  <input type="hidden" name={field.name} id={field.name} />
                )}
              </Field>
              <Grid fullWidth={true}>
                <Column lg={16} md={8} sm={4}>
                  <h5>
                    <FormattedMessage id="referral.out.request" />
                  </h5>
                </Column>
                <Column lg={16} md={8} sm={4}>
                  <br></br>
                </Column>
                <Column lg={4} md={8} sm={4}>
                  <Dropdown
                    id={"dateType"}
                    name="dateType"
                    label={
                      dateTypeList.find((item) => item.value === dateType)
                        ?.text || ""
                    }
                    initialSelectedItem={dateTypeList.find(
                      (item) => item.value === dateType,
                    )}
                    items={dateTypeList}
                    itemToString={(item) => (item ? item.text : "")}
                    onChange={(item) => {
                      setSearchType(
                        referredOutTestsFormValues.searchTypeValues[0],
                      );
                      setDateType(item.selectedItem.value);
                    }}
                    translateWithId={translateMenu}
                  />
                </Column>
                <Column lg={12} md={8} sm={4}>
                  <FormattedMessage id="referral.out.note" />
                </Column>
                <Column lg={16} md={8} sm={4}>
                  <br></br>
                </Column>

                <Column lg={4} md={8} sm={4}>
                  <CustomDatePicker
                    id={"startDate"}
                    labelText={intl.formatMessage({
                      id: "eorder.date.start",
                      defaultMessage: "Start Date",
                    })}
                    autofillDate={true}
                    value={referredOutTestsFormValues.startDate}
                    className="inputDate"
                    onChange={(date) => {
                      handleDatePickerChangeDate("startDate", date);
                    }}
                  />
                </Column>
                <Column lg={4} md={8} sm={4}>
                  <CustomDatePicker
                    id={"endDate"}
                    labelText={intl.formatMessage({
                      id: "eorder.date.end",
                      defaultMessage: "End Date",
                    })}
                    className="inputDate"
                    autofillDate={true}
                    value={referredOutTestsFormValues.endDate}
                    onChange={(date) => {
                      handleDatePickerChangeDate("endDate", date);
                    }}
                  />
                </Column>
                <Column lg={16} md={8} sm={4}>
                  <br></br>
                </Column>

                <Column lg={4} md={8} sm={4}>
                  <FilterableMultiSelect
                    id="testunits"
                    titleText={intl.formatMessage({
                      id: "search.label.testunit",
                      defaultMessage: "Select Test Unit",
                    })}
                    items={testSections}
                    itemToString={(item) => (item ? item.value : "")}
                    onChange={(changes) => {
                      setTestUnits({
                        ...testUnits,
                        testUnits: changes.selectedItems,
                      });
                      setSearchType(
                        referredOutTestsFormValues.searchTypeValues[0],
                      );
                    }}
                    selectionFeedback="top-after-reopen"
                    locale={intl.locale}
                    clearSelectionDescription={intl.formatMessage({
                      id: "carbon.multiselect.totalSelected",
                    })}
                    clearSelectionText={intl.formatMessage({
                      id: "carbon.multiselect.clearSelection",
                    })}
                    translateWithId={translateMenu}
                  />
                </Column>

                <Column lg={12} md={8} sm={4}>
                  {testUnits.testUnits &&
                    testUnits.testUnits.map((test, index) => (
                      <DismissibleTag
                        key={index}
                        onClose={() => {
                          var info = { ...testUnits };
                          info["testUnits"].splice(index, 1);
                          setTestUnits(info);
                        }}
                        text={test.value}
                        title={intl.formatMessage({
                          id: "label.button.remove",
                        })}
                        dismissTooltipLabel={intl.formatMessage({
                          id: "label.button.remove",
                        })}
                      />
                    ))}
                </Column>
                <Column lg={16} md={8} sm={4}>
                  <br></br>
                </Column>
                <Column lg={4} md={8} sm={4}>
                  <FilterableMultiSelect
                    id="testnames"
                    titleText={intl.formatMessage({
                      id: "search.label.test",
                      defaultMessage: "Select Test Name",
                    })}
                    items={tests}
                    itemToString={(item) => (item ? item.value : "")}
                    onChange={(changes) => {
                      setTestNames({
                        ...testNames,
                        testNames: changes.selectedItems,
                      });
                      setSearchType(
                        referredOutTestsFormValues.searchTypeValues[0],
                      );
                    }}
                    selectionFeedback="top-after-reopen"
                    locale={intl.locale}
                    clearSelectionDescription={intl.formatMessage({
                      id: "carbon.multiselect.totalSelected",
                    })}
                    clearSelectionText={intl.formatMessage({
                      id: "carbon.multiselect.clearSelection",
                    })}
                    translateWithId={translateMenu}
                  />
                </Column>

                <Column lg={12} md={8} sm={4}>
                  {testNames.testNames &&
                    testNames.testNames.map((test, index) => (
                      <DismissibleTag
                        key={index}
                        onClose={() => {
                          var info = { ...testNames };
                          info["testNames"].splice(index, 1);
                          setTestNames(info);
                        }}
                        text={test.value}
                        title={intl.formatMessage({
                          id: "label.button.remove",
                        })}
                        dismissTooltipLabel={intl.formatMessage({
                          id: "label.button.remove",
                        })}
                      />
                    ))}
                </Column>
                <Column lg={16} md={8} sm={4}>
                  <br></br>
                </Column>

                <Column lg={4} md={8} sm={4}>
                  <Button
                    data-cy="byUnitsAndTests"
                    type="button"
                    disabled={!canSearchByUnit || loading}
                    onClick={() =>
                      runReferralSearch({
                        searchTypeOverride:
                          referredOutTestsFormValues.searchTypeValues[0],
                      })
                    }
                  >
                    <FormattedMessage
                      id="referral.button.unitTestSearch"
                      defaultMessage="Search Referrals By Unit(s) & Test(s)"
                    />
                  </Button>
                </Column>
              </Grid>
              <hr />
              <Grid fullWidth={true}>
                <Column lg={16} md={8} sm={4}>
                  <h5>
                    <FormattedMessage id="referral.result.labNumber" />
                  </h5>
                </Column>
                <Column lg={16} md={8} sm={4}>
                  <br></br>
                </Column>

                <Column lg={8} md={8} sm={4}>
                  <Field name="labNumberInput">
                    {({ field }) => (
                      <CustomLabNumberInput
                        name={field.name}
                        labelText={intl.formatMessage({
                          id: "referral.input",
                          defaultMessage: "Scan OR Enter Manually",
                        })}
                        id={field.name}
                        value={values[field.name]}
                        onChange={(e, rawValue) => {
                          setFieldValue(field.name, rawValue);
                          setSearchType(
                            referredOutTestsFormValues.searchTypeValues[1],
                          );
                          handleLabNumberSearch(e, rawValue);
                        }}
                      />
                    )}
                  </Field>
                </Column>
                <Column lg={16} md={8} sm={4}>
                  <br></br>
                </Column>

                <Column lg={4} md={8} sm={4}>
                  <Button
                    data-cy="byLabNumber"
                    type="button"
                    disabled={!canSearchByLabNumber || loading}
                    onClick={() =>
                      runReferralSearch({
                        searchTypeOverride:
                          referredOutTestsFormValues.searchTypeValues[1],
                      })
                    }
                  >
                    <FormattedMessage
                      id="referral.button.labSearch"
                      defaultMessage="Search Referrals By Lab Number"
                    />
                  </Button>
                </Column>
              </Grid>
              <hr />
            </Form>
          )}
        </Formik>
        <br />
        {searchStatus === "idle" && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "referral.search.idle.title" })}
            subtitle={intl.formatMessage({
              id: "referral.search.idle.detail",
            })}
          />
        )}
        {searchStatus === "empty" && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "referral.search.empty.title" })}
            subtitle={intl.formatMessage({
              id: "referral.search.empty.detail",
            })}
          />
        )}
        {searchStatus === "error" && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "referral.search.error.title" })}
            subtitle={intl.formatMessage({
              id: "referral.search.error.detail",
            })}
          />
        )}
        {responseDataShow.length > 0 && (
          <>
            <Grid fullWidth={true}>
              <Column lg={4} md={8} sm={4}>
                <span>
                  <FormattedMessage id="referral.matching.search" /> :
                </span>{" "}
              </Column>
              <Column lg={4} md={8} sm={4}>
                <Button
                  disabled={selectedAnalysisIds.length === 0}
                  kind="tertiary"
                  type="button"
                  data-cy="print-report"
                  onClick={handleReferredOutPatientPrint}
                >
                  <FormattedMessage
                    id="referral.print.selected.patient.reports"
                    defaultMessage="Print Selected Patient Reports"
                  />
                </Button>{" "}
              </Column>
              <Column lg={4} md={8} sm={4}>
                <Button
                  disabled={responseDataShow
                    .filter((row) => !row.disabled)
                    .every((row) => selectedRowIds.includes(row.id))}
                  kind="tertiary"
                  type="button"
                  data-cy="select-all-button"
                  onClick={() => {
                    const allSelectableIds = responseDataShow
                      .filter((row) => !row.disabled)
                      .map((row) => row.id);

                    setSelectedRowIds(allSelectableIds);
                  }}
                >
                  <FormattedMessage
                    id="referral.print.selected.patient.reports.selectall.button"
                    defaultMessage="Select All"
                  />
                </Button>{" "}
              </Column>
              <Column lg={4} md={8} sm={4}>
                <Button
                  disabled={selectedRowIds.length === 0}
                  kind="tertiary"
                  type="button"
                  data-cy="select-none-button"
                  onClick={() => setSelectedRowIds([])}
                >
                  <FormattedMessage
                    id="referral.print.selected.patient.reports.selectnone.button"
                    defaultMessage="Select None"
                  />
                </Button>
              </Column>
            </Grid>
            {reportStatus === "error" && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title={intl.formatMessage({
                  id: "reports.error.generationFailed",
                })}
              />
            )}
            <br />
            <Grid fullWidth={true} className="gridBoundary">
              <Column lg={16} md={8} sm={4}>
                <br />
                <DataTable
                  rows={responseDataShow.slice(
                    (page - 1) * pageSize,
                    page * pageSize,
                  )}
                  headers={[
                    {
                      key: "select",
                      header: intl.formatMessage({
                        id: "referral.select.column",
                      }),
                    },
                    {
                      key: "resultDate",
                      header: intl.formatMessage({
                        id: "referral.search.column.resultDate",
                      }),
                    },
                    {
                      key: "accessionNumber",
                      header: intl.formatMessage({
                        id: "sample.label.labnumber",
                      }),
                    },
                    {
                      key: "referredSendDate",
                      header: intl.formatMessage({
                        id: "referral.search.column.sentDate",
                      }),
                    },
                    {
                      key: "referralStatusDisplay",
                      header: intl.formatMessage({
                        id: "label.filters.status",
                      }),
                    },
                    {
                      key: "patientLastName",
                      header: intl.formatMessage({
                        id: "eorder.name.last",
                      }),
                    },
                    {
                      key: "patientFirstName",
                      header: intl.formatMessage({
                        id: "eorder.name.first",
                      }),
                    },
                    {
                      key: "referringTestName",
                      header: intl.formatMessage({
                        id: "eorder.test.name",
                      }),
                    },
                    {
                      key: "referralResultsDisplay",
                      header: intl.formatMessage({
                        id: "column.name.result",
                      }),
                    },
                    {
                      key: "referenceLabDisplay",
                      header: intl.formatMessage({
                        id: "referral.search.column.referenceLab",
                      }),
                    },
                    {
                      key: "notes",
                      header: intl.formatMessage({
                        id: "column.name.notes",
                      }),
                    },
                  ]}
                  translateWithId={translateTable}
                >
                  {({
                    rows,
                    headers,
                    getHeaderProps,
                    getTableProps,
                    getSelectionProps,
                  }) => (
                    <TableContainer>
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            <TableSelectAll
                              id="table-select-all"
                              {...getSelectionProps()}
                              checked={
                                responseDataShow
                                  .slice((page - 1) * pageSize, page * pageSize)
                                  .filter((row) => !row.disabled).length > 0 &&
                                responseDataShow
                                  .slice((page - 1) * pageSize, page * pageSize)
                                  .filter((row) => !row.disabled)
                                  .every((row) =>
                                    selectedRowIds.includes(row.id),
                                  )
                              }
                              indeterminate={
                                responseDataShow
                                  .slice((page - 1) * pageSize, page * pageSize)
                                  .filter(
                                    (row) =>
                                      !row.disabled &&
                                      selectedRowIds.includes(row.id),
                                  ).length > 0 &&
                                !responseDataShow
                                  .slice((page - 1) * pageSize, page * pageSize)
                                  .filter((row) => !row.disabled)
                                  .every((row) =>
                                    selectedRowIds.includes(row.id),
                                  )
                              }
                              onSelect={() => {
                                const currentPageIds = responseDataShow
                                  .slice((page - 1) * pageSize, page * pageSize)
                                  .filter((row) => !row.disabled)
                                  .map((row) => row.id);
                                if (
                                  currentPageIds.every((index) =>
                                    selectedRowIds.includes(index),
                                  )
                                ) {
                                  setSelectedRowIds((currentIds) =>
                                    currentIds.filter(
                                      (selectedId) =>
                                        !currentPageIds.includes(selectedId),
                                    ),
                                  );
                                } else {
                                  setSelectedRowIds((currentIds) =>
                                    Array.from(
                                      new Set([
                                        ...currentIds,
                                        ...currentPageIds,
                                      ]),
                                    ),
                                  );
                                }
                              }}
                            />
                            {headers.map(
                              (header) =>
                                header.key !== "select" && (
                                  <TableHeader
                                    key={header.key}
                                    {...getHeaderProps({ header })}
                                  >
                                    {header.header}
                                  </TableHeader>
                                ),
                            )}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <>
                            {rows.map((row) => (
                              <TableRow
                                key={row.id}
                                aria-disabled={!isRowSelectable(row.id)}
                                onClick={() => {
                                  toggleRowSelection(row.id);
                                }}
                              >
                                {row.cells.map((cell) => renderCell(cell, row))}
                              </TableRow>
                            ))}
                          </>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
                <Pagination
                  onChange={handlePageChange}
                  page={page}
                  pageSize={pageSize}
                  pageSizes={[5, 10, 20]}
                  totalItems={responseDataShow.length}
                  forwardText={intl.formatMessage({
                    id: "pagination.forward",
                  })}
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
                  pageSelectLabelText={(total) =>
                    intl.formatMessage(
                      { id: "pagination.page-select" },
                      { total },
                    )
                  }
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
                <br />
              </Column>
            </Grid>
          </>
        )}
      </div>
    </>
  );
}

export default injectIntl(ReferredOutTests);
