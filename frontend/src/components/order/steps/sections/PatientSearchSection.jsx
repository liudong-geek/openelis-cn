import React, { useState, useEffect, useRef, useCallback } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useIntl, FormattedMessage } from "react-intl";
import {
  Tile,
  Button,
  TextInput,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
  Tag,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import { getFromOpenElisServer } from "../../../utils/Utils";
import CreatePatientForm from "../../../patient/CreatePatientForm";

const emptyPatient = () => ({
  patientPK: "",
  guid: "",
  firstName: "",
  lastName: "",
  birthDateForDisplay: "",
  gender: "",
  nationalId: "",
  patientUpdateStatus: "",
});
const newPatientSelection = {
  id: "",
  healthRegion: [],
  nationalId: "",
  subjectNumber: "",
};
const patientId = (value) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const emptyPhoneValidation = () => ({
  primaryPhone: { body: "", status: true },
  contactPhone: { body: "", status: true },
});

/**
 * PatientSearchSection - Patient search with results table and selection card
 *
 * Implements:
 * - ORD-2: Patient search (local + Client Registry)
 * - ORD-9: Selected patient summary card
 * - XC-2: Unified search pattern
 */

const PatientSearchSection = ({
  orderData,
  setOrderData,
  setPhoneValidation,
  isReadOnly,
}) => {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const componentMounted = useRef(true);
  const requestRef = useRef(null);
  const draftRef = useRef(null);
  const savedDraftRef = useRef(null);
  const latest = useRef(null);

  // Tab state
  const [activeTab, setActiveTab] = useState("search"); // "search" | "new"

  // Order entry uses one compact selector. The complete multi-field search and
  // all CRUD operations remain in Patient Management.
  const [quickQuery, setQuickQuery] = useState("");
  const [searchAttempted, setSearchAttempted] = useState(false);

  // Results state
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // The application is the single source of truth for the selected identity.
  const selectedPatient = orderData?.patientProperties?.patientPK
    ? orderData.patientProperties
    : null;
  const pendingPatient =
    !selectedPatient &&
    orderData?.patientProperties?.patientUpdateStatus === "ADD"
      ? orderData.patientProperties
      : null;
  const orderBaseKey = JSON.stringify([
    location.key,
    location.pathname,
    location.search,
    orderData?.sampleOrderItems?.sampleId,
  ]);
  const labNo = orderData?.sampleOrderItems?.labNo || "";
  const orderKey = JSON.stringify([orderBaseKey, labNo]);
  latest.current = { orderKey, orderData, isReadOnly };

  // First-save numbering changes only the number, not the application or its
  // patient draft. Permit this one-way transition only for the same draft object.
  if (
    draftRef.current &&
    !draftRef.current.labNo &&
    labNo &&
    draftRef.current.orderBaseKey === orderBaseKey &&
    draftRef.current.patientProperties === orderData?.patientProperties
  ) {
    draftRef.current.orderKey = orderKey;
    draftRef.current.labNo = labNo;
  }

  const cancelRequest = useCallback(() => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
    setIsSearching(false);
    setIsSelecting(false);
    setErrorKey(null);
  }, []);

  const isCurrentRequest = (request, data = latest.current.orderData) =>
    componentMounted.current &&
    requestRef.current === request &&
    !latest.current.isReadOnly &&
    request.orderKey === latest.current.orderKey &&
    request.patientProperties === data?.patientProperties;

  const beginRequest = () => {
    cancelRequest();
    const request = {
      controller: new AbortController(),
      orderKey,
      patientProperties: orderData?.patientProperties,
    };
    requestRef.current = request;
    return request;
  };

  // A new-patient form owns only its current application draft. In particular,
  // a late Formik observer/validation must not write into another application.
  const isCurrentDraft = useCallback(
    (draft, data = latest.current.orderData) =>
      componentMounted.current &&
      draft &&
      draftRef.current === draft &&
      !latest.current.isReadOnly &&
      draft.orderKey === latest.current.orderKey &&
      !data?.patientProperties?.patientPK &&
      draft.patientProperties === data?.patientProperties,
    [],
  );
  const draft = draftRef.current;
  const showNewPatient = activeTab === "new" && isCurrentDraft(draft);

  useEffect(() => {
    componentMounted.current = true;
    return () => {
      componentMounted.current = false;
      requestRef.current?.controller.abort();
      requestRef.current = null;
      draftRef.current = null;
    };
  }, []);

  // Reset stale presentation when a barcode load, readonly transition or route
  // replaces the application. Callback checks also run before effects flush.
  useEffect(() => {
    if (requestRef.current && !isCurrentRequest(requestRef.current)) {
      cancelRequest();
    }
    if (draftRef.current && !isCurrentDraft(draftRef.current)) {
      draftRef.current = null;
      setActiveTab("search");
    }
  });
  useEffect(() => {
    cancelRequest();
    setQuickQuery("");
    setSearchResults([]);
    setTotalItems(0);
    setCurrentPage(1);
    setSearchAttempted(false);
  }, [orderKey, isReadOnly, selectedPatient?.patientPK, cancelRequest]);

  // Execute search
  const handleSearch = () => {
    const query = quickQuery.trim();
    if (!query || isReadOnly || isSearching || selectedPatient) return;

    const request = beginRequest();
    setIsSearching(true);
    setSearchResults([]);
    setTotalItems(0);
    setCurrentPage(1);
    setSearchAttempted(true);

    const params = new URLSearchParams({
      quickQuery: query,
      suppressExternalSearch: "true",
    });
    const searchEndpoint = `/rest/patient-search-results?${params.toString()}`;

    getFromOpenElisServer(
      searchEndpoint,
      (response) => {
        if (isCurrentRequest(request)) {
          setIsSearching(false);
          const results = response?.patientSearchResults;
          if (
            !Array.isArray(results) ||
            results.some((p) => !p || !patientId(p.patientID || p.id))
          ) {
            setErrorKey("patient.management.list.error");
          } else {
            // Map results to ensure each has an 'id' field for DataTable
            const mappedResults = results.map((p) => ({
              ...p,
              id: patientId(p.patientID || p.id),
              displayName:
                `${p.lastName || ""}${p.firstName || ""}`.trim() || "—",
              patientNumber:
                p.nationalId ||
                p.subjectNumber ||
                p.STNumber ||
                p.patientID ||
                "—",
              genderDisplay:
                p.gender === "M"
                  ? intl.formatMessage({ id: "patient.male" })
                  : p.gender === "F"
                    ? intl.formatMessage({ id: "patient.female" })
                    : p.gender || "—",
              birthDateForDisplay:
                p.birthDateForDisplay || p.birthdate || p.dob || "—",
              dataSource: "Local",
            }));
            setSearchResults(mappedResults);
            setTotalItems(mappedResults.length);
          }
        }
      },
      request.controller.signal,
    );
  };

  // Clear search
  const handleClear = () => {
    if (isReadOnly) return;
    cancelRequest();
    setQuickQuery("");
    setSearchResults([]);
    setTotalItems(0);
    setSearchAttempted(false);
    setCurrentPage(1);
  };

  // Select patient
  const handleSelectPatient = (patient) => {
    // Get patientID from either field
    if (isReadOnly || isSelecting || !patient || patient.isMerged === true)
      return;
    const id = patientId(patient.patientID || patient.id);
    if (!id) return;
    const request = beginRequest();
    setIsSelecting(true);

    // Fetch full patient details
    getFromOpenElisServer(
      `/rest/patient-details?patientID=${encodeURIComponent(id)}`,
      (response) => {
        if (isCurrentRequest(request)) {
          setIsSelecting(false);
          if (
            !response ||
            patientId(response.patientPK) !== id ||
            response.isMerged === true
          ) {
            setErrorKey("patient.fetch.error");
            return;
          }
          savedDraftRef.current = null;
          setPhoneValidation?.(emptyPhoneValidation());
          // IMPORTANT: patientUpdateStatus must be INSIDE patientProperties for backend to recognize it
          setOrderData((prev) =>
            !isCurrentRequest(request, prev)
              ? prev
              : {
                  ...prev,
                  patientUpdateStatus: "UPDATE",
                  patientProperties: {
                    ...response,
                    patientUpdateStatus: "UPDATE", // Backend reads this from patientProperties
                  },
                },
          );
        }
      },
      request.controller.signal,
    );
  };

  // Clear selection
  const handleClearSelection = () => {
    if (isReadOnly) return;
    cancelRequest();
    draftRef.current = null;
    savedDraftRef.current = null;
    setPhoneValidation?.(emptyPhoneValidation());
    setOrderData((prev) => ({
      ...prev,
      patientUpdateStatus: "",
      patientProperties: emptyPatient(),
    }));
  };

  // Handle new patient tab
  const handleNewPatient = () => {
    if (isReadOnly) return;
    cancelRequest();
    const properties = pendingPatient || emptyPatient();
    draftRef.current = {
      orderKey,
      orderBaseKey,
      labNo,
      patientProperties: properties,
      phoneValidation:
        pendingPatient &&
        savedDraftRef.current?.patientProperties === pendingPatient
          ? savedDraftRef.current.phoneValidation
          : emptyPhoneValidation(),
    };
    savedDraftRef.current = draftRef.current;
    setPhoneValidation?.(draftRef.current.phoneValidation);
    if (!pendingPatient) {
      setOrderData((prev) => ({
        ...prev,
        patientUpdateStatus: "",
        patientProperties: properties,
      }));
    }
    setActiveTab("new");
  };

  const updateDraft = useCallback(
    (update) => {
      if (!isCurrentDraft(draft)) return;
      setOrderData((prev) => {
        if (!isCurrentDraft(draft, prev)) return prev;
        const next = typeof update === "function" ? update(prev) : update;
        draft.patientProperties = next.patientProperties;
        return next;
      });
    },
    [draft, isCurrentDraft, setOrderData],
  );
  const updateDraftPhone = useCallback(
    (validation) => {
      if (isCurrentDraft(draft)) {
        draft.phoneValidation = validation;
        setPhoneValidation?.(validation);
      }
    },
    [draft, isCurrentDraft, setPhoneValidation],
  );

  // Table headers
  const headers = [
    {
      key: "displayName",
      header: intl.formatMessage({
        id: "patient.name",
        defaultMessage: "Patient name",
      }),
    },
    {
      key: "genderDisplay",
      header: intl.formatMessage({
        id: "patient.gender",
        defaultMessage: "Gender",
      }),
    },
    {
      key: "birthDateForDisplay",
      header: intl.formatMessage({
        id: "patient.dob",
        defaultMessage: "Date of Birth",
      }),
    },
    {
      key: "patientNumber",
      header: intl.formatMessage({
        id: "patient.number",
        defaultMessage: "Patient number",
      }),
    },
    { key: "actions", header: "" },
  ];

  return (
    <Tile className="order-section patient-search-section">
      <div className="order-section-heading">
        <span className="order-section-heading__step">1</span>
        <div className="order-section-heading__copy">
          <h4 className="section-title">
            <FormattedMessage id="order.entry.patient.title" />
          </h4>
          <p>
            <FormattedMessage id="order.entry.patient.helper" />
          </p>
        </div>
        <div className="order-section-heading__actions">
          {showNewPatient && (
            <Button
              kind="ghost"
              size="sm"
              onClick={() => {
                draftRef.current = null;
                cancelRequest();
                setActiveTab("search");
              }}
            >
              <FormattedMessage id="patient.search.return" />
            </Button>
          )}
          <Button
            kind="ghost"
            size="sm"
            onClick={() => history.push("/PatientManagement")}
          >
            <FormattedMessage id="patient.manage.open" />
          </Button>
          {!showNewPatient && (
            <Button
              kind="tertiary"
              size="sm"
              onClick={handleNewPatient}
              disabled={isReadOnly}
            >
              <FormattedMessage
                id={pendingPatient ? "label.button.edit" : "new.patient.label"}
              />
            </Button>
          )}
        </div>
      </div>

      {/* Search Tab Content */}
      {!showNewPatient && (
        <div className="search-content">
          {pendingPatient && (
            <div className="selected-entity-card">
              <div className="selected-card-header">
                <Tag type="blue" size="sm">
                  <FormattedMessage id="order.saveStatus.unsaved" />
                </Tag>
                <Button
                  kind="ghost"
                  size="sm"
                  disabled={isReadOnly}
                  onClick={handleClearSelection}
                >
                  <FormattedMessage id="label.button.clear" />
                </Button>
              </div>
              <div className="selected-card-content">
                <h5>
                  {`${pendingPatient.lastName || ""}${pendingPatient.firstName || ""}` ||
                    intl.formatMessage({ id: "new.patient.label" })}
                </h5>
              </div>
            </div>
          )}
          {!selectedPatient && (
            <div className="patient-quick-search">
              <TextInput
                id="patientQuickQuery"
                labelText={intl.formatMessage({
                  id: "patient.quickSearch.label",
                })}
                placeholder={intl.formatMessage({
                  id: "patient.quickSearch.placeholder",
                })}
                value={quickQuery}
                onChange={(event) => {
                  handleClear();
                  setQuickQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
                disabled={isReadOnly}
              />
              <div className="search-buttons patient-quick-search__actions">
                <Button
                  kind="primary"
                  size="md"
                  onClick={handleSearch}
                  disabled={isSearching || isReadOnly || !quickQuery.trim()}
                >
                  <FormattedMessage id="label.button.search" />
                </Button>
                {(quickQuery || searchAttempted) && (
                  <Button
                    kind="ghost"
                    size="md"
                    onClick={handleClear}
                    disabled={isReadOnly}
                  >
                    <FormattedMessage id="label.button.clear" />
                  </Button>
                )}
              </div>
              <p className="helper-text patient-quick-search__helper">
                <FormattedMessage id="patient.quickSearch.helper" />
              </p>
            </div>
          )}

          {(isSearching || isSelecting) && (
            <InlineLoading
              description={intl.formatMessage({
                id: "patient.management.list.loading",
              })}
            />
          )}
          {errorKey && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({ id: errorKey })}
              subtitle={intl.formatMessage({
                id: "patient.management.list.error.helper",
              })}
            />
          )}

          {/* Selected Patient Card */}
          {selectedPatient && (
            <div className="selected-entity-card">
              <div className="selected-card-header">
                <Tag type="green" size="sm">
                  <FormattedMessage id="selected" defaultMessage="Selected" />
                </Tag>
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={isReadOnly}
                >
                  <FormattedMessage
                    id="label.button.clear"
                    defaultMessage="Clear"
                  />
                </Button>
              </div>
              <div className="selected-card-content">
                <h5>
                  {selectedPatient.lastName}
                  {selectedPatient.firstName}
                </h5>
                <p>
                  {selectedPatient.birthDateForDisplay && (
                    <>
                      <FormattedMessage id="patient.dob" />：
                      {selectedPatient.birthDateForDisplay}
                    </>
                  )}
                  {selectedPatient.gender && (
                    <>
                      {" · "}
                      {selectedPatient.gender === "M"
                        ? intl.formatMessage({ id: "patient.male" })
                        : selectedPatient.gender === "F"
                          ? intl.formatMessage({ id: "patient.female" })
                          : selectedPatient.gender}
                    </>
                  )}
                  {selectedPatient.nationalId && (
                    <>
                      {" · "}
                      <FormattedMessage id="patient.natioanalid" />：
                      {selectedPatient.nationalId}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Results Table */}
          {searchResults.length > 0 && !selectedPatient && (
            <div className="search-results">
              <h5 className="results-title">
                <FormattedMessage
                  id="patient.results"
                  defaultMessage="Patient Results"
                />
              </h5>
              <DataTable
                rows={searchResults.slice(
                  (currentPage - 1) * pageSize,
                  currentPage * pageSize,
                )}
                headers={headers}
                isSortable
              >
                {({
                  rows,
                  headers,
                  getTableProps,
                  getHeaderProps,
                  getRowProps,
                }) => (
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
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
                        const patient = searchResults.find(
                          (p) => p.patientID === row.id || p.id === row.id,
                        );
                        const isMerged = patient?.isMerged === true;
                        const mergedIntoLabel =
                          patient?.mergedIntoNationalId ||
                          patient?.mergedIntoPatientId;
                        return (
                          <TableRow key={row.id} {...getRowProps({ row })}>
                            {row.cells.map((cell) => {
                              if (cell.info.header === "actions") {
                                return (
                                  <TableCell key={cell.id}>
                                    <Button
                                      kind="primary"
                                      size="sm"
                                      disabled={
                                        isReadOnly || isSelecting || isMerged
                                      }
                                      onClick={() =>
                                        handleSelectPatient(patient)
                                      }
                                    >
                                      <FormattedMessage
                                        id="label.button.select"
                                        defaultMessage="Select"
                                      />
                                    </Button>
                                  </TableCell>
                                );
                              }
                              if (
                                cell.info.header === "displayName" &&
                                isMerged
                              ) {
                                return (
                                  <TableCell key={cell.id}>
                                    {cell.value}{" "}
                                    <Tag
                                      type="magenta"
                                      size="sm"
                                      title={
                                        mergedIntoLabel
                                          ? intl.formatMessage(
                                              {
                                                id: "patient.search.merged.into",
                                              },
                                              {
                                                identifier: mergedIntoLabel,
                                              },
                                            )
                                          : intl.formatMessage({
                                              id: "patient.search.merged.tag",
                                            })
                                      }
                                    >
                                      <FormattedMessage
                                        id="patient.search.merged.tag"
                                        defaultMessage="Merged"
                                      />
                                    </Tag>
                                  </TableCell>
                                );
                              }
                              return (
                                <TableCell key={cell.id}>
                                  {cell.value}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </DataTable>
              <Pagination
                totalItems={totalItems}
                backwardText={intl.formatMessage({
                  id: "pagination.previous",
                  defaultMessage: "Previous page",
                })}
                forwardText={intl.formatMessage({
                  id: "pagination.next",
                  defaultMessage: "Next page",
                })}
                pageSize={pageSize}
                page={currentPage}
                pageSizes={[25, 50, 100]}
                itemsPerPageText={intl.formatMessage({
                  id: "pagination.itemsPerPage",
                  defaultMessage: "Items per page:",
                })}
                onChange={({ page, pageSize: newPageSize }) => {
                  setCurrentPage(page);
                  setPageSize(newPageSize);
                }}
              />
            </div>
          )}

          {/* No Results */}
          {searchAttempted &&
            searchResults.length === 0 &&
            !isSearching &&
            !errorKey &&
            !selectedPatient && (
              <div className="no-results">
                <p>
                  <FormattedMessage
                    id="patient.search.empty.results"
                    defaultMessage="No matching patients were found."
                  />
                </p>
              </div>
            )}
        </div>
      )}

      {/* New Patient Tab Content */}
      {showNewPatient && (
        <div className="new-patient-content">
          <CreatePatientForm
            showActionsButton={false}
            selectedPatient={newPatientSelection}
            orderFormValues={orderData}
            setOrderFormValues={updateDraft}
            error={() => null}
            setPhoneValidation={updateDraftPhone}
            initialPhoneValidation={draft.phoneValidation}
          />
        </div>
      )}
    </Tile>
  );
};

export default PatientSearchSection;
