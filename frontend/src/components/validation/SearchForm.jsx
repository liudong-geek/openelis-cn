import React, { useState, useEffect, useContext, useRef } from "react";
import {
  Button,
  Column,
  Form,
  Stack,
  SelectItem,
  Select,
  Loading,
  Grid,
  Link,
} from "@carbon/react";
import CustomLabNumberInput from "../common/CustomLabNumberInput";
import { FormattedMessage, useIntl } from "react-intl";
import { Formik, Field } from "formik";
import ValidationSearchFormValues from "../formModel/innitialValues/ValidationSearchFormValues";
import { getFromOpenElisServer, Roles } from "../utils/Utils";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import { NotificationKinds } from "../common/CustomNotification";
import CustomDatePicker from "../common/CustomDatePicker";
import { ArrowLeft, ArrowRight } from "@carbon/react/icons";
import {
  getReviewResults,
  hasReviewQuery,
  reviewContextErrorKey,
} from "./reviewTransport";

const REVIEW_MODES = [
  ["routine", "validation.search.mode.section"],
  ["order", "validation.search.mode.order"],
  ["range", "validation.search.mode.range"],
  ["testDate", "validation.search.mode.date"],
];

const SearchForm = (props) => {
  const { setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const intl = useIntl();
  const { configurationProperties } = useContext(ConfigurationContext);
  const exactAccessionFromLink = useRef(null);

  const resultRequest = useRef({ generation: 0, controller: null });
  const [searchBy, setSearchBy] = useState();
  const [doRange, setDoRagnge] = useState(true);
  const [testSections, setTestSections] = useState([]);
  const [defaultTestSectionId, setDefaultTestSectionId] = useState("");
  const [defaultTestSectionLabel, setDefaultTestSectionLabel] = useState("");
  const [searchFormValues, setSearchFormValues] = useState(
    ValidationSearchFormValues,
  );
  const [testDate, setTestDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [nextPage, setNextPage] = useState(null);
  const [previousPage, setPreviousPage] = useState(null);
  const [pagination, setPagination] = useState(false);
  const [currentApiPage, setCurrentApiPage] = useState(null);
  const [totalApiPages, setTotalApiPages] = useState(null);
  const [url, setUrl] = useState("");
  const queryId = useRef(null);

  const loadTestSections = (testSectionId = "") => {
    getFromOpenElisServer(
      "/rest/user-test-sections/" + Roles.VALIDATION,
      (fetchedTestSections) => {
        const availableTestSections = Array.isArray(fetchedTestSections)
          ? fetchedTestSections
          : [];
        const testSection = availableTestSections.find(
          (section) => section.id === testSectionId,
        );
        setDefaultTestSectionId(testSectionId);
        setDefaultTestSectionLabel(testSection?.value || "");
        fetchTestSections(availableTestSections);
      },
    );
  };

  const activateReviewMode = (mode) => {
    if (
      props.disabled ||
      mode === searchBy ||
      props.beforeQuery?.() === false
    ) {
      return;
    }
    resultRequest.current.controller?.abort();
    resultRequest.current.generation += 1;
    queryId.current = null;
    setIsLoading(false);
    setPagination(false);
    setCurrentApiPage(null);
    setTotalApiPages(null);
    setNextPage(null);
    setPreviousPage(null);
    setUrl("");
    setTestDate("");
    setSearchFormValues(ValidationSearchFormValues);
    setSearchBy(mode);
    setDoRagnge(mode !== "order");
    props.setParams("");
    props.setResults({ resultList: [] });
    window.history.pushState({}, "", `/validation?type=${mode}`);
    if (mode === "routine") loadTestSections();
  };

  const validationResults = (data, status, expectedQueryId, expectedPage) => {
    setPagination(false);
    setCurrentApiPage(null);
    setTotalApiPages(null);
    setNextPage(null);
    setPreviousPage(null);
    setIsLoading(false);

    const validPayload =
      data &&
      Array.isArray(data.resultList) &&
      data.resultList.every(
        (row) => row !== null && typeof row === "object" && !Array.isArray(row),
      );
    const returnedPage = Number(data?.paging?.currentPage);
    const totalPages = Number(data?.paging?.totalPages);
    const validPaging = !data?.paging
      ? !expectedPage
      : Number.isInteger(returnedPage) &&
        returnedPage >= 1 &&
        Number.isInteger(totalPages) &&
        totalPages >= returnedPage &&
        (!expectedPage || returnedPage === expectedPage);
    const validContext =
      validPayload &&
      hasReviewQuery(data.queryId) &&
      validPaging &&
      (!expectedQueryId || data.queryId === expectedQueryId);
    queryId.current = validContext ? data.queryId : null;
    if (validContext) {
      if (data.paging) {
        const { totalPages, currentPage } = data.paging;
        if (totalPages > 1) {
          setPagination(true);
          setCurrentApiPage(currentPage);
          setTotalApiPages(totalPages);
          if (parseInt(currentPage) < parseInt(totalPages)) {
            setNextPage(parseInt(currentPage) + 1);
          } else {
            setNextPage(null);
          }
          if (parseInt(currentPage) > 1) {
            setPreviousPage(parseInt(currentPage) - 1);
          } else {
            setPreviousPage(null);
          }
        }
      }
      // Keep the server payload and ordering intact: the legacy POST cache uses
      // array positions. Add only the existing UI index and missing note field.
      props.setResults({
        ...data,
        resultList: data.resultList.map((row, id) => ({
          ...row,
          id,
          note: row.note ?? "",
        })),
      });
      if (data.resultList.length === 0) {
        addNotification({
          kind: NotificationKinds.warning,
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({ id: "validation.search.noresult" }),
        });
        setNotificationVisible(true);
      }
    } else {
      props.setResults({ resultList: [] });
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id:
            [401, 403, 409].includes(status) || (validPayload && !validContext)
              ? reviewContextErrorKey(status)
              : "validation.search.error",
        }),
      });
      setNotificationVisible(true);
    }
  };

  const requestResults = (endpoint, expectedQueryId = null) => {
    resultRequest.current.controller?.abort();
    const expectedPage =
      Number(new URLSearchParams(endpoint.split("?")[1]).get("page")) || null;
    const controller = new AbortController();
    const generation = resultRequest.current.generation + 1;
    resultRequest.current = { generation, controller };
    setIsLoading(true);
    setPagination(false);
    setNextPage(null);
    setPreviousPage(null);
    // A new query must not leave the previous order available for review.
    props.setResults({ resultList: [] });
    getReviewResults(
      endpoint,
      (data, status) => {
        if (
          controller.signal.aborted ||
          resultRequest.current.generation !== generation
        ) {
          return;
        }
        validationResults(data, status, expectedQueryId, expectedPage);
      },
      controller.signal,
    );
  };

  useEffect(() => {
    return () => {
      resultRequest.current.controller?.abort();
      resultRequest.current.generation += 1;
    };
  }, []);

  const handleSubmit = (
    values,
    requestedSearchBy = searchBy,
    requestedDoRange = doRange,
    exactAccessionNumber,
  ) => {
    if (props.disabled || props.beforeQuery?.() === false) return;
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
    setIsLoading(true);
    // Deep links carry a complete server-owned order identity. Manual ALPHANUM
    // input may carry the legacy analysis suffix after the normalized lab number.
    const inputAccession = values.accessionNumber || "";
    const accessionNumber =
      exactAccessionNumber !== undefined
        ? exactAccessionNumber
        : exactAccessionFromLink.current === inputAccession
          ? inputAccession
          : configurationProperties.AccessionFormat === "ALPHANUM"
            ? // Match CustomLabNumberInput's existing normalized suffix contract:
              // one separator, a base longer than 7 characters and at most 2 suffix characters.
              inputAccession.replace(/^([^-]{8,})-[^-]{0,2}$/, "$1")
            : inputAccession;
    var unitType = values.unitType ? values.unitType : "";
    var defaultDate = values.defaultDate ? values.defaultDate : "";
    var date = testDate ? testDate : defaultDate;
    const query = new URLSearchParams({
      accessionNumber,
      unitType,
      date,
      doRange: String(requestedDoRange),
    });
    const searchEndPoint = `/rest/AccessionValidation?${query.toString()}`;
    setUrl(searchEndPoint);
    switch (requestedSearchBy) {
      case "routine":
        props.setParams(
          `?${new URLSearchParams({
            type: requestedSearchBy,
            testSectionId: unitType,
          }).toString()}`,
        );
        break;
      case "order":
        props.setParams(
          `?${new URLSearchParams({
            type: requestedSearchBy,
            accessionNumber,
          }).toString()}`,
        );
        break;
      case "testDate":
        props.setParams(
          `?${new URLSearchParams({
            type: requestedSearchBy,
            date,
          }).toString()}`,
        );
        break;
      case "range":
        props.setParams(
          `?${new URLSearchParams({
            type: requestedSearchBy,
            accessionNumber,
          }).toString()}`,
        );
        break;
    }
    requestResults(searchEndPoint);
  };

  const handleChange = () => {};

  const loadNextResultsPage = () => {
    if (props.disabled || props.beforeQuery?.() === false) return;
    if (nextPage !== null && hasReviewQuery(queryId.current)) {
      requestResults(
        url +
          "&" +
          new URLSearchParams({
            page: String(nextPage),
            queryId: queryId.current,
          }),
        queryId.current,
      );
    }
  };

  const loadPreviousResultsPage = () => {
    if (props.disabled || props.beforeQuery?.() === false) return;
    if (previousPage !== null && hasReviewQuery(queryId.current)) {
      requestResults(
        url +
          "&" +
          new URLSearchParams({
            page: String(previousPage),
            queryId: queryId.current,
          }),
        queryId.current,
      );
    }
  };
  const fetchTestSections = (response) => {
    setTestSections(response);
  };

  const submitOnSelect = (e) => {
    var values = { unitType: e.target.value };
    handleSubmit(values);
  };

  function handleDatePickerChange(date) {
    setTestDate(date);
  }

  useEffect(() => {
    var param = "";
    if (window.location.pathname == "/validation") {
      param =
        new URLSearchParams(window.location.search).get("type") || "routine";
    } else if (window.location.pathname == "/ResultValidation") {
      param = "routine";
    } else if (window.location.pathname == "/AccessionValidation") {
      param = "order";
    } else if (window.location.pathname == "/AccessionValidationRange") {
      param = "range";
    } else if (window.location.pathname == "/ResultValidationByTestDate") {
      param = "testDate";
    }
    setSearchBy(param);
    const rangeSearch = param !== "order";
    setDoRagnge(rangeSearch);
    switch (param) {
      case "routine": {
        let testSectionId = new URLSearchParams(window.location.search).get(
          "testSectionId",
        );
        testSectionId = testSectionId ? testSectionId : "";
        loadTestSections(testSectionId);
        if (testSectionId) {
          let values = { unitType: testSectionId };
          handleSubmit(values, param, rangeSearch);
        }
        break;
      }

      case "order":
      case "range": {
        let accessionNumber = new URLSearchParams(window.location.search).get(
          "accessionNumber",
        );
        if (accessionNumber) {
          exactAccessionFromLink.current = accessionNumber;
          let searchValues = {
            ...searchFormValues,
            accessionNumber: accessionNumber,
          };
          handleSubmit(searchValues, param, rangeSearch, accessionNumber);
          setSearchFormValues(searchValues);
        }
        break;
      }
      case "testDate": {
        let date = new URLSearchParams(window.location.search).get("date");
        if (date) {
          setTestDate(date);
          handleSubmit({ defaultDate: date }, param, rangeSearch);
        }
        break;
      }
    }

    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
  }, []);
  return (
    <>
      <section
        className="validation-search-panel"
        aria-labelledby="validation-search-title"
      >
        <div className="validation-search-panel__heading">
          <div>
            <h2 id="validation-search-title">
              <FormattedMessage id="validation.search.mode.title" />
            </h2>
            <p>
              <FormattedMessage id="validation.search.mode.helper" />
            </p>
          </div>
          <div
            className="validation-search-modes"
            role="group"
            aria-label={intl.formatMessage({
              id: "validation.search.mode.title",
            })}
          >
            {REVIEW_MODES.map(([mode, messageId]) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                kind={searchBy === mode ? "primary" : "ghost"}
                disabled={props.disabled}
                onClick={() => activateReviewMode(mode)}
              >
                <FormattedMessage id={messageId} />
              </Button>
            ))}
          </div>
        </div>
      </section>
      {isLoading && <Loading></Loading>}
      <Formik
        initialValues={searchFormValues}
        enableReinitialize={true}
        //validationSchema={}
        onSubmit={(values) => handleSubmit(values)}
        onChange
      >
        {({
          values,
          errors,
          touched,
          setFieldValue,
          handleChange,
          //handleBlur,
          handleSubmit,
        }) => (
          <Form
            onSubmit={handleSubmit}
            onChange={handleChange}
            //onBlur={handleBlur}
          >
            <Stack gap={2}>
              <Grid>
                <Column lg={16}>
                  <h4>
                    <FormattedMessage id="label.button.search" />
                  </h4>
                </Column>

                {(searchBy === "order" || searchBy === "range") && (
                  <>
                    <Column lg={6} md={8} sm={4}>
                      <Field name="accessionNumber">
                        {({ field }) => (
                          <CustomLabNumberInput
                            placeholder={intl.formatMessage({
                              id: "placeholder.accession.number",
                            })}
                            name={field.name}
                            id={field.name}
                            value={values[field.name]}
                            onChange={(e, rawValue) => {
                              exactAccessionFromLink.current = null;
                              setFieldValue(
                                field.name,
                                rawValue ?? e.target.value,
                              );
                            }}
                            labelText={
                              searchBy == "order" ? (
                                <FormattedMessage id="search.label.accession" />
                              ) : (
                                <FormattedMessage id="search.label.loadnext" />
                              )
                            }
                          />
                        )}
                      </Field>
                    </Column>
                    <Column lg={10} />
                  </>
                )}

                {searchBy === "testDate" && (
                  <>
                    <Column lg={6} md={8} sm={4}>
                      <Field name="date">
                        {({ field }) => (
                          <CustomDatePicker
                            id={field.id}
                            labelText={intl.formatMessage({
                              id: "search.label.testdate",
                            })}
                            value={testDate}
                            onChange={(date) => handleDatePickerChange(date)}
                            name={field.name}
                          />
                        )}
                      </Field>
                    </Column>
                    <Column lg={10} />
                  </>
                )}
                {searchBy !== "routine" && (
                  <Column lg={16} md={8} sm={4}>
                    <Button
                      type="submit"
                      disabled={props.disabled}
                      id="submit"
                      style={{ marginTop: "16px" }}
                      data-testid="Search-btn"
                    >
                      <FormattedMessage id="label.button.search" />
                    </Button>
                  </Column>
                )}
              </Grid>
            </Stack>
          </Form>
        )}
      </Formik>

      {searchBy === "routine" && (
        <>
          <Grid>
            <Column lg={6} md={8} sm={4}>
              <Select
                labelText={intl.formatMessage({ id: "search.label.testunit" })}
                name="unitType"
                disabled={props.disabled}
                id="unitType"
                onChange={submitOnSelect}
              >
                <SelectItem
                  text={defaultTestSectionLabel}
                  value={defaultTestSectionId}
                />
                {testSections
                  .filter((item) => item.id !== defaultTestSectionId)
                  .map((test, index) => {
                    return (
                      <SelectItem
                        key={index}
                        text={test.value}
                        value={test.id}
                      />
                    );
                  })}
              </Select>
            </Column>
            <Column lg={10} />
          </Grid>
        </>
      )}

      <>
        {pagination && (
          <Grid>
            <Column lg={14} />
            <Column
              lg={2}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <Link>
                {currentApiPage} / {totalApiPages}
              </Link>
              <div style={{ display: "flex", gap: "10px" }}>
                <Button
                  hasIconOnly
                  id="loadpreviousresults"
                  onClick={loadPreviousResultsPage}
                  disabled={previousPage != null ? false : true}
                  renderIcon={ArrowLeft}
                  iconDescription={intl.formatMessage({
                    id: "pagination.backward",
                  })}
                ></Button>
                <Button
                  hasIconOnly
                  id="loadnextresults"
                  onClick={loadNextResultsPage}
                  disabled={nextPage != null ? false : true}
                  renderIcon={ArrowRight}
                  iconDescription={intl.formatMessage({
                    id: "pagination.forward",
                  })}
                ></Button>
              </div>
            </Column>
          </Grid>
        )}
      </>
    </>
  );
};

export default SearchForm;
