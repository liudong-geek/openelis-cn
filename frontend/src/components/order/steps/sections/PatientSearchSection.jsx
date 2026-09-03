import React, { useState, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
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
  Link,
} from "@carbon/react";
import { getFromOpenElisServer } from "../../../utils/Utils";
import CreatePatientForm from "../../../patient/CreatePatientForm";

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
  const componentMounted = useRef(true);

  // Tab state
  const [activeTab, setActiveTab] = useState("search"); // "search" | "new"

  // Order entry uses one compact selector. The complete multi-field search and
  // all CRUD operations remain in Patient Management.
  const [quickQuery, setQuickQuery] = useState("");
  const [searchAttempted, setSearchAttempted] = useState(false);

  // Results state
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Selected patient
  const [selectedPatient, setSelectedPatient] = useState(null);

  useEffect(() => {
    componentMounted.current = true;
    return () => {
      componentMounted.current = false;
    };
  }, []);

  // Update selectedPatient when orderData.patientProperties changes (e.g., from barcode scan)
  useEffect(() => {
    if (orderData?.patientProperties?.patientPK) {
      setSelectedPatient(orderData.patientProperties);
      setActiveTab("search"); // Stay on search but show selected
    }
  }, [orderData?.patientProperties?.patientPK]);

  // Execute search
  const handleSearch = () => {
    const query = quickQuery.trim();
    if (!query || isReadOnly) return;

    setIsSearching(true);
    setSearchResults([]);
    setSearchAttempted(true);

    const params = new URLSearchParams({
      quickQuery: query,
      suppressExternalSearch: "true",
    });
    const searchEndpoint = `/rest/patient-search-results?${params.toString()}`;

    getFromOpenElisServer(searchEndpoint, (response) => {
      if (componentMounted.current) {
        setIsSearching(false);
        if (response?.patientSearchResults) {
          // Map results to ensure each has an 'id' field for DataTable
          const mappedResults = response.patientSearchResults.map((p) => ({
            ...p,
            id: p.patientID || p.id,
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
    });
  };

  // Clear search
  const handleClear = () => {
    setQuickQuery("");
    setSearchResults([]);
    setTotalItems(0);
    setSearchAttempted(false);
  };

  // Select patient
  const handleSelectPatient = (patient) => {
    // Get patientID from either field
    const patientId = patient.patientID || patient.id;
    if (!patientId) {
      console.error("No patient ID found");
      return;
    }

    // Fetch full patient details
    getFromOpenElisServer(
      `/rest/patient-details?patientID=${patientId}`,
      (response) => {
        if (componentMounted.current && response) {
          setSelectedPatient(response);
          // IMPORTANT: patientUpdateStatus must be INSIDE patientProperties for backend to recognize it
          setOrderData((prev) => ({
            ...prev,
            patientUpdateStatus: "UPDATE",
            patientProperties: {
              ...response,
              patientUpdateStatus: "UPDATE", // Backend reads this from patientProperties
            },
          }));
        }
      },
    );
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedPatient(null);
    setOrderData((prev) => ({
      ...prev,
      patientUpdateStatus: "",
      patientProperties: {
        patientPK: "",
        guid: "",
        firstName: "",
        lastName: "",
        birthDateForDisplay: "",
        gender: "",
        nationalId: "",
      },
    }));
  };

  // Handle new patient tab
  const handleNewPatient = () => {
    setActiveTab("new");
    // Clear any existing selection for new patient entry
  };

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
          {activeTab === "new" && (
            <Button
              kind="ghost"
              size="sm"
              onClick={() => setActiveTab("search")}
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
          {activeTab !== "new" && (
            <Button
              kind="tertiary"
              size="sm"
              onClick={handleNewPatient}
              disabled={isReadOnly}
            >
              <FormattedMessage
                id="new.patient.label"
                defaultMessage="New Patient"
              />
            </Button>
          )}
        </div>
      </div>

      {/* Search Tab Content */}
      {activeTab === "search" && (
        <div className="search-content">
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
                onChange={(event) => setQuickQuery(event.target.value)}
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
                  <Button kind="ghost" size="md" onClick={handleClear}>
                    <FormattedMessage id="label.button.clear" />
                  </Button>
                )}
              </div>
              <p className="helper-text patient-quick-search__helper">
                <FormattedMessage id="patient.quickSearch.helper" />
              </p>
            </div>
          )}

          {/* Selected Patient Card */}
          {selectedPatient && (
            <div className="selected-entity-card">
              <div className="selected-card-header">
                <Tag type="green" size="sm">
                  <FormattedMessage id="selected" defaultMessage="Selected" />
                </Tag>
                <Link onClick={handleClearSelection}>
                  <FormattedMessage
                    id="label.button.clear"
                    defaultMessage="Clear"
                  />
                </Link>
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
      {activeTab === "new" && (
        <div className="new-patient-content">
          <CreatePatientForm
            key={(selectedPatient && selectedPatient.patientPK) || "new"}
            showActionsButton={false}
            selectedPatient={
              selectedPatient || {
                id: "",
                healthRegion: [],
                nationalId: "",
                subjectNumber: "",
              }
            }
            orderFormValues={orderData}
            setOrderFormValues={setOrderData}
            error={() => null}
            setPhoneValidation={setPhoneValidation}
          />
        </div>
      )}
    </Tile>
  );
};

export default PatientSearchSection;
