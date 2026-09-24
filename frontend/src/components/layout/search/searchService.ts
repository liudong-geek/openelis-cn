import {
  useState,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { readOpenElisResponse } from "../../utils/readOpenElisResponse";

export interface PatientSearchResult {
  id?: string | number;
  patientID?: string | number;
  firstName?: string;
  lastName?: string;
  gender?: string;
  age?: string | number;
  dob?: string;
  nationalId?: string;
  referringFacility?: string;
  subjectNumber?: string;
}

interface PatientSearchResponse {
  patientSearchResults?: PatientSearchResult[];
  totalItems?: number;
  paging?: {
    currentPage?: string | number;
  };
}

export type PatientSearchError = "too-many" | "request";

export interface PatientSearchData {
  results: PatientSearchResult[];
  totalItems: number;
  error: PatientSearchError | null;
}

export interface AutocompleteSuggestion {
  id: string | number;
  value: string;
}

interface AutocompleteProps {
  value?: string;
  suggestions?: AutocompleteSuggestion[];
  allowFreeText?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onDelete?: (id: string | number) => void;
  onSelect?: (id: string | number) => void;
}

export const fetchPatientData = (
  query: string,
  callback: (data: PatientSearchData) => void,
  signal: AbortSignal | null = null,
): void => {
  const queryParams = new URLSearchParams({
    quickQuery: query,
    suppressExternalSearch: "true",
  });
  const requestSignal = signal ?? new AbortController().signal;

  readOpenElisResponse(
    `/rest/patient-search-results?${queryParams.toString()}`,
    requestSignal,
  )
    .then(async (response) => {
      if (requestSignal.aborted) return;
      if (!response.ok) {
        callback({
          results: [],
          totalItems: 0,
          error: response.status === 400 ? "too-many" : "request",
        });
        return;
      }

      let body: PatientSearchResponse;
      try {
        body = (await response.json()) as PatientSearchResponse;
      } catch {
        callback({ results: [], totalItems: 0, error: "request" });
        return;
      }
      if (requestSignal.aborted) return;

      const results = body.patientSearchResults;
      const totalItems = Number(body.totalItems);
      const currentPage = Number(body.paging?.currentPage);
      if (
        !Array.isArray(results) ||
        !Number.isInteger(totalItems) ||
        totalItems < results.length ||
        !Number.isInteger(currentPage) ||
        currentPage !== 1
      ) {
        callback({ results: [], totalItems: 0, error: "request" });
        return;
      }

      callback({ results, totalItems, error: null });
    })
    .catch((error: unknown) => {
      if (requestSignal.aborted) return;
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      callback({ results: [], totalItems: 0, error: "request" });
    });
};

export const getPatientManagementSearchRoute = (query: string) => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return null;
  return `/PatientManagement?${new URLSearchParams({
    quickQuery: normalizedQuery,
  }).toString()}`;
};

export const getPatientDisplayName = (
  patient: PatientSearchResult,
  fallback: string,
) =>
  [patient.lastName, patient.firstName]
    .map((namePart) => String(namePart ?? "").trim())
    .filter(Boolean)
    .join(" ") || fallback;

export const getPatientResultsRoute = (patientId?: string | number) =>
  patientId === undefined || patientId === null || patientId === ""
    ? null
    : `/PatientResults/${encodeURIComponent(String(patientId))}`;

type UserInput = string | AutocompleteSuggestion | undefined;

export const useAutocomplete = (props: AutocompleteProps) => {
  const allowFreeText = props.allowFreeText;

  const [textValue, setTextValue] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [filteredSuggestions, setFilteredSuggestions] = useState<
    AutocompleteSuggestion[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [userInput, setUserInput] = useState<UserInput>("");
  const [invalid, setInvalid] = useState(false);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (props.value && !initialised) {
      if (props.suggestions) {
        const filteredSuggestion = props.suggestions.filter(
          (suggestion) => suggestion.id === props.value,
        );
        if (filteredSuggestion[0]) {
          setTextValue(filteredSuggestion[0].value);
        } else {
          setTextValue(props.value);
        }
      }
    }
  }, [props, initialised]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { suggestions } = props;
    const userInput = e?.currentTarget?.value || "";
    setTextValue(userInput);

    if (suggestions) {
      const filteredSuggestions = suggestions.filter(
        (suggestion) =>
          suggestion.value.toLowerCase().indexOf(userInput.toLowerCase()) > -1,
      );

      setActiveSuggestion(0);
      setFilteredSuggestions(filteredSuggestions);
      setUserInput(userInput);
      setShowSuggestions(true);
      setInitialised(true);

      if (filteredSuggestions.length === 0 && !allowFreeText) {
        setInvalid(true);
      }
      if (typeof props.onChange === "function") {
        props.onChange(e);
      }
    }
  };

  const onClick = (
    e: MouseEvent<HTMLElement>,
    id: string | number,
    suggestion: AutocompleteSuggestion,
  ) => {
    const { onSelect } = props;
    setTextValue(suggestion.value);
    setActiveSuggestion(0);
    setFilteredSuggestions([]);
    setUserInput(e.currentTarget.innerText);
    setShowSuggestions(false);
    setInvalid(false);

    if (typeof onSelect === "function") {
      onSelect(id);
    }
  };

  const onDelete = (id: string | number) => {
    const updatedSuggestions = filteredSuggestions.filter(
      (suggestion) => suggestion.id !== id,
    );
    setFilteredSuggestions(updatedSuggestions);

    if (props.onDelete) {
      props.onDelete(id);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.keyCode === 13) {
      setActiveSuggestion(0);
      setUserInput(filteredSuggestions[activeSuggestion]);
      setShowSuggestions(false);
    } else if (e.keyCode === 38) {
      if (activeSuggestion === 0) {
        return;
      }
      setActiveSuggestion(activeSuggestion - 1);
    } else if (e.keyCode === 40) {
      if (activeSuggestion - 1 === filteredSuggestions.length) {
        return;
      }
      setActiveSuggestion(activeSuggestion + 1);
    }
  };

  return {
    textValue,
    setTextValue,
    activeSuggestion,
    filteredSuggestions,
    showSuggestions,
    userInput,
    invalid,
    onChange,
    onClick,
    onKeyDown,
    onDelete,
  };
};
