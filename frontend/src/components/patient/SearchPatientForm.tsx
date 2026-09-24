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
  InlineNotification,
} from "@carbon/react";
import { Person } from "@carbon/react/icons";
import CustomLabNumberInput from "../common/CustomLabNumberInput";
import { patientSearchHeaderData } from "../data/PatientResultsTableHeaders";
import { Formik, Field, useFormikContext } from "formik";
import SearchPatientFormValues from "../formModel/innitialValues/SearchPatientFormValues";
import { NotificationContext } from "../layout/Layout";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import CustomDatePicker from "../common/CustomDatePicker";
import { ConfigurationContext } from "../layout/Layout";
import CreatePatientFormValues from "../formModel/innitialValues/CreatePatientFormValues";
import AsyncAvatar from "./photoManagement/photoAvatar/AyncAvatar";
import type {
  PatientRecord,
  PatientSearchCriteria,
  PatientSearchResponse,
} from "./types";
import {
  validatePatientSearchPage,
  type PatientSearchPagingContext,
} from "./patientSearchPagingContract";

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
  /** Router search string, supplied by PatientManagement for deterministic deep links. */
  initialSearch?: string;
  /** Legacy alias retained for existing embedded callers. */
  locationSearch?: string;
  initialState?: PatientSearchFormState;
  onStateChange?: (state: PatientSearchFormState) => void;
  [key: string]: unknown;
}

type ImportStatus = Record<string, boolean>;

export interface PatientSearchFormState {
  draft?: PatientSearchCriteria;
  submitted?: PatientSearchCriteria;
  hasSearched?: boolean;
  page?: number;
  pageSize?: number;
  apiPage?: number | null;
}

const copySearchCriteria = (
  criteria: PatientSearchCriteria | undefined,
  localOnly: boolean,
): PatientSearchCriteria => {
  const normalized: PatientSearchCriteria = {
    patientId: String(criteria?.patientId || ""),
    labNumber: String(criteria?.labNumber || ""),
    lastName: String(criteria?.lastName || ""),
    firstName: String(criteria?.firstName || ""),
    dateOfBirth: String(criteria?.dateOfBirth || ""),
    guid: String(criteria?.guid || ""),
    gender: String(criteria?.gender || ""),
    suppressExternalSearch: localOnly
      ? true
      : (criteria?.suppressExternalSearch ?? true),
  };

  if (!localOnly && criteria?.crSearch === true) normalized.crSearch = true;
  return normalized;
};

