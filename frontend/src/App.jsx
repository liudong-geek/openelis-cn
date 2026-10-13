import ResultIntakeHandoff from "./components/resultPage/unified/ResultIntakeHandoff";
import React, {
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { confirmAlert } from "react-confirm-alert";
import { IntlProvider } from "react-intl";
import { Route, BrowserRouter as Router, Switch } from "react-router-dom";
import RedirectOldUI from "./RedirectOldUI";
import UserSessionDetailsContext from "./UserSessionDetailsContext";
import { Admin } from "./components";
import ChangePassword from "./components/ChangePassword";
import Home from "./components/Home";
import Layout from "./components/layout/Layout";
import { navigationMenuOwner } from "./components/layout/navigationMenuAvailability";
const StorageDashboard = lazyWithRetry(
  () => import("./components/storage/StorageDashboard"),
);
const SampleItemsPage = lazyWithRetry(
  () => import("./components/storage/pages/SampleItemsPage"),
);
const ManageLocationPage = lazyWithRetry(
  () => import("./components/storage/pages/ManageLocationPage"),
);
const RoomsPage = lazyWithRetry(
  () => import("./components/storage/pages/RoomsPage"),
);
const DevicesPage = lazyWithRetry(
  () => import("./components/storage/pages/DevicesPage"),
);
const ShelvesPage = lazyWithRetry(
  () => import("./components/storage/pages/ShelvesPage"),
);
const RacksPage = lazyWithRetry(
  () => import("./components/storage/pages/RacksPage"),
);
const BoxesPage = lazyWithRetry(
  () => import("./components/storage/pages/BoxesPage"),
);
const EditLocationPage = lazyWithRetry(
  () => import("./components/storage/pages/EditLocationPage"),
);
const EditBoxPage = lazyWithRetry(
  () => import("./components/storage/pages/EditBoxPage"),
);
const AddLocationPage = lazyWithRetry(
  () => import("./components/storage/pages/AddLocationPage"),
);
const AddBoxPage = lazyWithRetry(
  () => import("./components/storage/pages/AddBoxPage"),
);
import AlertsDashboard from "./components/alerts/AlertsDashboard";
const EQAProgramManagement = lazyWithRetry(
  () => import("./components/eqa/EQAProgram/ProgramManagement"),
);
const EQADistributionDashboard = lazyWithRetry(
  () => import("./components/eqa/EQADistributionDashboard"),
);
const CreateDistribution = lazyWithRetry(
  () => import("./components/eqa/EQADistribution/CreateDistribution"),
);
const EQAOrdersPage = lazyWithRetry(
  () => import("./components/eqa/EQAOrdersPage"),
);
const MyProgramsPage = lazyWithRetry(
  () => import("./components/eqa/MyProgramsPage"),
);
const EQAParticipantsPage = lazyWithRetry(
  () => import("./components/eqa/EQAParticipantsPage"),
);
const EQAResultsPage = lazyWithRetry(
  () => import("./components/eqa/EQAResultsPage"),
);
import InventoryManagement from "./components/inventory/InventoryManagement";
const ShipmentDashboard = lazyWithRetry(
  () => import("./components/shipment/ShipmentDashboard"),
);
const BoxCreation = lazyWithRetry(
  () => import("./components/shipment/BoxCreation"),
);
const BoxDetails = lazyWithRetry(
  () => import("./components/shipment/BoxDetails"),
);
const ReceptionWorkflow = lazyWithRetry(
  () => import("./components/shipment/ReceptionWorkflow"),
);
import Login from "./components/Login";
import LandingPage from "./components/home/LandingPage";

/**
 * Wraps `React.lazy` with retry-on-failure semantics for the dynamic
 * `import()` factory. Handles transient chunk-fetch failures — e.g.
 * Chrome's `ERR_NETWORK_CHANGED` when the browser's network state
 * flickers during a chunk request, or any single failed resource fetch
 * that leaves the lazy component permanently broken until page reload.
 *
 * Without retry, a single chunk-fetch blip crashes the route and
 * surfaces as an E2E failure: the RouteErrorBoundary catches the
 * `TypeError: Failed to fetch dynamically imported module` and shows
 * its "module could not be loaded" fallback. Seen as a recurring
 * develop-CI flake on AnalyzerForm chunk fetch; the retry wrapper
 * gives the browser three chances with backoff before giving up.
 *
 * Backoff is intentionally short (0.5s/1s/1.5s): the real failures
 * are transient TCP / Docker-network conditions that resolve in
 * milliseconds. Longer waits would harm real error reporting when the
 * chunk is genuinely missing (e.g., deploy mismatch).
 */
function lazyWithRetry(factory, retries = 3, backoffMs = 500) {
  // eslint-disable-next-line local/no-raw-react-lazy --
  // This IS the lazyWithRetry helper: it legitimately wraps React.lazy
  // with retry semantics. The rule flags direct callers elsewhere.
  return React.lazy(async () => {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (attempt < retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, backoffMs * (attempt + 1)),
          );
        }
      }
    }
    throw lastError;
  });
}

