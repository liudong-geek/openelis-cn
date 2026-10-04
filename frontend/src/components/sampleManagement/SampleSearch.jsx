import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { Search, Loading, Button } from "@carbon/react";
import { Search as SearchIcon } from "@carbon/icons-react";
import { useIntl } from "react-intl";
import { getFromOpenElisServer } from "../utils/Utils";

/**
 * SampleSearch - Search component for finding sample items by accession number.
 *
 * Features:
 * - Debounced search input (300ms delay)
 * - Loading state while fetching results
 * - Error handling with callback
 * - React Intl for internationalization
 *
 * Props:
 * - onSearchResults: (response, error) => void - callback with search results or error
 * - includeTests: boolean - whether to load ordered tests with sample items
 *
 * Related: Feature 001-sample-management, User Story 1, Task T033
 */
function SampleSearch({
  onSearchResults,
  onSearchStart,
  requestContext,
  refreshVersion = 0,
  includeTests = false,
}) {
  const intl = useIntl();
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef(null);
  const activeRequest = useRef(0);
  const mounted = useRef(true);
  const lastSubmitted = useRef("");
  const lastRefresh = useRef(refreshVersion);

  // Invalidate callbacks before the component leaves the screen.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current += 1;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * Perform the actual search API call.
   */
  const performSearch = useCallback(
    (accessionNumber) => {
      const requestNumber = ++activeRequest.current;
      onSearchStart?.();
      setIsLoading(true);

      const normalizedValue = accessionNumber?.trim() || "";
      lastSubmitted.current = normalizedValue;
      const endpoint = normalizedValue
        ? `/rest/sample-management/search?accessionNumber=${encodeURIComponent(
            normalizedValue,
          )}&includeTests=${includeTests}`
        : `/rest/sample-management/recent?limit=50&includeTests=${includeTests}`;

      getFromOpenElisServer(endpoint, (response) => {
        if (
          !mounted.current ||
          requestNumber !== activeRequest.current ||
          (requestContext && requestContext.current() !== true)
        )
          return;
        setIsLoading(false);

        const responseMatches =
          response &&
          Array.isArray(response.sampleItems) &&
          (normalizedValue
            ? response.accessionNumber === normalizedValue &&
              response.sampleItems.every(
                (item) => item?.sampleAccessionNumber === normalizedValue,
              )
            : response.accessionNumber === "");
        if (responseMatches) {
          // Successful response
          onSearchResults(response, null);
        } else {
          // Error or no data
          onSearchResults(null, {
            message: intl.formatMessage({
              id: "sample.management.search.error.general",
            }),
          });
        }
      });
    },
    [includeTests, onSearchResults, onSearchStart, requestContext, intl],
  );

  useEffect(() => {
    performSearch(lastSubmitted.current);
  }, [performSearch]);

  useEffect(() => {
    if (lastRefresh.current !== refreshVersion) {
      lastRefresh.current = refreshVersion;
      performSearch(lastSubmitted.current);
    }
  }, [refreshVersion, performSearch]);

  /**
   * Handle search input change - no longer auto-triggers search.
   */
  const handleSearchChange = (event) => {
    const newValue = event.target.value;
    setSearchValue(newValue);

    // Clear any pending debounced search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  };

  /**
   * Handle search button click or Enter key press.
   */
  const handleSearchSubmit = () => {
    performSearch(searchValue);
  };

  /**
   * Handle key press - trigger search on Enter.
   */
  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearchSubmit();
    }
  };

  /**
   * Handle search clear (X button clicked).
   */
  const handleClearSearch = () => {
    setSearchValue("");
    setIsLoading(false);

    // Clear any pending debounced search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    performSearch("");
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
      <div style={{ position: "relative", flex: 1 }}>
        <Search
          id="sample-search-input"
          labelText={intl.formatMessage({
            id: "sample.management.search.label",
          })}
          placeholder={intl.formatMessage({
            id: "sample.management.search.placeholder",
          })}
          value={searchValue}
          onChange={handleSearchChange}
          onKeyDown={handleKeyDown}
          onClear={handleClearSearch}
          disabled={isLoading}
          size="lg"
        />
        {isLoading && (
          <div
            style={{
              position: "absolute",
              right: "40px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <Loading
              small
              withOverlay={false}
              description={intl.formatMessage({
                id: "sample.management.search.loading",
              })}
            />
          </div>
        )}
      </div>
      <Button
        kind="primary"
        renderIcon={SearchIcon}
        onClick={handleSearchSubmit}
        disabled={isLoading}
        style={{ minHeight: "48px" }}
      >
        {intl.formatMessage({ id: "label.button.search" })}
      </Button>
    </div>
  );
}

export default SampleSearch;