function SearchStatePublisher({
  localOnly,
  submitted,
  hasSearched,
  page,
  pageSize,
  onStateChange,
}: {
  localOnly: boolean;
  submitted?: PatientSearchCriteria;
  hasSearched: boolean;
  page: number;
  pageSize: number;
  onStateChange?: (state: PatientSearchFormState) => void;
}) {
  const { values } = useFormikContext<PatientSearchCriteria>();

  useEffect(() => {
    onStateChange?.({
      draft: copySearchCriteria(values, localOnly),
      submitted: submitted
        ? copySearchCriteria(submitted, localOnly)
        : undefined,
      hasSearched,
      page,
      pageSize,
      apiPage: page,
    });
  }, [
    hasSearched,
    localOnly,
    onStateChange,
    page,
    pageSize,
    submitted,
    values,
  ]);

  return null;
}

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
    initialState,
    onStateChange,
  } = props;

  const localOnly = !allowExternalSearch;
  const initialSnapshot = useRef({
    draft: copySearchCriteria(
      initialState?.draft || SearchPatientFormValues,
      localOnly,
    ),
    submitted: initialState?.submitted
      ? copySearchCriteria(initialState.submitted, localOnly)
      : undefined,
    hasSearched: !!initialState?.hasSearched,
    page: initialState?.apiPage || initialState?.page || 1,
    pageSize: initialState?.pageSize || 99,
  });
  const [dob, setDob] = useState(
    String(initialSnapshot.current.draft.dateOfBirth || ""),
  );
  const [patientSearchResults, setPatientSearchResults] = useState<
    PatientRecord[]
  >([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>({});
  const [page, setPage] = useState(initialSnapshot.current.page);
  const [pageSize, setPageSize] = useState(initialSnapshot.current.pageSize);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [hasSearched, setHasSearched] = useState(
    initialSnapshot.current.hasSearched,
  );
  const [submittedCriteria, setSubmittedCriteria] = useState<
    PatientSearchCriteria | undefined
  >(initialSnapshot.current.submitted);
  const [isToggled, setIsToggled] = useState(false);
  const [pagination, setPagination] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [searchFormValues, setSearchFormValues] =
    useState<PatientSearchCriteria>(initialSnapshot.current.draft);
  const [prevfirstName, setPrevfirstName] = useState("");
  const [prevlastName, setPrevlastName] = useState("");
  const queryId = useRef("");
  const searchPagingContext = useRef<PatientSearchPagingContext | null>(null);
  const searchBaseUrl = useRef("");
  const requestGeneration = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const selectionGeneration = useRef(0);
  const selectionController = useRef<AbortController | null>(null);

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

  const cancelPatientSelection = () => {
    selectionController.current?.abort();
    selectionController.current = null;
    selectionGeneration.current += 1;
  };

  const reportPatientDetailsError = () => {
    addNotification({
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "patient.fetch.error" }),
      kind: NotificationKinds.error,
    });
    setNotificationVisible(true);
  };

  const acceptPatientDetails = (patientDetails: PatientRecord) => {
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

  const requestPatientDetails = (patient: PatientRecord) => {
    const requestedIdentity = String(
      patient.patientID || patient.patientPK || patient.id || "",
    ).trim();
    const expectedPatientPK = String(
      patient.patientPK || patient.patientID || patient.id || "",
    ).trim();
    if (!requestedIdentity || !expectedPatientPK) {
      reportPatientDetailsError();
      return;
    }

    selectionController.current?.abort();
    const controller = new AbortController();
    selectionController.current = controller;
    const generation = ++selectionGeneration.current;
    getFromOpenElisServer<PatientRecord>(
      `/rest/patient-details?patientID=${encodeURIComponent(requestedIdentity)}`,
      (patientDetails) => {
        if (
          generation !== selectionGeneration.current ||
          controller.signal.aborted
        ) {
          return;
        }
        const response = patientDetails as
          | (PatientRecord & { error?: unknown })
          | undefined;
        const responsePatientPK = String(response?.patientPK || "").trim();
        const responseStatus = Number(response?.status);
        if (
          !response ||
          typeof response !== "object" ||
          Array.isArray(response) ||
          response.error !== undefined ||
          (Number.isFinite(responseStatus) && responseStatus >= 400) ||
          !responsePatientPK ||
          responsePatientPK !== expectedPatientPK
        ) {
          reportPatientDetailsError();
          return;
        }
        acceptPatientDetails(response);
      },
      controller.signal,
    );
  };

  const handlePatientImport = (patientId: string) => {
    const patientSelected = patientSearchResults.find(
      (patient) => patient.patientID === patientId,
    );

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

  const criteriaSearchUrl = (
    values: PatientSearchCriteria,
    dateOfBirth = dob,
  ) => {
    const criteria = copySearchCriteria(
      { ...values, dateOfBirth: dateOfBirth || values.dateOfBirth },
      localOnly,
    );
    const params = new URLSearchParams({
      lastName: String(criteria.lastName || ""),
      firstName: String(criteria.firstName || ""),
      STNumber: String(criteria.patientId || ""),
      subjectNumber: String(criteria.patientId || ""),
      nationalID: String(criteria.patientId || ""),
      labNumber: String(criteria.labNumber || ""),
      guid: String(criteria.guid || ""),
      dateOfBirth: String(criteria.dateOfBirth || ""),
      gender: String(criteria.gender || ""),
      suppressExternalSearch: String(criteria.suppressExternalSearch ?? true),
    });
    if (!localOnly && criteria.crSearch === true) {
      params.set("crSearch", "true");
    }
    return `/rest/patient-search-results?${params.toString()}`;
  };

  const rejectPatientSearchResponse = () => {
    queryId.current = "";
    searchPagingContext.current = null;
    setPatientSearchResults([]);
    setSearchError(true);
    setPagination(false);
    setPage(1);
    setPageSize(99);
    setTotalItems(0);
    setTotalPages(1);
    setLoading(false);
    addNotification({
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "patient.management.list.error" }),
      kind: NotificationKinds.error,
    });
    setNotificationVisible(true);
  };

  const fetchPatientResults = (
    res: PatientSearchResponse | undefined,
    generation: number,
    requestedPage: number,
    expectedQueryId: string,
  ) => {
    if (generation !== requestGeneration.current) return;
    const established = expectedQueryId ? searchPagingContext.current : null;
    if (
      expectedQueryId &&
      (!established || established.queryId !== expectedQueryId)
    ) {
      rejectPatientSearchResponse();
      return;
    }
    const validated = validatePatientSearchPage(
      res,
      requestedPage,
      established,
    );
    if (!validated) {
      rejectPatientSearchResponse();
      return;
    }

    setSearchError(false);

    const patientsResults = validated.results
      .filter((p) => !(p.lastName === "NULL" && p.firstName === "NULL"))
      .map((item) => ({ ...item, id: item.patientID || item.id }));

    queryId.current = validated.queryId;
    searchPagingContext.current = {
      queryId: validated.queryId,
      totalItems: validated.totalItems,
      totalPages: validated.totalPages,
      pageSize: validated.pageSize,
    };
    setTotalItems(validated.totalItems);
    setPage(validated.currentPage);
    setTotalPages(validated.totalPages);
    setPagination(validated.totalPages > 1);
    setPageSize(validated.pageSize);

    if (patientsResults.length > 0) {
      setPatientSearchResults(patientsResults);
      if (autoSelectOnResults.current) {
        autoSelectOnResults.current = false;
        const localPatient =
          patientsResults.find((p) => p.dataSourceName === "OpenElis") ||
          patientsResults[0];
        if (localPatient) {
          requestPatientDetails(localPatient);
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
    setLoading(false);
  };

  const requestPatientSearch = (
    baseUrl: string,
    requestedPage = 1,
    existingQueryId = "",
    restorePage = 1,
  ) => {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const generation = ++requestGeneration.current;
    const params = new URLSearchParams(baseUrl.split("?")[1] || "");
    if (existingQueryId) {
      params.set("queryId", existingQueryId);
      params.set("page", String(requestedPage));
    }
    setLoading(true);
    getFromOpenElisServer<PatientSearchResponse>(
      `${baseUrl.split("?")[0]}?${params.toString()}`,
      (response) => {
        if (generation !== requestGeneration.current) return;
        if (
          !existingQueryId &&
          restorePage > 1 &&
          response &&
          Array.isArray(response.patientSearchResults)
        ) {
          const validated = validatePatientSearchPage(response, 1);
          if (!validated) {
            rejectPatientSearchResponse();
            return;
          }
          const targetPage = Math.min(restorePage, validated.totalPages);
          if (targetPage > 1) {
            queryId.current = validated.queryId;
            searchPagingContext.current = {
              queryId: validated.queryId,
              totalItems: validated.totalItems,
              totalPages: validated.totalPages,
              pageSize: validated.pageSize,
            };
            requestPatientSearch(baseUrl, targetPage, validated.queryId);
            return;
          }
        }
        fetchPatientResults(
          response,
          generation,
          requestedPage,
          existingQueryId,
        );
      },
      controller.signal,
    );
  };

  const startPatientSearch = (baseUrl: string, autoSelect = false) => {
    cancelPatientSelection();
    autoSelectOnResults.current = autoSelect;
    queryId.current = "";
    searchPagingContext.current = null;
    searchBaseUrl.current = baseUrl;
    setHasSearched(true);
    setSearchError(false);
    setPagination(false);
    setPage(1);
    setTotalPages(1);
    setTotalItems(0);
    setPatientSearchResults([]);
    requestPatientSearch(baseUrl);
  };

  const handleSubmit = (values: PatientSearchCriteria) => {
    const criteria = copySearchCriteria(
      { ...values, dateOfBirth: dob || values.dateOfBirth },
      localOnly,
    );
    setSubmittedCriteria(criteria);
    startPatientSearch(criteriaSearchUrl(criteria));
  };

  const handleQuickSearch = () => {
    const normalizedQuery = quickQuery.trim();
    if (!normalizedQuery) return;

    const searchEndPoint =
      "/rest/patient-search-results?" +
      new URLSearchParams({
        quickQuery: normalizedQuery,
        suppressExternalSearch: "true",
      }).toString();
    startPatientSearch(searchEndPoint);
  };

  const loadResultsPage = (requestedPage: number) => {
    if (!queryId.current || requestedPage === page) return;
    cancelPatientSelection();
    requestPatientSearch(searchBaseUrl.current, requestedPage, queryId.current);
  };

  const toggle = () => {
    setIsToggled((prev) => !prev);
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
    requestPatientDetails(patientSelected);
  };

  const patientSelected = (e: React.MouseEvent<HTMLElement>) => {
    selectPatientById(e.currentTarget.id);
  };

  useEffect(() => {
    const params = new URLSearchParams(
      props.initialSearch ?? props.locationSearch ?? window.location.search,
    );
    const patientId = params.get("patientId");
    if (patientId) {
      requestPatientDetails({ patientID: patientId, patientPK: patientId });
    } else {
      const linkedQuickQuery = params.get("quickQuery")?.trim();
      if (linkedQuickQuery) {
        setQuickQuery(linkedQuickQuery);
        startPatientSearch(
          "/rest/patient-search-results?" +
            new URLSearchParams({
              quickQuery: linkedQuickQuery,
              suppressExternalSearch: "true",
            }).toString(),
        );
      } else {
        const linkedDateOfBirth = params.get("dateOfBirth") || "";
        const linkedValues = copySearchCriteria(
          {
            ...SearchPatientFormValues,
            patientId:
              params.get("STNumber") ||
              params.get("subjectNumber") ||
              params.get("nationalID") ||
              "",
            labNumber: params.get("labNumber") || "",
            lastName: params.get("lastName") || "",
            firstName: params.get("firstName") || "",
            guid: params.get("guid") || "",
            gender: params.get("gender") || "",
            dateOfBirth: linkedDateOfBirth,
          },
          localOnly,
        );
        const hasAdvancedCriteria = Object.entries(linkedValues).some(
          ([key, value]) =>
            !["suppressExternalSearch", "crSearch"].includes(key) &&
            String(value || "").trim().length > 0,
        );
        if (hasAdvancedCriteria) {
          setShowAdvancedSearch(true);
          setDob(linkedDateOfBirth);
          setSearchFormValues(linkedValues);
          setSubmittedCriteria(linkedValues);
          startPatientSearch(
            criteriaSearchUrl(linkedValues, linkedDateOfBirth),
            !!linkedValues.labNumber,
          );
        } else if (
          initialSnapshot.current.hasSearched &&
          initialSnapshot.current.submitted
        ) {
          const restoredCriteria = initialSnapshot.current.submitted;
          const restoredUrl = criteriaSearchUrl(
            restoredCriteria,
            String(restoredCriteria.dateOfBirth || ""),
          );
          searchBaseUrl.current = restoredUrl;
          setSubmittedCriteria(restoredCriteria);
          setHasSearched(true);
          setPagination(false);
          setTotalPages(1);
          setPatientSearchResults([]);
          requestPatientSearch(
            restoredUrl,
            1,
            "",
            initialSnapshot.current.page,
          );
        }
      }
    }
    return () => {
      requestGeneration.current += 1;
      searchController.current?.abort();
      cancelPatientSelection();
    };
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
            <SearchStatePublisher
              localOnly={localOnly}
              submitted={submittedCriteria}
              hasSearched={hasSearched}
              page={page}
              pageSize={pageSize}
              onStateChange={onStateChange}
            />
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
                          value={values.lastName || ""}
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
                          value={values.firstName || ""}
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
                          value={dob || values.dateOfBirth || ""}
                          updateStateValue={true}
                          onChange={(date) => {
                            handleDatePickerChange(date);
                            setFieldValue("dateOfBirth", date);
                          }}
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
                          valueSelected={values.gender || ""}
                          legendText={intl.formatMessage({
                            id: "patient.gender",
                            defaultMessage: "Gender",
                          })}
                          name={field.name}
                          id="search_patient_gender"
                          onChange={(value) => setFieldValue(field.name, value)}
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
        {searchError ? (
          <InlineNotification
            kind="error"
            hideCloseButton
            title={intl.formatMessage({ id: "patient.management.list.error" })}
            subtitle={intl.formatMessage({
              id: "patient.management.list.error.helper",
            })}
          />
        ) : patientSearchResults.length === 0 ? (
          <div className="oe-empty-state">
            <p>
              <FormattedMessage
                id={hasSearched ? emptyResultsMessageId : emptyPromptMessageId}
              />
            </p>
          </div>
        ) : (
          <>
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
                      {rows.map((row) => {
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
                                      onClick={() => selectPatientById(row.id)}
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
            {pagination && (
              <>
                <p className="patient-api-pagination__count" aria-live="polite">
                  {page} / {totalPages}
                </p>
                <Pagination
                  onChange={({ page: requestedPage }) =>
                    loadResultsPage(requestedPage)
                  }
                  page={page}
                  pageSize={pageSize}
                  pageSizes={[pageSize]}
                  totalItems={totalItems}
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
                  pageSelectLabelText={(total) =>
                    intl.formatMessage(
                      { id: "pagination.page-select" },
                      { total },
                    )
                  }
                  pageText={(pageNumber, pagesUnknown) =>
                    intl.formatMessage(
                      { id: "pagination.page" },
                      { page: pagesUnknown ? "" : pageNumber },
                    )
                  }
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default SearchPatientForm;