const AnalyzersPage = lazyWithRetry(() => import("./pages/AnalyzersPage"));
const FieldMapping = lazyWithRetry(
  () => import("./components/analyzers/FieldMapping/FieldMapping"),
);
const ErrorDashboardPage = lazyWithRetry(
  () => import("./pages/ErrorDashboardPage"),
);
const CustomFieldTypeManagementPage = lazyWithRetry(
  () => import("./pages/CustomFieldTypeManagementPage"),
);
const AnalyzerTypesPage = lazyWithRetry(
  () => import("./pages/AnalyzerTypesPage"),
);
const AnalyzerFormPage = lazyWithRetry(
  () => import("./components/analyzers/AnalyzerForm/AnalyzerForm"),
);
const QcRulePage = lazyWithRetry(
  () => import("./components/analyzers/QcRules/QcRuleBuilderModal"),
);
import {
  QCDashboard,
  ControlChartDetail,
  ControlLotList,
  InstrumentDetailPage,
  ControlLotSetup,
  RuleConfigPanel,
} from "./components/qc";
import ResultSearch from "./components/resultPage/ResultSearch";
import {
  LegacyResultsGate,
  UnifiedResultsRoute,
} from "./components/resultPage/unified/routeGates";
import { getFromOpenElisServer } from "./components/utils/Utils";
import {
  getRequestLocale,
  resolveSupportedLocale,
} from "./components/utils/LocaleUtils";
import { loadAndApplyBranding } from "./components/utils/BrandingUtils";
import { defaultLanguages, languageMessages } from "./languages";
import config from "./config.json";
import { SecureRoute } from "./components/security";
import "./index.scss";
import PatientManagement from "./components/patient/PatientManagement";
import PatientHistory from "./components/patient/PatientHistory";
import ListReturnButton from "./components/common/ListReturnButton";
import PatientMerge from "./components/patient/PatientMerge";
import Aliquot from "./components/sample/Aliquot";
import Workplan from "./components/workplan/Workplan";
import AddOrder from "./components/addOrder/Index";
import FindOrder from "./components/modifyOrder/Index";
import ModifyOrder from "./components/modifyOrder/ModifyOrder";
import RoutineReports from "./components/reports/Routine";
import StudyReports from "./components/reports/Study";
import TATReport from "./components/reports/tat";
import StudyValidation from "./components/validation/Index";
const AnalyserResultIndex = lazyWithRetry(
  () => import("./components/analyserResults/Index"),
);
const PathologyDashboard = lazyWithRetry(
  () => import("./components/pathology/PathologyDashboard"),
);
const CytologyDashboard = lazyWithRetry(
  () => import("./components/cytology/CytologyDashBoard"),
);
const NoteBookDashBoard = lazyWithRetry(
  () => import("./components/notebook/NoteBookDashBoard"),
);
const NoteBookEntryForm = lazyWithRetry(
  () => import("./components/notebook/NoteBookEntryForm"),
);
const CytologyCaseView = lazyWithRetry(
  () => import("./components/cytology/CytologyCaseView"),
);
const PathologyCaseView = lazyWithRetry(
  () => import("./components/pathology/PathologyCaseView"),
);
const ImmunohistochemistryDashboard = lazyWithRetry(
  () =>
    import("./components/immunohistochemistry/ImmunohistochemistryDashboard"),
);
const ImmunohistochemistryCaseView = lazyWithRetry(
  () =>
    import("./components/immunohistochemistry/ImmunohistochemistryCaseView"),
);
const RoutedResultsViewer = lazyWithRetry(
  () => import("./components/patient/resultsViewer/results-viewer.tsx"),
);
import EOrderPage from "./components/eOrder/Index";
import RoutineIndex from "./components/reports/routine/Index";
import StudyIndex from "./components/reports/study/index";
import ReportIndex from "./components/reports/Index";
import PrintBarcode from "./components/printBarcode/Index";
import NonConformIndex from "./components/nonconform/index";
import SampleBatchEntrySetup from "./components/batchOrderEntry/SampleBatchEntrySetup";
import AuditTrailReportIndex from "./components/reports/auditTrailReport/Index";
import ReferredOutTests from "./components/resultPage/resultsReferredOut/ReferredOutTests";
import { Roles } from "./components/utils/Utils";

export const SPECIALTY_ROUTE_ACCESS = {
  pathology: {
    role: [Roles.RESULTS, Roles.PATHOLOGIST],
    labUnitRole: { Pathology: [Roles.RESULTS] },
  },
  immunohistochemistry: {
    role: [Roles.RESULTS, Roles.PATHOLOGIST],
    labUnitRole: { Immunohistochemistry: [Roles.RESULTS] },
  },
  cytology: {
    role: [Roles.RESULTS, Roles.CYTOPATHOLOGIST],
    labUnitRole: { Cytology: [Roles.RESULTS] },
  },
};
const NoteBookInstanceEntryForm = lazyWithRetry(
  () => import("./components/notebook/NoteBookInstanceEntryForm"),
);
const NotebookSampleOrder = lazyWithRetry(
  () => import("./components/notebook/NotebookSampleOrder"),
);
const FreezerMonitoringDashboard = lazyWithRetry(
  () => import("./components/coldStorage/FreezerMonitoringDashboard"),
);
import ProgramDashboard from "./components/program/programDashboard.jsx";
import ProgramCaseView from "./components/program/programCaseView.jsx";
import SampleManagement from "./components/sampleManagement/SampleManagement";
const ShipmentReport = lazyWithRetry(
  () => import("./components/shipment/ShipmentReport"),
);

