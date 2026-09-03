import React, { useContext, useState, useEffect, useRef } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import "../Style.css";
import { getFromOpenElisServer, postToOpenElisServer } from "../utils/Utils";
import {
  Form,
  TextInput,
  Button,
  Grid,
  Column,
  RadioButton,
  RadioButtonGroup,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
  Loading,
  Toggle,
  Tag,
} from "@carbon/react";
import { Person, ArrowLeft, ArrowRight } from "@carbon/react/icons";
import CustomLabNumberInput from "../common/CustomLabNumberInput";
import { patientSearchHeaderData } from "../data/PatientResultsTableHeaders";
import { Formik, Field } from "formik";
import SearchPatientFormValues from "../formModel/innitialValues/SearchPatientFormValues";
import { NotificationContext } from "../layout/Layout";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import CustomDatePicker from "../common/CustomDatePicker";
import { ConfigurationContext } from "../layout/Layout";
import CreatePatientFormValues from "../formModel/innitialValues/CreatePatientFormValues";
import AsyncAvatar from "./photoManagement/photoAvatar/AyncAvatar";
import type {
  Nullable,
  PatientRecord,
  PatientSearchCriteria,
  PatientSearchResponse,
} from "./types";

export interface SearchPatientFormProps {
  getSelectedPatient?: (patient: PatientRecord) => void;
  setOrderFormValues?: React.Dispatch<
    React.SetStateAction<Record<string, unknown>>
  >;
  orderFormValues?: Record<string, unknown>;
  showPatientSearch?: boolean;
  patientSearchStatus?: boolean;
  selectionMode?: "radio" | "button";
  allowExternalSearch?: boolean;
  allowExternalImport?: boolean;
  disableMergedSelection?: boolean;
  emptyPromptMessageId?: string;
  emptyResultsMessageId?: string;
  resultsTitleMessageId?: string;
  compactSearch?: boolean;
  selectionButtonMessageId?: string;
  [key: string]: unknown;
}

type ImportStatus = Record<string, boolean>;

