import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Search, Grid, Column, Loading, Theme } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import SearchOutput from "./searchOutput";
import {
  fetchPatientData,
  getPatientManagementSearchRoute,
  useAutocomplete,
  type PatientSearchError,
  type PatientSearchResult,
} from "./searchService";
import { navigateToInternalPath } from "../../utils/NavigationUtils";
import "./searchBar.css";

const SEARCH_DEBOUNCE_MS = 250;

const filterPatientResults = (results: PatientSearchResult[]) => {
  const seenPatientIds = new Set<string>();

  return results.filter((result) => {
    const patientId = String(result.patientID ?? "").trim();
    if (!patientId || seenPatientIds.has(patientId)) return false;
    seenPatientIds.add(patientId);
    return true;
  });
};

const SearchBar: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [patientData, setPatientData] = useState<PatientSearchResult[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchError, setSearchError] = useState<PatientSearchError | null>(
    null,
  );
  const [resultQuery, setResultQuery] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const intl = useIntl();
  const {
    textValue,
    onChange: handleAutocompleteChange,
    onKeyDown: handleAutocompleteKeyDown,
    setTextValue,
  } = useAutocomplete({
    value: searchInput,
    suggestions: [],
    allowFreeText: true,
    onDelete: (id) => {
      setPatientData((prevData) =>
        prevData.filter((patient) => patient.patientID !== id),
      );
    },
  });

  const cancelPendingSearch = useCallback(() => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    activeRequest.current?.abort();
    activeRequest.current = null;
    requestVersion.current += 1;
  }, []);

  useEffect(() => () => cancelPendingSearch(), [cancelPendingSearch]);

  const runSearch = useCallback((query: string) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    activeRequest.current = controller;
    setLoading(true);
    setSearchError(null);

    fetchPatientData(
      query,
      (data) => {
        if (controller.signal.aborted || requestVersion.current !== version) {
          return;
        }
        setPatientData(filterPatientResults(data.results));
        setTotalItems(data.totalItems);
        setSearchError(data.error);
        setResultQuery(query);
        setLoading(false);
        if (activeRequest.current === controller) {
          activeRequest.current = null;
        }
      },
      controller.signal,
    );
  }, []);

  const handleClearSearch = () => {
    cancelPendingSearch();
    setSearchInput("");
    setTextValue("");
    setPatientData([]);
    setTotalItems(0);
    setSearchError(null);
    setResultQuery("");
    setLoading(false);
  };

  const handleSearch = () => {
    const query = searchInput.trim();
    cancelPendingSearch();
    if (query) {
      runSearch(query);
    } else {
      setPatientData([]);
      setTotalItems(0);
      setSearchError(null);
      setResultQuery("");
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const userInput = e?.target?.value || "";
    setSearchInput(userInput);
    handleAutocompleteChange(e);
    cancelPendingSearch();
    setSearchError(null);

    const query = userInput.trim();
    if (query) {
      setLoading(true);
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        runSearch(query);
      }, SEARCH_DEBOUNCE_MS);
    } else {
      setPatientData([]);
      setTotalItems(0);
      setResultQuery("");
      setLoading(false);
    }
  };

  const viewAllRoute = getPatientManagementSearchRoute(resultQuery);

  return (
    <Grid className="main">
      <Column sm={4} md={8} lg={16}>
        <div className="search-bar-container">
          {/* Theme wrapper ONLY around Search input to make it light */}
          <Theme theme="white">
            <Search
              size="sm"
              placeholder={intl.formatMessage({ id: "label.button.search" })}
              labelText={intl.formatMessage({ id: "label.button.search" })}
              closeButtonLabelText={intl.formatMessage({
                id: "label.button.clear",
              })}
              id="searchItem"
              value={textValue}
              onChange={handleChange}
              onKeyDown={handleAutocompleteKeyDown}
              onClear={handleClearSearch}
              className="search-input"
              autoComplete="on"
            />
          </Theme>
          <Button
            id="patientSearch"
            size="sm"
            style={{ width: 50 }}
            onClick={handleSearch}
            aria-label={intl.formatMessage({ id: "label.button.search" })}
          >
            <FormattedMessage id="label.button.search" />
          </Button>
        </div>
      </Column>

      <Column sm={4} md={8} lg={16}>
        {(loading ||
          patientData.length > 0 ||
          totalItems > 0 ||
          searchError) && (
          <div className="patients">
            {loading ? (
              <Loading
                description={intl.formatMessage({ id: "label.loading" })}
                withOverlay={false}
              />
            ) : searchError ? (
              <div className="patient-search-error" role="alert">
                <FormattedMessage
                  id={
                    searchError === "too-many"
                      ? "patient.globalSearch.tooMany"
                      : "patient.management.list.error"
                  }
                />
              </div>
            ) : (
              <>
                <div className="patient-search-summary">
                  <FormattedMessage
                    id="patient.management.list.searchCount"
                    values={{ count: totalItems }}
                  />
                  {viewAllRoute && totalItems > 0 && (
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() => navigateToInternalPath(viewAllRoute)}
                    >
                      <FormattedMessage id="patient.globalSearch.viewAll" />
                    </Button>
                  )}
                </div>
                <SearchOutput loading={loading} patientData={patientData} />
              </>
            )}
          </div>
        )}
      </Column>
    </Grid>
  );
};

export default SearchBar;