const GenericSampleOrder = lazyWithRetry(
  () => import("./components/genericSample/GenericSampleOrder"),
);
const GenericSampleOrderEdit = lazyWithRetry(
  () => import("./components/genericSample/GenericSampleOrderEdit"),
);
const GenericSampleOrderImport = lazyWithRetry(
  () => import("./components/genericSample/GenericSampleOrderImport"),
);
const GenericSampleResults = lazyWithRetry(
  () => import("./components/genericSample/GenericSampleResults"),
);

const ShipmentSettings = lazyWithRetry(
  () => import("./components/shipment/ShipmentSettings"),
);
import RouteErrorBoundary from "./components/common/RouteErrorBoundary";
import PageLoadingState from "./components/common/PageLoadingState";
import OptionalModuleGate from "./components/security/OptionalModuleGate";
import {
  OrderProvider,
  OrderDashboard,
  SavedOrderView,
  OrderEnter,
  OrderCollect,
  OrderLabel,
  OrderQA,
} from "./components/order";
import "./ux-foundation.scss";
import { INTERNAL_ROUTE_REFRESH_EVENT } from "./components/utils/NavigationUtils";

// Keep language changes within the same administration workspace, while every
// authenticated owner/session change still discards the previous user's state.
function AdminRoute() {
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  return <Admin key={navigationMenuOwner(userSessionDetails)} />;
}

export const AUDIT_TRAIL_ROUTE_ROLES = Object.freeze([
  Roles.GLOBAL_ADMIN,
  Roles.AUDIT_TRAIL,
]);

