import React, { useState, useEffect, useContext } from "react";
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
import { NotificationContext } from "../layout/Layout";
import { NotificationKinds } from "../common/CustomNotification";
import CustomDatePicker from "../common/CustomDatePicker";
import { ArrowLeft, ArrowRight } from "@carbon/react/icons";

const SearchForm = (props) => {
  const { setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const intl = useIntl();

  const [searchResults, setSearchResults] = useState();
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

  const validationResults = (data) => {
    setPagination(false);
    setCurrentApiPage(null);
    setTotalApiPages(null);
    setNextPage(null);
    setPreviousPage(null);
    setIsLoading(false);

    if (data) {
      setSearchResults(data);
      if (data.paging) {
        var { totalPages, currentPage } = data.paging;
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
      if (data?.resultList?.length > 0) {
        const newResultsList = data.resultList.map((data, id) => {
          let tempData = { ...data };
          tempData.id = id;
          return tempData;
        });
        setSearchResults((prevState) => ({
          ...prevState,
          resultList: newResultsList,
        }));
      } else {
        setSearchResults((prevState) => ({
          ...prevState,
          resultList: [],
        }));

        addNotification({
          kind: NotificationKinds.warning,
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({ id: "validation.search.noresult" }),
        });
        setNotificationVisible(true);
      }
    } else {
      setSearchResults({ resultList: [] });
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "validation.search.error" }),
      });
      setNotificationVisible(true);
    }
  };

  useEffect(() => {
    // OGC-654: server's GET response omits a `note` key on each row.
    // jpSet (utils/JsonPath.js) silently no-ops when the JSONPath query
    // returns 0 matches, so handleChange's `jpSet(form, "resultList[N].note", value)`
    // never reaches the form state when typing into the Notes column. Pre-init
    // each row's note to "" so the path exists and the mutation succeeds.
    if (searchResults?.resultList) {
      for (const row of searchResults.resultList) {
        if (row && row.note === undefined) row.note = "";
      }
    }
    props.setResults(searchResults);
  }, [searchResults]);

  const handleSubmit = (
    values,
    requestedSearchBy = searchBy,
    requestedDoRange = doRange,
  ) => {
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
    setIsLoading(true);
    var accessionNumber = values.accessionNumber
      ? values.accessionNumber.split("-")[0]
      : "";
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
    getFromOpenElisServer(searchEndPoint, validationResults);
  };

  const handleChange = () => {};

  const loadNextResultsPage = () => {
    setIsLoading(true);
    getFromOpenElisServer(url + "&page=" + nextPage, validationResults);
  };

  const loadPreviousResultsPage = () => {
    setIsLoading(true);
    getFromOpenElisServer(url + "&page=" + previousPage, validationResults);
  };
  const fetchTestSections = (response) => {
    setTestSections(response);
  };

  const submitOnSelect = (e) => {
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
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
        getFromOpenElisServer(
          "/rest/user-test-sections/" + Roles.VALIDATION,
          (fetchedTestSections) => {
            const availableTestSections = Array.isArray(fetchedTestSections)
              ? fetchedTestSections
              : [];
            let testSection = availableTestSections.find(
              (testSection) => testSection.id === testSectionId,
            );
            let testSectionLabel = testSection ? testSection.value : "";
            setDefaultTestSectionId(testSectionId);
            setDefaultTestSectionLabel(testSectionLabel);
            fetchTestSections(availableTestSections);
          },
        );
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
          let searchValues = {
            ...searchFormValues,
            accessionNumber: accessionNumber,
          };
          handleSubmit(searchValues, param, rangeSearch);
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
      {isLoading && <Loading></Loading>}
      <Formik
        initialValues={searchFormValues}
        enableReinitialize={true}
        //validationSchema={}
        onSubmit={handleSubmit}
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
                              setFieldValue(field.name, rawValue);
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