export function SearchPatientForm(props: SearchPatientFormProps) {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { configurationProperties } = useContext(ConfigurationContext);

  const intl = useIntl();
  const {
    selectionMode = "radio",
    allowExternalSearch = true,
    allowExternalImport = true,
    disableMergedSelection = false,
    emptyPromptMessageId = "patient.search.empty.prompt",
    emptyResultsMessageId = "patient.search.empty.results",
    resultsTitleMessageId = "patient.results",
    compactSearch = false,
    selectionButtonMessageId = "label.button.select",
  } = props;

  const [dob, setDob] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<
    PatientRecord[]
  >([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [nextPage, setNextPage] = useState<Nullable<string>>(null);
  const [isToggled, setIsToggled] = useState(false);
  const [previousPage, setPreviousPage] = useState<Nullable<string>>(null);
  const [pagination, setPagination] = useState(false);
  const [currentApiPage, setCurrentApiPage] = useState<Nullable<number>>(null);
  const [totalApiPages, setTotalApiPages] = useState<Nullable<number>>(null);
  const [url, setUrl] = useState("");
  const [quickQuery, setQuickQuery] = useState("");
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [searchFormValues, setSearchFormValues] = useState(
    SearchPatientFormValues,
  );
  const [prevfirstName, setPrevfirstName] = useState("");
  const [prevlastName, setPrevlastName] = useState("");

  const getDataSourceLabel = (dataSource?: unknown) => {
    const normalized = String(dataSource || "").toLowerCase();
    if (normalized === "openelis" || normalized === "local") {
      return intl.formatMessage({ id: "patient.dataSource.local" });
    }
    if (normalized.includes("client registry")) {
      return intl.formatMessage({ id: "patient.dataSource.external" });
    }
    return String(dataSource || "");
  };

  const getGenderLabel = (gender?: unknown) => {
    if (gender === "M") {
      return intl.formatMessage({ id: "patient.male" });
    }
    if (gender === "F") {
      return intl.formatMessage({ id: "patient.female" });
    }
    return String(gender || "—");
  };
  // When a lab-number deep link drives the search, auto-select the matched
  // patient once results arrive (so the user lands on the patient page, not the
  // search results). Manual searches leave this false and just list results.
  const autoSelectOnResults = useRef(false);

  const handlePatientImport = (patientId: string) => {
    console.log("Import button clicked, patientId:", patientId);

    const patientSelected = patientSearchResults.find(
      (patient) => patient.patientID === patientId,
    );
    console.log("Patient selected:", patientSelected);

    if (!patientSelected) {
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "error.no.patient.data" }),
        kind: NotificationKinds.error,
      });
      return;
    }

    const dataToSend = {
      ...CreatePatientFormValues,
      patientPK: "",
      nationalId: patientSelected.nationalId || "",
      subjectNumber: "",
      lastName: patientSelected.lastName || "",
      firstName: patientSelected.firstName || "",
      streetAddress: patientSelected.address?.street || "",
      city: patientSelected.address?.city || "",
      primaryPhone: patientSelected.contactPhone || "",
      gender: patientSelected.gender || "",
      birthDateForDisplay: patientSelected.birthdate || "",
      commune: patientSelected.commune || "",
      education: patientSelected.education || "",
      maritialStatus: patientSelected.maritalStatus || "",
      nationality: patientSelected.nationality || "",
      healthDistrict: patientSelected.healthDistrict || "",
      healthRegion: patientSelected.healthRegion || "",
      otherNationality: patientSelected.otherNationality || "",
      patientContact: {
        person: {
          firstName: patientSelected.contact?.firstName || "",
          lastName: patientSelected.contact?.lastName || "",
          primaryPhone: patientSelected.contact?.primaryPhone || "",
          email: patientSelected.contact?.email || "",
        },
      },
    };

    console.log("Data to send:", dataToSend);

    postToOpenElisServer(
      "/rest/PatientManagement",
      JSON.stringify(dataToSend),
      (status) => {
        handlePost(status, patientId);
      },
    );
  };

  const handlePost = (status: number, patientId: string) => {
    setNotificationVisible(true);
    if (status === 200) {
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "success.import.patient" }),
        kind: NotificationKinds.success,
      });
      setImportStatus((prevStatus) => ({
        ...prevStatus,
        [patientId]: true,
      }));
    } else {
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "error.import.patient" }),
        kind: NotificationKinds.error,
      });
    }
  };

  const handleSubmit = (values: PatientSearchCriteria) => {
    setHasSearched(true);
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
    setPage(1);
    setPatientSearchResults([]);
    setLoading(true);
    values.dateOfBirth = dob;
    let searchEndPoint =
      "/rest/patient-search-results?" +
      "lastName=" +
      values.lastName +
      "&firstName=" +
      values.firstName +
      "&STNumber=" +
      values.patientId +
      "&subjectNumber=" +
      values.patientId +
      "&nationalID=" +
      values.patientId +
      "&labNumber=" +
      values.labNumber +
      "&guid=" +
      values.guid +
      "&dateOfBirth=" +
      values.dateOfBirth +
      "&gender=" +
      values.gender +
      "&suppressExternalSearch=" +
      values.suppressExternalSearch;

    if (values.crSearch === true) {
      searchEndPoint += "&crSearch=true";
    }

    getFromOpenElisServer(searchEndPoint, fetchPatientResults);
    setUrl(searchEndPoint);
  };

  const handleQuickSearch = () => {
    const normalizedQuery = quickQuery.trim();
    if (!normalizedQuery) return;

    setHasSearched(true);
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
    setPage(1);
    setPatientSearchResults([]);
    setLoading(true);

    const searchEndPoint =
      "/rest/patient-search-results?" +
      new URLSearchParams({
        quickQuery: normalizedQuery,
        suppressExternalSearch: "true",
      }).toString();
    getFromOpenElisServer(searchEndPoint, fetchPatientResults);
    setUrl(searchEndPoint);
  };

  const loadNextResultsPage = () => {
    setLoading(true);
    getFromOpenElisServer(url + "&page=" + nextPage, fetchPatientResults);
  };

  const loadPreviousResultsPage = () => {
    setLoading(true);
    getFromOpenElisServer(url + "&page=" + previousPage, fetchPatientResults);
  };

  const toggle = () => {
    setIsToggled((prev) => !prev);
  };

  const fetchPatientResults = (res: PatientSearchResponse | undefined) => {
    if (!res || !res.patientSearchResults) {
      setPatientSearchResults([]);
      setLoading(false);
      return;
    }
    let patientsResults = res.patientSearchResults;
    // Filter out the EQA placeholder patient (NULL/NULL)
    patientsResults = patientsResults.filter(
      (p) => !(p.lastName === "NULL" && p.firstName === "NULL"),
    );
    if (patientsResults.length > 0) {
      patientsResults.forEach((item) => (item.id = item.patientID));
      setPatientSearchResults(patientsResults);
      if (autoSelectOnResults.current) {
        autoSelectOnResults.current = false;
        const localPatient =
          patientsResults.find((p) => p.dataSourceName === "OpenElis") ||
          patientsResults[0];
        if (localPatient) {
          getFromOpenElisServer(
            "/rest/patient-details?patientID=" + localPatient.patientID,
            fetchPatientDetails,
          );
        }
      }
    } else {
      setPatientSearchResults([]);
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "patient.search.nopatient" }),
        kind: NotificationKinds.warning,
      });
      setNotificationVisible(true);
    }
    if (res.paging) {
      const { totalPages, currentPage } = res.paging as {
        totalPages: string;
        currentPage: string;
      };
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
    setLoading(false);
  };

  const fetchPatientDetails = (patientDetails: PatientRecord) => {
    getFromOpenElisServer(
      `/rest/patient-photos/${patientDetails.patientPK}/${false}`,
      (response) => {
        if (response && response.data) {
          patientDetails.photo = response.data;
        }
      },
    );
    props.getSelectedPatient?.(patientDetails);
  };

  const handleDatePickerChange = (date: string) => {
    setDob(date);
  };

  function handleFirstNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    const regexFlags = "iu";
    const regex = new RegExp(
      configurationProperties.FIRST_NAME_REGEX,
      regexFlags,
    );
    const value = event.target.value;
    if (!regex.test(value)) {
      event.target.value = prevfirstName;
    }
    setPrevfirstName(event.target.value);
  }

  function handleLastNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    const regexFlags = "iu";
    const regex = new RegExp(
      configurationProperties.LAST_NAME_REGEX,
      regexFlags,
    );
    const value = event.target.value;
    if (!regex.test(value)) {
      event.target.value = prevlastName;
    }
    setPrevlastName(event.target.value);
  }

  const selectPatientById = (patientId: string) => {
    const patientSelected = patientSearchResults.find((patient) => {
      return patient.patientID === patientId;
    });

    if (!patientSelected) return;

    const searchEndPoint =
      "/rest/patient-details?patientID=" + patientSelected.patientID;
    getFromOpenElisServer(searchEndPoint, fetchPatientDetails);
  };

  const patientSelected = (e: React.MouseEvent<HTMLElement>) => {
    selectPatientById(e.currentTarget.id);
  };

  const handlePageChange = (pageInfo: { page: number; pageSize: number }) => {
    if (page != pageInfo.page) {
      setPage(pageInfo.page);
    }

    if (pageSize != pageInfo.pageSize) {
      setPageSize(pageInfo.pageSize);
    }
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("patientId");
    if (patientId) {
      const searchEndPoint = "/rest/patient-details?patientID=" + patientId;
      getFromOpenElisServer(searchEndPoint, fetchPatientDetails);
      return;
    }
    // Deep link from elsewhere (e.g. the Validation page) — prefill the lab
    // number and run the search so the matching patient surfaces immediately.
    const labNumber = params.get("labNumber");
    if (labNumber) {
      autoSelectOnResults.current = true;
      setSearchFormValues({ ...SearchPatientFormValues, labNumber });
      handleSubmit({ ...SearchPatientFormValues, labNumber });
    }
  }, []);
  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      {loading && <Loading />}
      <Formik
        initialValues={searchFormValues}
        enableReinitialize={true}
        // validationSchema={}
        onSubmit={handleSubmit}
        onChange
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
            className="patient-search-form"
            onSubmit={handleSubmit}
            onChange={handleChange}
            onBlur={handleBlur}
          >
            {compactSearch && !showAdvancedSearch ? (
              <div className="patient-compact-search">
                <TextInput
                  id="patientManagementQuickQuery"
                  labelText={intl.formatMessage({
                    id: "patient.quickSearch.label",
                  })}
                  placeholder={intl.formatMessage({
                    id: "patient.quickSearch.placeholder",
                  })}
                  value={quickQuery}
                  onChange={(event) => setQuickQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleQuickSearch();
                    }
                  }}
                />
                <div className="patient-compact-search__actions">
                  <Button
                    type="button"
                    kind="primary"
                    onClick={handleQuickSearch}
                    disabled={loading || !quickQuery.trim()}
                  >
                    <FormattedMessage id="label.button.search" />
                  </Button>
                  <Button
                    type="button"
                    kind="ghost"
                    onClick={() => setShowAdvancedSearch(true)}
                  >
                    <FormattedMessage id="advanced.search" />
                  </Button>
                </div>
                <p className="patient-compact-search__helper">
                  <FormattedMessage id="patient.management.quickSearch.helper" />
                </p>
              </div>
            ) : (
              <>
                {compactSearch && (
                  <div className="patient-advanced-search__header">
                    <strong>
                      <FormattedMessage id="advanced.search" />
                    </strong>
                    <Button
                      type="button"
                      kind="ghost"
                      size="sm"
                      onClick={() => setShowAdvancedSearch(false)}
                    >
                      <FormattedMessage id="patient.search.advanced.hide" />
                    </Button>
                  </div>
                )}
                <Grid className="patient-search-grid">
                  <Field name="guid">
                    {({ field }) => (
                      <input type="hidden" name={field.name} id={field.name} />
                    )}
                  </Field>
                  <Column lg={8} md={4} sm={4}>
                    <Field name="patientId">
                      {({ field }) => (
                        <TextInput
                          name={field.name}
                          value={values[field.name]}
                          placeholder={intl.formatMessage({
                            id: "input.placeholder.patientId",
                          })}
                          labelText={intl.formatMessage({
                            id: "patient.id",
                            defaultMessage: "Patient Id",
                          })}
                          id={field.name}
                        />
                      )}
                    </Field>
                  </Column>
                  <Column lg={8} md={4} sm={4}>
                    <Field name="labNumber">
                      {({ field }) => (
                        <CustomLabNumberInput
                          name={field.name}
                          placeholder={intl.formatMessage({
                            id: "input.placeholder.prevLabNumber",
                          })}
                          labelText={intl.formatMessage({
                            id: "patient.prev.lab.no",
                            defaultMessage: "Previous Lab Number",
                          })}
                          id={field.name}
                          value={values[field.name]}
                          onChange={(e, rawValue) => {
                            setFieldValue(field.name, rawValue);
                          }}
                        />
                      )}
                    </Field>
                  </Column>
                  <Column lg={8} md={4} sm={4}>
                    <Field name="lastName">
                      {({ field }) => (
                        <TextInput
                          name={field.name}
                          placeholder={intl.formatMessage({
                            id: "input.placeholder.patientLastName",
                          })}
                          labelText={intl.formatMessage({
                            id: "patient.last.name",
                            defaultMessage: "Last Name",
                          })}
                          id={field.name}
                          onChange={(e) => handleLastNameChange(e)}
                        />
                      )}
                    </Field>
                  </Column>
                  <Column lg={8} md={4} sm={4}>
                    <Field name="firstName">
                      {({ field }) => (
                        <TextInput
                          name={field.name}
                          placeholder={intl.formatMessage({
                            id: "input.placeholder.patientFirstName",
                          })}
                          labelText={intl.formatMessage({
                            id: "patient.first.name",
                            defaultMessage: "First Name",
                          })}
                          id={field.name}
                          onChange={(e) => handleFirstNameChange(e)}
                        />
                      )}
                    </Field>
                  </Column>
                  <Column lg={8} md={4} sm={4}>
                    <Field name="dateOfBirth">
                      {({ field }) => (
                        <CustomDatePicker
                          id={"date-picker-default-id"}
                          labelText={intl.formatMessage({
                            id: "patient.dob",
                            defaultMessage: "Date of Birth",
                          })}
                          autofillDate={true}
                          value={values.birthDateForDisplay || ""}
                          onChange={(date) => handleDatePickerChange(date)}
                          name={field.name}
                          disallowFutureDate={true}
                        />
                      )}
                    </Field>
                  </Column>
                  <Column lg={8} md={4} sm={4}>
                    <Field name="gender">
                      {({ field }) => (
                        <RadioButtonGroup
                          defaultSelected=""
                          legendText={intl.formatMessage({
                            id: "patient.gender",
                            defaultMessage: "Gender",
                          })}
                          name={field.name}
                          id="search_patient_gender"
                        >
                          <RadioButton
                            id="search-radio-1"
                            labelText={intl.formatMessage({
                              id: "patient.male",
                              defaultMessage: "Male",
                            })}
                            value="M"
                          />
                          <RadioButton
                            id="search-radio-2"
                            labelText={intl.formatMessage({
                              id: "patient.female",
                              defaultMessage: "Female",
                            })}
                            value="F"
                          />
                        </RadioButtonGroup>
                      )}
                    </Field>
                  </Column>
                  <Column lg={16} md={8} sm={4}>
                    <div className="patient-search-actions">
                      <Button
                        id="local_search"
                        kind="primary"
                        type="submit"
                        data-cy="searchPatientButton"
                        onClick={() =>
                          setFieldValue("suppressExternalSearch", true)
                        }
                      >
                        <FormattedMessage id="label.button.search" />
                      </Button>
                      {allowExternalSearch && (
                        <Button
                          id="external_search"
                          type="submit"
                          disabled={
                            configurationProperties.UseExternalPatientInfo ===
                            "false"
                          }
                          kind="tertiary"
                          onClick={() =>
                            setFieldValue("suppressExternalSearch", false)
                          }
                        >
                          <FormattedMessage
                            id="label.button.externalsearch"
                            defaultMessage="External Search"
                          />
                        </Button>
                      )}
                      {allowExternalSearch &&
                        configurationProperties.ENABLE_CLIENT_REGISTRY ===
                          "true" && (
                          <Toggle
                            labelText={intl.formatMessage({
                              id: "patient.search.client.registry",
                            })}
                            labelA={intl.formatMessage({ id: "label.no" })}
                            labelB={intl.formatMessage({ id: "label.yes" })}
                            id="toggle-cr"
                            toggled={isToggled}
                            onClick={() => {
                              toggle();
                              setFieldValue("crSearch", !isToggled);
                            }}
                          />
                        )}
                    </div>
                  </Column>
                </Grid>
              </>
            )}
          </Form>
        )}
      </Formik>
      <div className="patient-search-results" aria-live="polite">
        {patientSearchResults.length === 0 ? (
          <div className="oe-empty-state">
            <p>
              <FormattedMessage
                id={hasSearched ? emptyResultsMessageId : emptyPromptMessageId}
              />
            </p>
          </div>
        ) : (
          <>
            {pagination && (
              <Grid className="patient-api-pagination">
                <Column lg={16} md={8} sm={4}>
                  <div className="patient-api-pagination__controls">
                    <span className="patient-api-pagination__count">
                      {currentApiPage} / {totalApiPages}
                    </span>
                    <Button
                      hasIconOnly
                      kind="ghost"
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
                      kind="ghost"
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
            <DataTable
              rows={patientSearchResults}
              headers={patientSearchHeaderData}
              isSortable
            >
              {({ rows, headers, getHeaderProps, getTableProps }) => (
                <TableContainer
                  title={intl.formatMessage({ id: resultsTitleMessageId })}
                  data-cy="patientResultsTable"
                >
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        <TableHeader>
                          {selectionMode === "button" ? (
                            <FormattedMessage id="label.results.actions" />
                          ) : null}
                        </TableHeader>
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
                      {rows
                        .slice((page - 1) * pageSize, page * pageSize)
                        .map((row) => {
                          const dataSourceName = row.cells.find(
                            (cell) => cell.info.header === "dataSourceName",
                          )?.value;
                          const firstName =
                            row.cells.find(
                              (cell) => cell.info.header === "firstName",
                            )?.value || "";
                          const lastName =
                            row.cells.find(
                              (cell) => cell.info.header === "lastName",
                            )?.value || "";
                          const patientName =
                            `${firstName} ${lastName}`.trim() ||
                            intl.formatMessage({ id: "patient.label" });
                          const sourcePatient = patientSearchResults.find(
                            (p) => p.patientID === row.id,
                          );
                          const isMerged = sourcePatient?.isMerged === true;
                          const mergedIntoLabel =
                            sourcePatient?.mergedIntoNationalId ||
                            sourcePatient?.mergedIntoPatientId;

                          return (
                            <TableRow
                              key={row.id}
                              data-cy={`patient-result-row-${row.id}`}
                            >
                              <TableCell>
                                {dataSourceName === "OpenElis" ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "row",
                                    }}
                                  >
                                    {selectionMode === "button" ? (
                                      <Button
                                        kind="ghost"
                                        size="sm"
                                        id={row.id}
                                        onClick={() =>
                                          selectPatientById(row.id)
                                        }
                                        disabled={
                                          disableMergedSelection && isMerged
                                        }
                                      >
                                        <FormattedMessage
                                          id={selectionButtonMessageId}
                                        />
                                      </Button>
                                    ) : (
                                      <RadioButton
                                        data-cy="radioButton"
                                        name="radio-group"
                                        onClick={patientSelected}
                                        labelText={`${intl.formatMessage({
                                          id: "label.button.select",
                                        })} ${patientName}`}
                                        hideLabel
                                        id={row.id}
                                      />
                                    )}
                                    <AsyncAvatar
                                      patientId={row.id}
                                      hasPhoto={true}
                                      patientName={patientName}
                                    />
                                    {isMerged && (
                                      <Tag
                                        type="magenta"
                                        size="sm"
                                        title={
                                          mergedIntoLabel
                                            ? intl.formatMessage(
                                                {
                                                  id: "patient.search.merged.into",
                                                },
                                                { identifier: mergedIntoLabel },
                                              )
                                            : intl.formatMessage({
                                                id: "patient.search.merged.tag",
                                              })
                                        }
                                        style={{ marginLeft: "0.5rem" }}
                                      >
                                        <FormattedMessage
                                          id="patient.search.merged.tag"
                                          defaultMessage="Merged"
                                        />
                                      </Tag>
                                    )}
                                  </div>
                                ) : (
                                  <span></span>
                                )}
                              </TableCell>

                              {row.cells.map((cell) => (
                                <TableCell key={cell.id}>
                                  {cell.info.header === "dataSourceName" ? (
                                    <>
                                      <Tag
                                        type={
                                          cell.value === "OpenElis"
                                            ? "red"
                                            : cell.value ===
                                                "Open Client Registry"
                                              ? "green"
                                              : "gray"
                                        }
                                      >
                                        {getDataSourceLabel(cell.value)}
                                      </Tag>
                                      &nbsp;&nbsp; &nbsp;&nbsp; &nbsp;&nbsp;
                                      {allowExternalImport &&
                                      dataSourceName ===
                                        "Open Client Registry" ? (
                                        <Button
                                          id={row.id}
                                          kind="tertiary"
                                          onClick={() =>
                                            handlePatientImport(row.id)
                                          }
                                          size="md"
                                          disabled={importStatus[row.id]}
                                        >
                                          <Person size={16} />
                                          <span>
                                            &nbsp;&nbsp;
                                            <FormattedMessage
                                              id={
                                                importStatus[row.id]
                                                  ? "patient.search.imported"
                                                  : "patient.search.import"
                                              }
                                            />
                                          </span>
                                        </Button>
                                      ) : (
                                        <span></span>
                                      )}
                                    </>
                                  ) : cell.info.header === "gender" ? (
                                    getGenderLabel(cell.value)
                                  ) : (
                                    cell.value
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
            <Pagination
              onChange={handlePageChange}
              page={page}
              pageSize={pageSize}
              pageSizes={[10, 20, 30, 50, 100]}
              totalItems={patientSearchResults.length}
              forwardText={intl.formatMessage({ id: "pagination.forward" })}
              backwardText={intl.formatMessage({ id: "pagination.backward" })}
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
              pageSelectLabelText={(total) =>
                intl.formatMessage(
                  { id: "pagination.page-select" },
                  { total },
                )
              }
              pageText={(page, pagesUnknown) =>
                intl.formatMessage(
                  { id: "pagination.page" },
                  { page: pagesUnknown ? "" : page },
                )
              }
            />
          </>
        )}
      </div>
    </>
  );
}

export default SearchPatientForm;
