import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import { useHistory, useLocation, useParams } from "react-router-dom";
import "../Style.css";
import "./PatientManagement.scss";
import {
  Grid,
  Column,
  Button,
  Loading,
  InlineNotification,
  OverflowMenu,
  OverflowMenuItem,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Modal,
} from "@carbon/react";
import { Add, ArrowLeft } from "@carbon/react/icons";
import CreatePatientForm, {
  type PatientMaintenanceFormState,
} from "./CreatePatientForm";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { formatPatientMaintenanceName } from "./patientMaintenanceContract";
import "../admin/AdminModal.css";
import PatientMasterList from "./PatientMasterList";
import type { PatientListViewState } from "./PatientMasterList";
import SearchPatientForm from "./SearchPatientForm";
import type { PatientSearchFormState } from "./SearchPatientForm";
import PageBreadCrumb from "../common/PageBreadCrumb";
import usePatientDetails from "./usePatientDetails";
import type { PatientRecord } from "./types";
import ProductPageHeader from "../common/ProductPageHeader";
import { fromList } from "../common/listWorkspace";
import { getFromOpenElisServer } from "../utils/Utils";

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
    ...(location.state?.listState ||
      location.state?.listOrigin?.state?.listState),
    managementMode: hasSearchDeepLink
      ? "advanced"
      : location.state?.listState?.managementMode ||
        location.state?.listOrigin?.state?.listState?.managementMode ||
        "list",
  });
  const [managementMode, setManagementMode] = useState<"list" | "advanced">(
    listState.current.managementMode || "list",
  );
  const [patientListVersion, setPatientListVersion] = useState(0);
  const { patientId } = useParams<{ patientId?: string }>();
  const [modal, setModal] = useState<null | {
    patientId?: string;
    sequence: number;
  }>(null);
  const modalSequence = useRef(0);
  const modalState = useRef<PatientMaintenanceFormState>({
    dirty: false,
    busy: false,
    unknown: false,
  });
  const [discardOpen, setDiscardOpen] = useState(false);
  const discardLauncher = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (discardOpen) return;
    const launcher = discardLauncher.current;
    discardLauncher.current = null;
    if (modal && launcher?.isConnected) launcher.focus();
  }, [discardOpen, modal]);
  const [loadVersion, setLoadVersion] = useState(0);
  const [actionsContainer, setActionsContainer] =
    useState<HTMLDivElement | null>(null);
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const maintenanceActorKey = String(
    userSessionDetails?.userId ||
      userSessionDetails?.loginName ||
      userSessionDetails?.userName ||
      "",
  );
  const maintenanceSessionKey = JSON.stringify({
    authenticated: userSessionDetails?.authenticated,
    csrf: userSessionDetails?.csrf,
  });
  const actor = JSON.stringify({
    authenticated: userSessionDetails?.authenticated,
    id:
      userSessionDetails?.userId ||
      userSessionDetails?.loginName ||
      userSessionDetails?.userName ||
      "",
    roles: [...(userSessionDetails?.roles || [])].sort(),
  });
  const previousActor = useRef(actor);
  const [capabilities, setCapabilities] = useState<{ canCreate: boolean }>({
    canCreate: false,
  });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setCapabilities({ canCreate: false });
    getFromOpenElisServer<{ canCreate?: boolean }>(
      "/rest/patient-maintenance-capabilities",
      (response) => {
        if (active)
          setCapabilities({ canCreate: response?.canCreate === true });
      },
      controller.signal,
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [actor]);
  const onFormStateChange = useCallback(
    (state: PatientMaintenanceFormState) => {
      modalState.current = state;
    },
    [],
  );
  const openPatientModal = (id?: string) => {
    if (modalState.current.busy) return;
    modalState.current = { dirty: false, busy: false, unknown: false };
    setDiscardOpen(false);
    setModal({ patientId: id, sequence: ++modalSequence.current });
  };
  useEffect(() => {
    if (patientId)
      openPatientModal(patientId === "new" ? undefined : patientId);
  }, [patientId]);
  useEffect(() => {
    if (previousActor.current === actor) return;
    previousActor.current = actor;
    modalSequence.current++;
    setModal(null);
    setDiscardOpen(false);
    modalState.current = { dirty: false, busy: false, unknown: false };
  }, [actor]);
  useEffect(() => {
    if (hasSearchDeepLink) {
      listState.current = { ...listState.current, managementMode: "advanced" };
      setManagementMode("advanced");
    }
  }, [hasSearchDeepLink, location.search]);
  const { patient, loading, error } = usePatientDetails(
    modal?.patientId,
    loadVersion,
  );
  const closeModal = () => {
    modalSequence.current++;
    setModal(null);
    setDiscardOpen(false);
    modalState.current = { dirty: false, busy: false, unknown: false };
    if (patientId)
      history.replace({
        pathname: "/PatientManagement",
        state: { listState: listState.current },
      });
  };
  const requestClose = (event?: { key?: string }) => {
    if (event?.key === "Escape") {
      const activeModals = document.querySelectorAll(".cds--modal.is-visible");
      const topModal = activeModals[activeModals.length - 1];
      if (topModal && !topModal.classList.contains("patient-create-modal"))
        return false;
    }
    if (modalState.current.busy) return false;
    if (modalState.current.dirty || modalState.current.unknown) {
      if (!discardOpen)
        discardLauncher.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      setDiscardOpen(true);
      return false;
    }
    closeModal();
    return false;
  };
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
  const goToNewPatient = () => {
    if (capabilities.canCreate) openPatientModal();
  };
  const goToPatientMerge = () => openFromList("/PatientMerge");
  const goToEditPatient = (selected: PatientRecord) => {
    if (selected.patientPK) openPatientModal(String(selected.patientPK));
  };
  const goToPatientResults = (selected: PatientRecord) =>
    openFromList(
      `/PatientResults/${encodeURIComponent(String(selected.patientPK))}`,
    );
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

  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="patient-management-title"
        title={<FormattedMessage id="patient.management.title" />}
        subtitle={<FormattedMessage id="patient.management.search.subtitle" />}
        actions={
          <>
            <OverflowMenu
              flipped
              iconDescription={intl.formatMessage({
                id: "patient.management.moreActions",
              })}
              menuOptionsClass="patient-management-actions__options"
            >
              <OverflowMenuItem
                onClick={goToPatientMerge}
                itemText={
                  <span className="patient-management-actions__item">
                    <strong>
                      <FormattedMessage id="banner.menu.patient.merge" />
                    </strong>
                    <span>
                      <FormattedMessage id="patient.management.merge.helper" />
                    </span>
                  </span>
                }
              />
            </OverflowMenu>
            <Button
              size="md"
              renderIcon={Add}
              disabled={!capabilities.canCreate}
              onClick={goToNewPatient}
            >
              <FormattedMessage id="new.patient.label" />
            </Button>
          </>
        }
      />
      <div className="orderLegendBody patient-management-surface patient-management-list-surface">
        <Grid>
          {
            <Column lg={16} md={8} sm={4}>
              {managementMode === "advanced" && (
                <div className="patient-management-advanced-heading">
                  <h2>
                    <FormattedMessage id="advanced.search" />
                  </h2>
                  <Button
                    type="button"
                    size="md"
                    kind="ghost"
                    renderIcon={ArrowLeft}
                    onClick={() => changeManagementMode("list")}
                  >
                    <FormattedMessage id="patient.management.backToList" />
                  </Button>
                </div>
              )}

              {managementMode === "list" ? (
                <PatientMasterList
                  key={patientListVersion}
                  onOpenAdvancedSearch={() => changeManagementMode("advanced")}
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
                  key={`${location.search || "advanced-search"}-${patientListVersion}`}
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
          }
        </Grid>
      </div>
      {modal && (
        <ComposedModal
          open
          onClose={requestClose}
          size="lg"
          selectorPrimaryFocus=".cds--modal-close"
          selectorsFloatingMenus={[".patient-maintenance-confirm"]}
          preventCloseOnClickOutside
          className="oe-admin-modal oe-admin-modal--large patient-create-modal"
          aria-label={intl.formatMessage({
            id: modal.patientId
              ? "patient.maintenance.view.title"
              : "patient.management.new.title",
          })}
        >
          <ModalHeader
            title={intl.formatMessage({
              id: modal.patientId
                ? "patient.maintenance.view.title"
                : "patient.management.new.title",
            })}
            label={
              patient
                ? `${formatPatientMaintenanceName(patient)} · ${patient.nationalId || patient.subjectNumber || patient.patientPK}`
                : intl.formatMessage({
                    id: modal.patientId
                      ? "patient.management.edit.subtitle"
                      : "patient.management.new.subtitle",
                  })
            }
            iconDescription={intl.formatMessage({ id: "label.button.close" })}
            closeModal={requestClose}
          />
          <ModalBody className="patient-create-modal__body">
            {modal.patientId && loading && (
              <Loading
                description={intl.formatMessage({ id: "loading.label" })}
                withOverlay={false}
              />
            )}
            {modal.patientId && !loading && error && (
              <>
                <InlineNotification
                  kind="error"
                  title={intl.formatMessage({ id: "notification.title" })}
                  subtitle={intl.formatMessage({ id: "patient.fetch.error" })}
                  hideCloseButton
                />
                <Button
                  type="button"
                  kind="tertiary"
                  onClick={() => setLoadVersion((value) => value + 1)}
                >
                  <FormattedMessage id="patient.maintenance.reload" />
                </Button>
              </>
            )}
            {!modal.patientId && !capabilities.canCreate && (
              <InlineNotification
                kind="warning"
                hideCloseButton
                title={intl.formatMessage({ id: "notification.title" })}
                subtitle={intl.formatMessage({
                  id: "patient.maintenance.permissionDenied",
                })}
              />
            )}
            {((!modal.patientId && capabilities.canCreate) ||
              (!loading && !error && patient)) && (
              <CreatePatientForm
                key={`${modal.sequence}-${patient?.patientPK || "new"}`}
                showActionsButton
                selectedPatient={patient || {}}
                maintenanceMode={!!modal.patientId}
                maintenanceActorKey={maintenanceActorKey}
                maintenanceSessionKey={maintenanceSessionKey}
                actionsContainer={actionsContainer}
                onFormStateChange={onFormStateChange}
                onCancel={requestClose}
                onSaveSuccess={() => {
                  if (modal.sequence !== modalSequence.current) return;
                  closeModal();
                  setPatientListVersion((current) => current + 1);
                }}
              />
            )}
          </ModalBody>
          {modal.patientId && (
            <ModalFooter>
              <div
                ref={setActionsContainer}
                className="patient-maintenance-footer"
              />
            </ModalFooter>
          )}
        </ComposedModal>
      )}
      {discardOpen && (
        <Modal
          open
          size="sm"
          className="oe-admin-modal patient-maintenance-confirm"
          selectorPrimaryFocus=".cds--btn--secondary"
          preventCloseOnClickOutside
          modalHeading={intl.formatMessage({
            id: "patient.maintenance.discard.title",
          })}
          closeButtonLabel={intl.formatMessage({ id: "label.button.close" })}
          primaryButtonText={intl.formatMessage({
            id: "patient.maintenance.discard.confirm",
          })}
          secondaryButtonText={intl.formatMessage({
            id: "patient.maintenance.discard.keep",
          })}
          onRequestSubmit={closeModal}
          onRequestClose={() => setDiscardOpen(false)}
        >
          <p>
            <FormattedMessage
              id={
                modalState.current.unknown
                  ? "patient.maintenance.discard.unknown"
                  : "patient.maintenance.discard.message"
              }
            />
          </p>
        </Modal>
      )}
    </>
  );
}

export default injectIntl(PatientManagement);