export default function App() {
  // The China delivery edition has one visible UI locale. Normalize even a
  // previously saved English preference before the first render so users do
  // not see a flash of English while the backend locale list is loading.
  const savedLocale = localStorage.getItem("locale");
  const initialLocale = resolveSupportedLocale(
    savedLocale,
    Object.keys(defaultLanguages),
    "zh",
  );
  // Older installations persisted Java-style aliases such as zh_CN. Store the
  // canonical UI key before the first API effect runs so every request uses the
  // same language as React Intl.
  if (savedLocale !== initialLocale) {
    localStorage.setItem("locale", initialLocale);
  }

  const [locale, setLocale] = useState(initialLocale);
  const [messages, setMessages] = useState(
    defaultLanguages[initialLocale].messages,
  );

  const [userSessionDetails, setUserSessionDetails] = useState({});
  const [errorLoadingSessionDetails, setErrorLoadingSessionDetails] =
    useState(false);
  const [routeRefreshKey, setRouteRefreshKey] = useState(0);

  const sessionRead = useRef(null);
  const appActive = useRef(true);
  const sessionEnding = useRef(false);
  const brandingRead = useRef(null);
  const cancelledSessionRead = useRef(Symbol("cancelled-session-read"));
  const brandingOwner = JSON.stringify([
    userSessionDetails.authenticated === true,
    userSessionDetails.userId ?? null,
    userSessionDetails.sessionId ?? null,
    userSessionDetails.loginLabUnit ?? null,
    userSessionDetails.roles ?? [],
    userSessionDetails.userLabRolesMap ?? {},
  ]);

  const brandingOwnerRef = useRef(brandingOwner);
  brandingOwnerRef.current = brandingOwner;

  useEffect(() => {
    appActive.current = true;
    const cancelSession = () => {
      appActive.current = false;
      sessionRead.current?.abort();
    };
    const resumeSession = (event) => {
      if (!event.persisted) return;
      appActive.current = true;
      getUserSessionDetails();
    };
    getUserSessionDetails();
    window.addEventListener("pagehide", cancelSession);
    window.addEventListener("pageshow", resumeSession);
    return () => {
      cancelSession();
      window.removeEventListener("pagehide", cancelSession);
      window.removeEventListener("pageshow", resumeSession);
    };
  }, []);

  useEffect(() => {
    const refreshCurrentRoute = () => {
      setRouteRefreshKey((currentKey) => currentKey + 1);
    };
    window.addEventListener(INTERNAL_ROUTE_REFRESH_EVENT, refreshCurrentRoute);
    return () => {
      window.removeEventListener(
        INTERNAL_ROUTE_REFRESH_EVENT,
        refreshCurrentRoute,
      );
    };
  }, []);

  // Each branding read belongs to this mounted session and replaces its predecessor.
  useEffect(() => {
    let controller;
    let active = true;
    const cancelBranding = () => controller?.abort();
    const loadBranding = () => {
      if (!active || sessionEnding.current) return;
      cancelBranding();
      const current = new AbortController();
      controller = current;
      brandingRead.current = current;
      loadAndApplyBranding(
        undefined,
        current.signal,
        () =>
          active &&
          !sessionEnding.current &&
          controller === current &&
          brandingOwnerRef.current === brandingOwner,
      );
    };
    const hideBranding = () => {
      active = false;
      cancelBranding();
    };
    const resumeBranding = (event) => {
      if (!event.persisted) return;
      active = true;
      loadBranding();
    };
    loadBranding();
    window.addEventListener("branding-updated", loadBranding);
    window.addEventListener("pagehide", hideBranding);
    window.addEventListener("pageshow", resumeBranding);
    return () => {
      hideBranding();
      window.removeEventListener("branding-updated", loadBranding);
      window.removeEventListener("pagehide", hideBranding);
      window.removeEventListener("pageshow", resumeBranding);
    };
  }, [brandingOwner]);

  const getUserSessionDetails = async () => {
    if (sessionEnding.current) return cancelledSessionRead.current;
    sessionRead.current?.abort();
    const controller = new AbortController();
    sessionRead.current = controller;
    const isCurrent = () =>
      appActive.current &&
      sessionRead.current === controller &&
      !controller.signal.aborted;
    const waitToRetry = () =>
      new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, 1000);
        controller.signal.addEventListener("abort", done, { once: true });
        if (controller.signal.aborted) done();
      });
    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (!isCurrent()) return cancelledSessionRead.current;
      try {
        const response = await fetch(config.serverBaseUrl + `/session`, {
          credentials: "include",
          signal: controller.signal,
          headers: {
            "Accept-Language": getRequestLocale(),
          },
        });
        if (!isCurrent()) return cancelledSessionRead.current;
        if (response.status === 200) {
          const jsonResp = await response.json();
          if (!isCurrent()) return cancelledSessionRead.current;
          if (jsonResp.authenticated) {
            localStorage.setItem("CSRF", jsonResp.csrf);
          }
          setUserSessionDetails(jsonResp);
          setErrorLoadingSessionDetails(false);
          return jsonResp;
        } else {
          throw new Error(
            "Did not receive a successful response from the backend while retrieving user session details",
          );
        }
      } catch (error) {
        if (!isCurrent()) return cancelledSessionRead.current;
        console.error(error);
        if (attempt < maxRetries - 1) {
          await waitToRetry();
        } else {
          const options = {
            title: messages["app.session.error.title"] || "系统连接失败",
            message:
              messages["app.session.error.message"] ||
              "无法连接到本地检验系统，请确认服务已启动后重新加载页面。",
            buttons: [
              {
                label: messages["errorBoundary.reload"] || "重新加载",
                onClick: () => {
                  window.location.href = window.location.origin;
                },
              },
            ],
            closeOnClickOutside: false,
            closeOnEscape: false,
          };
          confirmAlert(options);
        }
      }
    }
    if (isCurrent()) setErrorLoadingSessionDetails(true);
    else return cancelledSessionRead.current;
  };

  const logout = () => {
    sessionEnding.current = true;
    sessionRead.current?.abort();
    brandingRead.current?.abort();
    if (userSessionDetails.loginMethod === "SAML") {
      fetch(config.serverBaseUrl + "/Logout?useSAML=true", {
        //includes the browser sessionId in the Header for Authentication on the backend server
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": localStorage.getItem("CSRF"),
          "Accept-Language": getRequestLocale(),
        },
      })
        .then((response) => response.text())
        .then((html) => {
          // Parse the SAML SLO response and submit the form in the current
          // window — no popup, no iframe needed.
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const samlForm = doc.querySelector("form");

          if (samlForm) {
            const form = document.createElement("form");
            form.method = samlForm.method || "POST";
            form.action = samlForm.action;
            Array.from(samlForm.querySelectorAll("input")).forEach((input) => {
              const hidden = document.createElement("input");
              hidden.type = "hidden";
              hidden.name = input.name;
              hidden.value = input.value;
              form.appendChild(hidden);
            });
            document.body.appendChild(form);
            form.submit();
          } else {
            // No SAML form in response — fall back to a direct redirect
            sessionEnding.current = false;
            getUserSessionDetails();
            window.location.href = config.loginRedirect;
          }
        })
        .catch((error) => {
          sessionEnding.current = false;
          console.error(error);
        });
    } else {
      fetch(config.serverBaseUrl + "/Logout", {
        //includes the browser sessionId in the Header for Authentication on the backend server
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": localStorage.getItem("CSRF"),
          "Accept-Language": getRequestLocale(),
        },
      })
        .then((response) => response.status)
        .then(() => {
          sessionEnding.current = false;
          getUserSessionDetails();
          window.location.href = config.loginRedirect;
        })
        .catch((error) => {
          sessionEnding.current = false;
          console.error(error);
        });
    }
  };

  const changeLanguageReact = (lang) => {
    lang = resolveSupportedLocale(lang, Object.keys(defaultLanguages), "zh");
    setLocale(lang);
    setMessages(defaultLanguages[lang]?.messages || languageMessages.zh);
    localStorage.setItem("locale", lang);
  };

  const changeLanguageBackend = async (lang) => {
    const requestLocale = resolveSupportedLocale(
      lang,
      Object.keys(defaultLanguages),
      "zh",
    );
    if (userSessionDetails.authenticated) {
      getFromOpenElisServer(
        "/Home?lang=" + encodeURIComponent(requestLocale),
        () => {
          // Language changed on backend
        },
      );
    } else {
      getFromOpenElisServer(
        "/LoginPage?lang=" + encodeURIComponent(requestLocale),
        () => {
          // Language changed on backend
        },
      );
    }
  };

  const onChangeLanguage = (lang) => {
    changeLanguageReact(lang);
    changeLanguageBackend(lang);
  };

  const refresh = async (callback) => {
    const session = await getUserSessionDetails();
    if (
      session !== cancelledSessionRead.current &&
      typeof callback === "function"
    ) {
      callback();
    }
  };

  const isCheckingLogin = () => {
    return !("authenticated" in userSessionDetails);
  };

  const routeErrorPatientResultsViewer = {
    titleKey: "errorBoundary.route.patientResultsViewer.title",
    messageKey: "errorBoundary.route.patientResultsViewer.message",
  };

  const routeErrorResultsSearch = {
    titleKey: "errorBoundary.route.resultsSearch.title",
    messageKey: "errorBoundary.route.resultsSearch.message",
  };

  const routeErrorSamplePatientEntry = {
    titleKey: "errorBoundary.route.samplePatientEntry.title",
    messageKey: "errorBoundary.route.samplePatientEntry.message",
  };

  const routeErrorAnalyzers = {
    titleKey: "errorBoundary.route.analyzers.title",
    messageKey: "errorBoundary.route.analyzers.message",
  };

  const routeErrorAnalyzerResults = {
    titleKey: "errorBoundary.route.analyzerResults.title",
    messageKey: "errorBoundary.route.analyzerResults.message",
  };

  return (
    <IntlProvider locale={locale} defaultLocale="en" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails,
          errorLoadingSessionDetails,
          isCheckingLogin,
          logout,
          refresh,
        }}
      >
        <>
          <Router>
            <Layout onChangeLanguage={onChangeLanguage}>
              <Switch key={routeRefreshKey}>
                <Route path="/login" exact component={Login} />
                <Route
                  path="/ChangePasswordLogin"
                  exact
                  component={ChangePassword}
                />
                <Route
                  path="/landing"
                  exact
                  component={() => <LandingPage />}
                />
                <SecureRoute
                  path="/"
                  exact
                  component={() => <Home />}
                  role=""
                />
                <SecureRoute
                  path="/Dashboard"
                  exact
                  component={() => <Home />}
                  role=""
                />
                <SecureRoute
                  path="/admin"
                  component={AdminRoute}
                  role={Roles.GLOBAL_ADMIN}
                />
                <SecureRoute
                  path="/MasterListsPage"
                  component={AdminRoute}
                  role={Roles.GLOBAL_ADMIN}
                />
                <SecureRoute
                  path="/PathologyDashboard"
                  exact
                  render={() => (
                    <OptionalModuleGate module="pathology">
                      <PathologyDashboard />
                    </OptionalModuleGate>
                  )}
                  role={SPECIALTY_ROUTE_ACCESS.pathology.role}
                  labUnitRole={SPECIALTY_ROUTE_ACCESS.pathology.labUnitRole}
                />
                <SecureRoute
                  path="/PathologyCaseView/:pathologySampleId"
                  exact
                  render={() => (
                    <OptionalModuleGate module="pathology">
                      <PathologyCaseView />
                    </OptionalModuleGate>
                  )}
                  role={SPECIALTY_ROUTE_ACCESS.pathology.role}
                  labUnitRole={SPECIALTY_ROUTE_ACCESS.pathology.labUnitRole}
                />
                <SecureRoute
                  path="/ImmunohistochemistryDashboard"
                  exact
                  render={() => (
                    <OptionalModuleGate module="immunohistochemistry">
                      <ImmunohistochemistryDashboard />
                    </OptionalModuleGate>
                  )}
                  role={SPECIALTY_ROUTE_ACCESS.immunohistochemistry.role}
                  labUnitRole={
                    SPECIALTY_ROUTE_ACCESS.immunohistochemistry.labUnitRole
                  }
                />
                <SecureRoute
                  path="/ImmunohistochemistryCaseView/:immunohistochemistrySampleId"
                  exact
                  render={() => (
                    <OptionalModuleGate module="immunohistochemistry">
                      <ImmunohistochemistryCaseView />
                    </OptionalModuleGate>
                  )}
                  role={SPECIALTY_ROUTE_ACCESS.immunohistochemistry.role}
                  labUnitRole={
                    SPECIALTY_ROUTE_ACCESS.immunohistochemistry.labUnitRole
                  }
                />
                <SecureRoute
                  path="/CytologyDashboard"
                  exact
                  render={() => (
                    <OptionalModuleGate module="cytology">
                      <CytologyDashboard />
                    </OptionalModuleGate>
                  )}
                  role={SPECIALTY_ROUTE_ACCESS.cytology.role}
                  labUnitRole={SPECIALTY_ROUTE_ACCESS.cytology.labUnitRole}
                />
                <SecureRoute
                  path="/genericProgram"
                  exact
                  component={() => <ProgramDashboard />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/programView/:programSampleId"
                  exact
                  component={() => <ProgramCaseView />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/NoteBookDashboard"
                  exact
                  render={() => (
                    <OptionalModuleGate module="notebook">
                      <NoteBookDashBoard />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.VALIDATION]}
                />
                <SecureRoute
                  path="/NoteBookEntryForm/:notebookid"
                  exact
                  render={() => (
                    <OptionalModuleGate module="notebook">
                      <NoteBookEntryForm />
                    </OptionalModuleGate>
                  )}
                  role={Roles.GLOBAL_ADMIN}
                />
                <SecureRoute
                  path="/NoteBookEntryForm"
                  exact
                  render={() => (
                    <OptionalModuleGate module="notebook">
                      <NoteBookEntryForm />
                    </OptionalModuleGate>
                  )}
                  role={Roles.GLOBAL_ADMIN}
                />
                <SecureRoute
                  path="/NoteBookInstanceEntryForm/:notebookid"
                  exact
                  render={() => (
                    <OptionalModuleGate module="notebook">
                      <NoteBookInstanceEntryForm />
                    </OptionalModuleGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/NoteBookInstanceEditForm/:notebookentryid"
                  exact
                  render={() => (
                    <OptionalModuleGate module="notebook">
                      <NoteBookInstanceEntryForm />
                    </OptionalModuleGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/NotebookSampleOrder/:notebookId/:notebookEntryId"
                  exact
                  render={() => (
                    <OptionalModuleGate module="notebook">
                      <NotebookSampleOrder />
                    </OptionalModuleGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/NotebookSampleOrder/:notebookId"
                  exact
                  render={() => (
                    <OptionalModuleGate module="notebook">
                      <NotebookSampleOrder />
                    </OptionalModuleGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/CytologyCaseView/:cytologySampleId"
                  exact
                  render={() => (
                    <OptionalModuleGate module="cytology">
                      <CytologyCaseView />
                    </OptionalModuleGate>
                  )}
                  role={SPECIALTY_ROUTE_ACCESS.cytology.role}
                  labUnitRole={SPECIALTY_ROUTE_ACCESS.cytology.labUnitRole}
                />
                <SecureRoute
                  path="/GenericSample/Order"
                  exact
                  component={() => (
                    <Suspense fallback={<PageLoadingState />}>
                      <GenericSampleOrder />
                    </Suspense>
                  )}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/GenericSample/Edit"
                  exact
                  component={() => (
                    <Suspense fallback={<PageLoadingState />}>
                      <GenericSampleOrderEdit />
                    </Suspense>
                  )}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/GenericSample/Import"
                  exact
                  component={() => (
                    <Suspense fallback={<PageLoadingState />}>
                      <GenericSampleOrderImport />
                    </Suspense>
                  )}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/FreezerMonitoring"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <FreezerMonitoringDashboard />
                    </OptionalModuleGate>
                  )}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/SamplePatientEntry"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorSamplePatientEntry}>
                      <AddOrder />
                    </RouteErrorBoundary>
                  )}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/order/view"
                  exact
                  component={() => <SavedOrderView />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/order/result-intake"
                  exact
                  component={() => <ResultIntakeHandoff />}
                  role={Roles.RESULTS}
                />
                {/* Decoupled Sample Collection Workflow - NAV-2 */}
                {/* Use Route with render to wrap all /order/* paths in shared OrderProvider */}
                <Route
                  path="/order"
                  render={({ match }) => (
                    <OrderProvider>
                      <Switch>
                        <SecureRoute
                          path={`${match.path}`}
                          exact
                          component={() => <OrderDashboard />}
                          role={Roles.RECEPTION}
                        />
                        <SecureRoute
                          path={`${match.path}/enter`}
                          exact
                          component={() => <OrderEnter />}
                          role={Roles.RECEPTION}
                        />
                        <SecureRoute
                          path={`${match.path}/collect`}
                          exact
                          component={() => <OrderCollect />}
                          role={Roles.RECEPTION}
                        />
                        <SecureRoute
                          path={`${match.path}/label`}
                          exact
                          component={() => <OrderLabel />}
                          role={Roles.RECEPTION}
                        />
                        <SecureRoute
                          path={`${match.path}/qa`}
                          exact
                          component={() => <OrderQA />}
                          role={Roles.RECEPTION}
                        />
                      </Switch>
                    </OrderProvider>
                  )}
                />
                <SecureRoute
                  path="/ModifyOrder"
                  exact
                  component={() => <ModifyOrder />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/SampleEdit"
                  exact
                  component={() => <FindOrder />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/NceDashboard"
                  exact
                  component={() => <NonConformIndex form="NceDashboard" />}
                  role={[Roles.RECEPTION, Roles.VALIDATION]}
                />
                <SecureRoute
                  path="/ReportNonConformingEvent"
                  exact
                  component={() => (
                    <NonConformIndex form="ReportNonConformingEvent" />
                  )}
                  role={[Roles.RECEPTION, Roles.VALIDATION]}
                />
                <SecureRoute
                  path="/ViewNonConformingEvent"
                  exact
                  component={() => (
                    <NonConformIndex form="ViewNonConformingEvent" />
                  )}
                  role={[Roles.RECEPTION, Roles.VALIDATION]}
                />

                <SecureRoute
                  path="/NCECorrectiveAction"
                  exact
                  component={() => (
                    <NonConformIndex form="NCECorrectiveAction" />
                  )}
                  role={[Roles.RECEPTION, Roles.VALIDATION]}
                />

                <SecureRoute
                  path="/SampleBatchEntrySetup"
                  exact
                  component={() => <SampleBatchEntrySetup />}
                  role={Roles.RECEPTION}
                />

                <SecureRoute
                  path="/ElectronicOrders"
                  exact
                  component={() => <EOrderPage />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/PrintBarcode"
                  exact
                  component={() => <PrintBarcode />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/PatientManagement/:patientId?"
                  exact
                  component={() => <PatientManagement />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/Alerts"
                  exact
                  component={() => <AlertsDashboard />}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/EQAOrders"
                  exact
                  render={() => (
                    <OptionalModuleGate module="eqa">
                      <EQAOrdersPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/EQAMyPrograms"
                  exact
                  render={() => (
                    <OptionalModuleGate module="eqa">
                      <MyProgramsPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/EQAManagement"
                  exact
                  render={() => (
                    <OptionalModuleGate module="eqa">
                      <EQAProgramManagement />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/EQAResults"
                  exact
                  render={() => (
                    <OptionalModuleGate module="eqa">
                      <EQAResultsPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/EQAParticipants"
                  exact
                  render={() => (
                    <OptionalModuleGate module="eqa">
                      <EQAParticipantsPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/EQADistribution/create"
                  exact
                  render={() => (
                    <OptionalModuleGate module="eqa">
                      <CreateDistribution />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/EQADistribution"
                  exact
                  render={() => (
                    <OptionalModuleGate module="eqa">
                      <EQADistributionDashboard />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/Storage"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <StorageDashboard />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/sample-items"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <SampleItemsPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/sample-items/:id/manage-location"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <ManageLocationPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/rooms"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <RoomsPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/devices"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <DevicesPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/shelves"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <ShelvesPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/racks"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <RacksPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/boxes"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <BoxesPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/rooms/new"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <AddLocationPage type="room" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/devices/new"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <AddLocationPage type="device" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/shelves/new"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <AddLocationPage type="shelf" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/racks/new"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <AddLocationPage type="rack" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/boxes/new"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <AddBoxPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/rooms/:id/edit"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <EditLocationPage type="room" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/devices/:id/edit"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <EditLocationPage type="device" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/shelves/:id/edit"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <EditLocationPage type="shelf" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/racks/:id/edit"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <EditLocationPage type="rack" />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/Storage/boxes/:id/edit"
                  exact
                  render={() => (
                    <OptionalModuleGate module="storage">
                      <EditBoxPage />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/inventory"
                  exact
                  component={() => <InventoryManagement />}
                  role={[Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleShipment"
                  exact
                  render={() => (
                    <OptionalModuleGate module="shipment">
                      <ShipmentDashboard />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleShipment/create-box"
                  exact
                  render={() => (
                    <OptionalModuleGate module="shipment">
                      <BoxCreation />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleShipment/box/:boxId"
                  exact
                  render={(routeProps) => (
                    <OptionalModuleGate module="shipment">
                      <BoxDetails {...routeProps} />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleShipment/receive"
                  exact
                  render={() => (
                    <OptionalModuleGate module="shipment">
                      <ReceptionWorkflow />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleShipment/reports"
                  exact
                  render={() => (
                    <OptionalModuleGate module="shipment">
                      <ShipmentReport />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleShipment/settings"
                  exact
                  render={() => (
                    <OptionalModuleGate module="shipment">
                      <ShipmentSettings />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleShipment/:tab"
                  render={() => (
                    <OptionalModuleGate module="shipment">
                      <ShipmentDashboard />
                    </OptionalModuleGate>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.GLOBAL_ADMIN]}
                />
                <SecureRoute
                  path="/SampleManagement"
                  exact
                  component={() => <SampleManagement />}
                  role={[Roles.RECEPTION, Roles.RESULTS]}
                />
                <SecureRoute
                  path="/analyzers/new"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <AnalyzerFormPage />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.GLOBAL_ADMIN}
                />
                <SecureRoute
                  path="/analyzers/:id/edit"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <AnalyzerFormPage />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.GLOBAL_ADMIN}
                />
                <SecureRoute
                  path="/analyzers/:id/qc-rules"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <QcRulePage />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.GLOBAL_ADMIN}
                />
                <SecureRoute
                  path="/analyzers"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <AnalyzersPage />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.ANALYSER_IMPORT}
                />
                <SecureRoute
                  path="/analyzers/:id/mappings"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <FieldMapping />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.ANALYSER_IMPORT}
                />
                <SecureRoute
                  path="/analyzers/errors"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <ErrorDashboardPage />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.ANALYSER_IMPORT}
                />
                <SecureRoute
                  path="/analyzers/custom-field-types"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <CustomFieldTypeManagementPage />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.ANALYSER_IMPORT}
                />
                <SecureRoute
                  path="/analyzers/types"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzers}>
                      <Suspense fallback={<PageLoadingState />}>
                        <AnalyzerTypesPage />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.ANALYSER_IMPORT}
                />
                <SecureRoute
                  path="/analyzers/qc/instruments/:instrumentId"
                  exact
                  component={() => <InstrumentDetailPage />}
                  role={Roles.LAB_SUPERVISOR}
                />
                <SecureRoute
                  path="/analyzers/qc/db"
                  exact
                  component={() => <QCDashboard />}
                  role={Roles.LAB_SUPERVISOR}
                />
                <SecureRoute
                  path="/analyzers/qc/charts/:analyzerId"
                  exact
                  component={() => <ControlChartDetail />}
                  role={Roles.LAB_SUPERVISOR}
                />
                <SecureRoute
                  path="/analyzers/qc/control-lots"
                  exact
                  component={() => <ControlLotList />}
                  role={Roles.LAB_SUPERVISOR}
                />
                <SecureRoute
                  path="/analyzers/qc/control-lots/new"
                  exact
                  component={() => <ControlLotSetup />}
                  role={Roles.LAB_SUPERVISOR}
                />
                <SecureRoute
                  path="/analyzers/qc/control-lots/:id"
                  exact
                  component={() => <ControlLotSetup />}
                  role={Roles.LAB_SUPERVISOR}
                />
                <SecureRoute
                  path="/analyzers/qc/rule-config"
                  exact
                  component={() => <RuleConfigPanel />}
                  role={Roles.LAB_SUPERVISOR}
                />
                <SecureRoute
                  path="/PatientHistory"
                  exact
                  component={() => <PatientHistory />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/PatientMerge"
                  exact
                  component={() => <PatientMerge />}
                  role={Roles.RECEPTION}
                />
                <SecureRoute
                  path="/GenericSample/Results"
                  exact
                  component={() => (
                    <Suspense fallback={<PageLoadingState />}>
                      <GenericSampleResults />
                    </Suspense>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/Aliquot"
                  exact
                  component={() => <Aliquot />}
                  role={Roles.RECEPTION}
                />

                <SecureRoute
                  path="/PatientResults/:patientId"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorPatientResultsViewer}>
                      <ListReturnButton fallback="/PatientManagement" />
                      <Suspense fallback={<PageLoadingState />}>
                        <RoutedResultsViewer />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={[Roles.RECEPTION, Roles.RESULTS, Roles.REPORTS]}
                />

                <SecureRoute
                  path="/WorkPlanByTestSection"
                  exact
                  component={() => <Workplan type="unit" />}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/WorkplanByTest"
                  exact
                  component={() => <Workplan type="test" />}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/WorkplanByPanel"
                  exact
                  component={() => <Workplan type="panel" />}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/WorkplanByPriority"
                  exact
                  component={() => <Workplan type="priority" />}
                  role={Roles.RESULTS}
                />
                {/* OGC-1020 (R1): canonical unified worklist, gated by the
                    results.entry.unifiedRoute site flag */}
                <SecureRoute
                  path="/Results"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorResultsSearch}>
                      <UnifiedResultsRoute />
                    </RouteErrorBoundary>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/result"
                  exact
                  component={() => (
                    <LegacyResultsGate>
                      <RouteErrorBoundary {...routeErrorResultsSearch}>
                        <ResultSearch />
                      </RouteErrorBoundary>
                    </LegacyResultsGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/LogbookResults"
                  exact
                  component={() => (
                    <LegacyResultsGate>
                      <RouteErrorBoundary {...routeErrorResultsSearch}>
                        <ResultSearch />
                      </RouteErrorBoundary>
                    </LegacyResultsGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/PatientResults"
                  exact
                  component={() => (
                    <LegacyResultsGate>
                      <RouteErrorBoundary {...routeErrorResultsSearch}>
                        <ResultSearch />
                      </RouteErrorBoundary>
                    </LegacyResultsGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/AccessionResults"
                  exact
                  component={() => (
                    <LegacyResultsGate>
                      <RouteErrorBoundary {...routeErrorResultsSearch}>
                        <ResultSearch />
                      </RouteErrorBoundary>
                    </LegacyResultsGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/StatusResults"
                  exact
                  component={() => (
                    <LegacyResultsGate>
                      <RouteErrorBoundary {...routeErrorResultsSearch}>
                        <ResultSearch />
                      </RouteErrorBoundary>
                    </LegacyResultsGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/RangeResults"
                  exact
                  component={() => (
                    <LegacyResultsGate>
                      <RouteErrorBoundary {...routeErrorResultsSearch}>
                        <ResultSearch />
                      </RouteErrorBoundary>
                    </LegacyResultsGate>
                  )}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/ReferredOutTests"
                  exact
                  component={() => <ReferredOutTests />}
                  role={Roles.RESULTS}
                />
                <SecureRoute
                  path="/RoutineReports"
                  exact
                  component={() => <RoutineReports />}
                  role={Roles.REPORTS}
                />
                <SecureRoute
                  path="/RoutineReport"
                  exact
                  component={() => <RoutineIndex />}
                  role={Roles.REPORTS}
                />
                <SecureRoute
                  path="/StudyReports"
                  exact
                  component={() => <StudyReports />}
                  role={Roles.REPORTS}
                />
                <SecureRoute
                  path="/StudyReport"
                  exact
                  component={() => <StudyIndex />}
                  role={Roles.REPORTS}
                />
                <SecureRoute
                  path="/Report"
                  exact
                  component={() => <ReportIndex />}
                  role={Roles.REPORTS}
                />
                <SecureRoute
                  path="/AuditTrailReport"
                  exact
                  component={() => <AuditTrailReportIndex />}
                  role={AUDIT_TRAIL_ROUTE_ROLES}
                />
                <SecureRoute
                  path="/TATReport"
                  exact
                  component={() => <TATReport />}
                  role={Roles.REPORTS}
                />
                <SecureRoute
                  path="/validation"
                  exact
                  component={() => <StudyValidation />}
                  role={Roles.VALIDATION}
                />
                <SecureRoute
                  path="/ResultValidation"
                  exact
                  component={() => <StudyValidation />}
                  role={Roles.VALIDATION}
                />
                <SecureRoute
                  path="/AccessionValidation"
                  exact
                  component={() => <StudyValidation />}
                  role={Roles.VALIDATION}
                />
                <SecureRoute
                  path="/AccessionValidationRange"
                  exact
                  component={() => <StudyValidation />}
                  role={Roles.VALIDATION}
                />
                <SecureRoute
                  path="/ResultValidationByTestDate"
                  exact
                  component={() => <StudyValidation />}
                  role={Roles.VALIDATION}
                />
                <SecureRoute
                  path="/AnalyzerResults"
                  exact
                  component={() => (
                    <RouteErrorBoundary {...routeErrorAnalyzerResults}>
                      <Suspense fallback={<PageLoadingState />}>
                        <AnalyserResultIndex />
                      </Suspense>
                    </RouteErrorBoundary>
                  )}
                  role={Roles.ANALYSER_IMPORT}
                />
                <Route path="*" component={() => <RedirectOldUI />} />
              </Switch>
            </Layout>
          </Router>
        </>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  );
}
