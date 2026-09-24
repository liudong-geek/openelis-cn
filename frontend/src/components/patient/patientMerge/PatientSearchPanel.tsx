import React, { useState, useContext, useEffect, useRef } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  Grid,
  Column,
  TextInput,
  Button,
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
  InlineNotification,
  Tag,
  Tile,
} from "@carbon/react";
import { Search } from "@carbon/react/icons";
import { Formik, Field } from "formik";
import CustomDatePicker from "../../common/CustomDatePicker";
import { ConfigurationContext } from "../../layout/Layout";
import {
  searchPatients,
  getPatientMergeDetails,
  getErrorMessage,
} from "./patientMergeService";
import type {
  Nullable,
  PatientMergeApiError,
  PatientRecord,
  PatientSearchCriteria,
  PatientSelectHandler,
} from "../types";

interface PatientSearchPanelProps {
  panelId: string;
  title: React.ReactNode;
  selectedPatient: Nullable<PatientRecord>;
  onPatientSelect: PatientSelectHandler;
  otherSelectedPatient: Nullable<PatientRecord>;
}

interface PatientSearchFormBag {
  resetForm: () => void;
}

function PatientSearchPanel({
  panelId,
  title,
  selectedPatient,
  onPatientSelect,
  otherSelectedPatient,
}: PatientSearchPanelProps) {
  const intl = useIntl();
  const { configurationProperties } = useContext(ConfigurationContext);
  const patientSearchHeaders = [
    {
      key: "lastName",
      header: intl.formatMessage({ id: "patient.last.name" }),
    },
    {
      key: "firstName",
      header: intl.formatMessage({ id: "patient.first.name" }),
    },
    {
      key: "gender",
      header: intl.formatMessage({ id: "patient.gender" }),
    },
    { key: "dob", header: intl.formatMessage({ id: "patient.dob" }) },
    {
      key: "subjectNumber",
      header: intl.formatMessage({ id: "patient.subject.number" }),
    },
    {
      key: "nationalId",
      header: intl.formatMessage({ id: "patient.natioanalid" }),
    },
    {
      key: "dataSourceName",
      header: intl.formatMessage({ id: "patient.dataSourceName" }),
    },
  ];

  const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectingPatientId, setSelectingPatientId] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dob, setDob] = useState("");
  const formikRef = useRef<Nullable<PatientSearchFormBag>>(null);
  const searchGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchGeneration.current += 1;
      selectionGeneration.current += 1;
      searchController.current?.abort();
      searchController.current = null;
    };
  }, []);

  const invalidateSelection = () => {
    selectionGeneration.current += 1;
    setSelectingPatientId("");
  };

  const invalidateSearch = () => {
    searchGeneration.current += 1;
    searchController.current?.abort();
    searchController.current = null;
    invalidateSelection();
    setLoading(false);
    setSearchError("");
    setSearchResults([]);
    setHasSearched(false);
    setPage(1);
  };

  const initialValues = {
    patientId: "",
    firstName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    suppressExternalSearch: true,
  };

  const handleSearch = async (
    values: PatientSearchCriteria,
    suppressExternal = true,
  ) => {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const generation = ++searchGeneration.current;
    invalidateSelection();
    setLoading(true);
    setSearchError("");
    setHasSearched(true);
    setPage(1);
    try {
      const result = await searchPatients(
        {
          ...values,
          dateOfBirth: dob,
          suppressExternalSearch: suppressExternal,
        },
        controller.signal,
      );

      if (!mounted.current || generation !== searchGeneration.current) return;
      setSearchError("");

      if (
        result.patientSearchResults &&
        result.patientSearchResults.length > 0
      ) {
        // Add unique id for DataTable and filter out other selected patient
        const processedResults = result.patientSearchResults
          .map((patient: PatientRecord) => ({
            ...patient,
            id: patient.patientID || patient.patientPK || "",
          }))
          .filter((patient: PatientRecord) => {
            // Filter out the other selected patient to prevent selecting same patient twice
            if (
              otherSelectedPatient &&
              patient.patientID === otherSelectedPatient.patientID
            ) {
              return false;
            }
            // Only show OpenElis patients (not external registry patients)
            return patient.dataSourceName === "OpenElis";
          });

        setSearchResults(processedResults);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      if (!mounted.current || generation !== searchGeneration.current) return;
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      console.error("Search error:", error);
      setSearchResults([]);
      const apiError =
        error && typeof error === "object"
          ? (error as PatientMergeApiError)
          : ({} as PatientMergeApiError);
      setSearchError(getErrorMessage(apiError, intl));
    } finally {
      if (searchController.current === controller) {
        searchController.current = null;
      }
      if (mounted.current && generation === searchGeneration.current) {
        setLoading(false);
      }
    }
  };

  const handlePatientSelect = async (patientId: string) => {
    const patient = searchResults.find((p) => p.patientID === patientId);
    if (patient) {
      const generation = ++selectionGeneration.current;
      setSelectingPatientId(patientId);
      // Transform to match expected format with patientPK
      let selectedPatientData = {
        ...patient,
        patientPK: patient.patientID,
      };

      // Fetch detailed data including clinical summary
      try {
        const details = await getPatientMergeDetails(patientId);
        if (!mounted.current || generation !== selectionGeneration.current) {
          return;
        }
        if (details) {
          // Enrich with dataSummary from merge details API
          selectedPatientData = {
            ...selectedPatientData,
            dataSummary: details.dataSummary,
          };
        }
      } catch (error) {
        if (!mounted.current || generation !== selectionGeneration.current) {
          return;
        }
        console.error("Failed to fetch patient details:", error);
        // Continue with basic data if details fetch fails
      } finally {
        if (mounted.current && generation === selectionGeneration.current) {
          setSelectingPatientId("");
        }
      }

      if (mounted.current && generation === selectionGeneration.current) {
        onPatientSelect(selectedPatientData);
      }
    }
  };

  const handlePageChange = ({
    page,
    pageSize,
  }: {
    page: number;
    pageSize: number;
  }) => {
    setPage(page);
    setPageSize(pageSize);
  };

  // Check if form has any search criteria
  const isFormEmpty = (values: PatientSearchCriteria) => {
    return (
      !values.patientId?.trim() &&
      !values.firstName?.trim() &&
      !values.lastName?.trim() &&
      !values.gender &&
      !dob
    );
  };

  return (
    <div className="patientSelectionSection">
      <h4>{title}</h4>

      {loading && (
        <Loading
          small
          withOverlay={false}
          description={intl.formatMessage({ id: "loading.label" })}
        />
      )}

      <Formik
        innerRef={formikRef}
        initialValues={initialValues}
        onSubmit={(values) => handleSearch(values)}
      >
        {({ values, handleSubmit, setFieldValue }) => (
          <form onSubmit={handleSubmit}>
            <Grid className="searchFormGrid">
              <Column lg={8} md={4} sm={4}>
                <Field name="patientId">
                  {({ field }) => (
                    <TextInput
                      {...field}
                      onChange={(event) => {
                        invalidateSearch();
                        field.onChange(event);
                      }}
                      id={`${panelId}-patientId`}
                      labelText={intl.formatMessage({ id: "patient.id" })}
                      placeholder={intl.formatMessage({
                        id: "input.placeholder.patientId",
                      })}
                    />
                  )}
                </Field>
              </Column>
              <Column lg={8} md={4} sm={4}>
                <Field name="firstName">
                  {({ field }) => (
                    <TextInput
                      {...field}
                      onChange={(event) => {
                        invalidateSearch();
                        field.onChange(event);
                      }}
                      id={`${panelId}-firstName`}
                      labelText={intl.formatMessage({
                        id: "patient.first.name",
                      })}
                      placeholder={intl.formatMessage({
                        id: "input.placeholder.patientFirstName",
                      })}
                    />
                  )}
                </Field>
              </Column>
              <Column lg={8} md={4} sm={4}>
                <Field name="lastName">
                  {({ field }) => (
                    <TextInput
                      {...field}
                      onChange={(event) => {
                        invalidateSearch();
                        field.onChange(event);
                      }}
                      id={`${panelId}-lastName`}
                      labelText={intl.formatMessage({
                        id: "patient.last.name",
                      })}
                      placeholder={intl.formatMessage({
                        id: "input.placeholder.patientLastName",
                      })}
                    />
                  )}
                </Field>
              </Column>
              <Column lg={8} md={4} sm={4}>
                <Field name="gender">
                  {({ field }) => (
                    <RadioButtonGroup
                      legendText={intl.formatMessage({ id: "patient.gender" })}
                      name={`${panelId}-${field.name}`}
                      id={`${panelId}-gender`}
                      onChange={(value) => {
                        invalidateSearch();
                        setFieldValue("gender", value);
                      }}
                      valueSelected={values.gender}
                    >
                      <RadioButton
                        id={`${panelId}-male`}
                        labelText={intl.formatMessage({ id: "patient.male" })}
                        value="M"
                      />
                      <RadioButton
                        id={`${panelId}-female`}
                        labelText={intl.formatMessage({ id: "patient.female" })}
                        value="F"
                      />
                    </RadioButtonGroup>
                  )}
                </Field>
              </Column>
              <Column lg={8} md={4} sm={4}>
                <CustomDatePicker
                  id={`${panelId}-dob`}
                  labelText={intl.formatMessage({ id: "patient.dob" })}
                  value={dob}
                  onChange={(date) => {
                    invalidateSearch();
                    setDob(date);
                    setFieldValue("dateOfBirth", date);
                  }}
                  disallowFutureDate={true}
                />
              </Column>
            </Grid>

            <div className="searchButtons">
              <Button
                kind="primary"
                type="submit"
                disabled={loading || isFormEmpty(values)}
              >
                <FormattedMessage id="label.button.search" />
              </Button>
              <Button
                kind="tertiary"
                type="button"
                onClick={() => handleSearch(values, false)}
                disabled={
                  loading ||
                  isFormEmpty(values) ||
                  configurationProperties?.UseExternalPatientInfo === "false"
                }
              >
                <FormattedMessage id="label.button.externalsearch" />
              </Button>
            </div>
          </form>
        )}
      </Formik>

      {searchError && !selectedPatient && (
        <InlineNotification
          kind="error"
          hideCloseButton
          title={intl.formatMessage({ id: "patient.management.list.error" })}
          subtitle={searchError}
        />
      )}

      {selectingPatientId && (
        <Loading
          small
          withOverlay={false}
          description={intl.formatMessage({ id: "loading.label" })}
        />
      )}

      {/* Search Results Table - hidden when patient is selected */}
      {searchResults.length > 0 && !selectedPatient && (
        <div className="patientSearchResults">
          <DataTable
            rows={searchResults}
            headers={patientSearchHeaders}
            isSortable
          >
            {({ rows, headers, getHeaderProps, getTableProps }) => (
              <TableContainer
                title={intl.formatMessage({
                  id: "patient.merge.patientResults",
                })}
              >
                <Table {...getTableProps()}>
                  <TableHead>
                    <TableRow>
                      <TableHeader />
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
                      .map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <RadioButton
                              name={`${panelId}-patient-select`}
                              id={`${panelId}-select-${row.id}`}
                              labelText=""
                              checked={selectedPatient?.patientID === row.id}
                              disabled={selectingPatientId === row.id}
                              onClick={() =>
                                handlePatientSelect(String(row.id))
                              }
                            />
                          </TableCell>
                          {row.cells.map((cell) => (
                            <TableCell key={cell.id}>
                              {cell.info.header === "dataSourceName" ? (
                                <Tag
                                  type={
                                    cell.value === "OpenElis" ? "red" : "green"
                                  }
                                >
                                  {cell.value === "OpenElis"
                                    ? intl.formatMessage({
                                        id: "patient.dataSource.local",
                                      })
                                    : cell.value}
                                </Tag>
                              ) : (
                                cell.value
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
          <Pagination
            page={page}
            pageSize={pageSize}
            pageSizes={[5, 10, 20, 50]}
            totalItems={searchResults.length}
            onChange={handlePageChange}
            forwardText={intl.formatMessage({ id: "pagination.forward" })}
            backwardText={intl.formatMessage({ id: "pagination.backward" })}
            itemRangeText={(min, max, total) =>
              intl.formatMessage(
                { id: "pagination.item-range" },
                { min, max, total },
              )
            }
            itemsPerPageText={intl.formatMessage({
              id: "pagination.items-per-page",
            })}
            itemText={(min, max) =>
              intl.formatMessage({ id: "pagination.item" }, { min, max })
            }
            pageNumberText={intl.formatMessage({
              id: "pagination.page-number",
            })}
            pageRangeText={(_current, total) =>
              intl.formatMessage({ id: "pagination.page-range" }, { total })
            }
            pageText={(selectedPage, pagesUnknown) =>
              intl.formatMessage(
                { id: "pagination.page" },
                { page: pagesUnknown ? "" : selectedPage },
              )
            }
          />
        </div>
      )}

      {/* Show "Search for different patient" when patient is selected */}
      {selectedPatient && (
        <div className="changeSelectionButton">
          <Button
            kind="ghost"
            size="sm"
            onClick={() => {
              onPatientSelect(null);
              setSearchResults([]);
              setSearchError("");
              invalidateSelection();
              setHasSearched(false);
              setDob("");
              if (formikRef.current) {
                formikRef.current.resetForm();
              }
            }}
          >
            <FormattedMessage id="patient.merge.searchDifferent" />
          </Button>
        </div>
      )}

      {/* Empty State - shown when search was performed but no results */}
      {hasSearched &&
        searchResults.length === 0 &&
        !loading &&
        !searchError &&
        !selectedPatient && (
          <Tile className="emptySearchResults">
            <div className="emptyStateContent">
              <Search size={48} />
              <p className="emptyStateTitle">
                <FormattedMessage id="patient.search.nopatient" />
              </p>
              <p className="emptyStateDescription">
                <FormattedMessage id="patient.merge.tryDifferentSearch" />
              </p>
            </div>
          </Tile>
        )}
    </div>
  );
}

export default PatientSearchPanel;
