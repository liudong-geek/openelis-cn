import React, { useEffect, useRef, useState } from "react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import { useHistory, useLocation, useParams } from "react-router-dom";
import "../Style.css";
import {
  Grid,
  Column,
  Button,
  Loading,
  InlineNotification,
} from "@carbon/react";
import { Add, ArrowLeft } from "@carbon/react/icons";
import CreatePatientForm from "./CreatePatientForm";
import PatientMasterList from "./PatientMasterList";
import type { PatientListViewState } from "./PatientMasterList";
import SearchPatientForm from "./SearchPatientForm";
import type { PatientSearchFormState } from "./SearchPatientForm";
import PageBreadCrumb from "../common/PageBreadCrumb";
import usePatientDetails from "./usePatientDetails";
import type { PatientRecord } from "./types";
import ProductPageHeader from "../common/ProductPageHeader";
import { fromList, listReturnLocation } from "../common/listWorkspace";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "patient.label.modify", link: "/PatientManagement" },
];

interface PatientManagementViewState extends PatientListViewState {
  managementMode?: "list" | "advanced";
  advanced?: PatientSearchFormState;
}

function PatientManagement() {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation<{
    listState?: PatientManagementViewState;
    listOrigin?: {
      pathname: string;
      state?: { listState?: PatientManagementViewState };
    };
  }>();
  const hasSearchDeepLink = [
    "patientId",
    "labNumber",
    "quickQuery",
    "lastName",
    "firstName",
    "STNumber",
    "subjectNumber",
    "nationalID",
    "guid",
    "dateOfBirth",
    "gender",
  ].some((key) => new URLSearchParams(location.search).has(key));
  const listState = useRef<PatientManagementViewState>({
    ...location.state?.listState,
    managementMode: hasSearchDeepLink
      ? "advanced"
      : (location.state?.listState?.managementMode ?? "list"),
  });
  const [managementMode, setManagementMode] = useState<"list" | "advanced">(
    listState.current.managementMode || "list",
  );
  const { patientId } = useParams<{ patientId?: string }>();

  const isNewMode = patientId === "new";
  const isEditMode = !!patientId && !isNewMode;
  const isSearchMode = !patientId;

  useEffect(() => {
    if (isSearchMode && hasSearchDeepLink) {
      listState.current = {
        ...listState.current,
        managementMode: "advanced",
      };
      setManagementMode("advanced");
    }
  }, [hasSearchDeepLink, isSearchMode, location.search]);

  // Only fetch when an actual id is in the URL. New-mode and search-mode
  // render without a fetch.
  const { patient, loading, error } = usePatientDetails(
    isEditMode ? patientId : null,
  );

  const goToSearch = () =>
    history.push(listReturnLocation(location.state, "/PatientManagement"));
  const openFromList = (pathname: string) => {
    history.replace({
      ...location,
      state: { ...location.state, listState: listState.current },
    });
    history.push({
      pathname,
      state: fromList("/PatientManagement", listState.current),
    });
  };
  const goToNewPatient = () => openFromList("/PatientManagement/new");
  const goToPatientMerge = () => openFromList("/PatientMerge");
  const goToEditPatient = (selected: PatientRecord) =>
    openFromList(`/PatientManagement/${selected.patientPK}`);
  const goToPatientResults = (selected: PatientRecord) =>
    openFromList(`/PatientResults/${selected.patientPK}`);
  const changeManagementMode = (mode: "list" | "advanced") => {
    listState.current = { ...listState.current, managementMode: mode };
    setManagementMode(mode);
    if (mode === "list" && location.search) {
      history.replace({
        pathname: location.pathname,
        state: { ...location.state, listState: listState.current },
      });
    }
  };

  const titleId = isSearchMode
    ? "patient.management.title"
    : isNewMode
      ? "patient.management.new.title"
      : "patient.management.edit.title";

  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="patient-management-title"
        title={<FormattedMessage id={titleId} />}
        subtitle={
          <FormattedMessage
            id={
              isSearchMode
                ? "patient.management.search.subtitle"
                : isNewMode
                  ? "patient.management.new.subtitle"
                  : "patient.management.edit.subtitle"
            }
          />
        }
        actions={
          isSearchMode ? (
            <>
              <Button kind="tertiary" onClick={goToPatientMerge}>
                <FormattedMessage id="banner.menu.patient.merge" />
              </Button>
              <Button renderIcon={Add} onClick={goToNewPatient}>
                <FormattedMessage id="new.patient.label" />
              </Button>
            </>
          ) : (
            <Button kind="tertiary" renderIcon={ArrowLeft} onClick={goToSearch}>
              <FormattedMessage id="patient.management.backToList" />
            </Button>
          )
        }
      />
      <div className="orderLegendBody patient-management-surface">
        <Grid>
          {isSearchMode && (
            <Column lg={16} md={8} sm={4}>
              <div
                className="patient-management-mode-switcher"
                role="group"
                aria-label={intl.formatMessage({
                  id: "patient.management.mode.label",
                })}
              >
                <Button
                  type="button"
                  kind={managementMode === "list" ? "primary" : "ghost"}
                  onClick={() => changeManagementMode("list")}
                >
                  <FormattedMessage id="patient.management.list.title" />
                </Button>
                <Button
                  type="button"
                  kind={managementMode === "advanced" ? "primary" : "ghost"}
                  onClick={() => changeManagementMode("advanced")}
                >
                  <FormattedMessage id="advanced.search" />
                </Button>
              </div>

              {managementMode === "list" ? (
                <PatientMasterList
                  initialState={listState.current}
                  onStateChange={(state) => {
                    listState.current = {
                      ...listState.current,
                      ...state,
                      managementMode: "list",
                    };
                  }}
                  onOpenPatient={goToEditPatient}
                  onOpenResults={goToPatientResults}
                  onNewPatient={goToNewPatient}
                />
              ) : (
                <SearchPatientForm
                  key={location.search || "advanced-search"}
                  initialSearch={location.search}
                  initialState={listState.current.advanced}
                  onStateChange={(advanced) => {
                    listState.current = {
                      ...listState.current,
                      managementMode: "advanced",
                      advanced,
                    };
                  }}
                  getSelectedPatient={goToEditPatient}
                  selectionMode="button"
                  selectionButtonMessageId="patient.management.open"
                  allowExternalSearch={false}
                  allowExternalImport={false}
                  disableMergedSelection
                />
              )}
            </Column>
          )}

          {isNewMode && (
            <Column lg={16} md={8} sm={4}>
              <CreatePatientForm
                key="new"
                showActionsButton={true}
                selectedPatient={{}}
              />
            </Column>
          )}

          {isEditMode && loading && (
            <Column lg={16} md={8} sm={4}>
              <Loading
                description={<FormattedMessage id="loading.label" />}
                withOverlay={false}
              />
            </Column>
          )}

          {isEditMode && !loading && error && (
            <Column lg={16} md={8} sm={4}>
              <InlineNotification
                kind="error"
                title={<FormattedMessage id="notification.title" />}
                subtitle={
                  <FormattedMessage
                    id="patient.fetch.error"
                    defaultMessage="Could not load patient. The id may be invalid or the server is unreachable."
                  />
                }
                hideCloseButton
              />
              <br />
              <Button kind="tertiary" onClick={goToSearch}>
                <FormattedMessage
                  id="search.patient.label"
                  defaultMessage="Search for Patient"
                />
              </Button>
            </Column>
          )}

          {isEditMode && !loading && !error && patient && (
            <Column lg={16} md={8} sm={4}>
              <CreatePatientForm
                key={patient.patientPK}
                showActionsButton={true}
                selectedPatient={patient}
              />
            </Column>
          )}
        </Grid>
      </div>
    </>
  );
}

export default injectIntl(PatientManagement);
