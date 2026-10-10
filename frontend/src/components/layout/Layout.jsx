import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
import { useLocation } from "react-router-dom";
import { useIntl } from "react-intl";
import Header from "./Header";
import Footer from "./Footer";
import { Button, Content, InlineNotification, Theme } from "@carbon/react";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { getFromOpenElisServer } from "../utils/Utils";
import { defaultLanguages, buildLanguagesFromConfig } from "../../languages";
import RouteErrorBoundary from "../common/RouteErrorBoundary";
import config from "../../config.json";
import { resolveNavigationProfile } from "./navigationProfile";
import { navigationMenuOwner } from "./navigationMenuAvailability";

/**
 * @typedef {Object} LayoutConfigurationValue
 * @property {Record<string, string | null>} configurationProperties
 * @property {() => void} reloadConfiguration
 * @property {Array<object> | null} navigationMenuItems
 * @property {import("react").Dispatch<import("react").SetStateAction<{owner: string | null, items: Array<object> | null}>>} publishNavigationMenu
 * @property {Array<{localeCode: string, displayName: string, fallback?: boolean}>} supportedLocales
 * @property {ReturnType<typeof buildLanguagesFromConfig>} enabledLanguages
 *
 * @typedef {Object} LayoutNotificationBody
 * @property {string} kind
 * @property {import("react").ReactNode} title
 * @property {import("react").ReactNode} message
 * @property {import("react").ReactNode} [subtitle]
 *
 * @typedef {Object} LayoutNotificationValue
 * @property {boolean} notificationVisible
 * @property {import("react").Dispatch<import("react").SetStateAction<boolean>>} setNotificationVisible
 * @property {LayoutNotificationBody[]} notifications
 * @property {(body: LayoutNotificationBody) => void} addNotification
 * @property {(index: number) => void} removeNotification
 */
export const ConfigurationContext = createContext(
  /** @type {LayoutConfigurationValue | null} */ (null),
);
export const NotificationContext = createContext(
  /** @type {LayoutNotificationValue | null} */ (null),
);

const getPageFamily = (pathname) => {
  const path = pathname.toLowerCase();

  if (path === "/login" || path === "/changepasswordlogin") return "auth";
  if (path === "/" || path === "/dashboard") return "dashboard";
  if (path.startsWith("/order") || path.includes("order")) return "orders";
  if (path.includes("patient")) return "patients";
  if (path.includes("result")) return "results";
  if (path.includes("validation")) return "validation";
  if (path.includes("report")) return "reports";
  if (path.startsWith("/admin") || path.startsWith("/masterlist")) {
    return "administration";
  }
  if (path.startsWith("/storage") || path.includes("freezermonitoring")) {
    return "storage";
  }
  if (path.startsWith("/analyzers") || path.includes("analyzer")) {
    return "analyzers";
  }
  return "workspace";
};

// Persisted test and sample-type editors use the side navigation as an in-task
// section index. Create routes keep the primary menu so the user's workspace
// does not change before an object exists.
export const isAdminEditorRoute = (pathname) =>
  /^\/(?:admin|MasterListsPage)\/(?:TestCatalogEditor\/(?!new(?:[/?#]|$))|SampleTypeManagement\/(?!new(?:[/?#]|$))[^/?#]+)/.test(
    pathname,
  );

// Must match the .content-nav-locked media query in Style.css
const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

// User preference: whether the desktop sidenav is pinned open (pushing
// content) or collapsed into an on-demand overlay drawer.
const NAV_PINNED_STORAGE_KEY = "sideNavPinned";

const readNavPinnedPreference = () => {
  try {
    return localStorage.getItem(NAV_PINNED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
};

/**
 * True when the viewport is desktop-sized.
 * On desktop the sidenav is always rendered; below it collapses into a
 * hamburger-opened overlay drawer.
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handler = (e) => setIsDesktop(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

export default function Layout(props) {
  const { children } = props;
  const location = useLocation();
  const intl = useIntl();
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const [resetConfig, setResetConfig] = useState(false);
  const menuOwner = navigationMenuOwner(userSessionDetails);
  const [navigationSnapshot, publishNavigationMenu] = useState(
    /** @type {{owner: string | null, items: Array<object> | null}} */ ({
      owner: null,
      items: null,
    }),
  );
  const navigationMenuItems =
    menuOwner && navigationSnapshot.owner === menuOwner
      ? navigationSnapshot.items
      : null;
  const configurationAuthenticated = userSessionDetails.authenticated === true;
  // Public configuration has no anonymous-session scope. Resolving or rotating
  // an anonymous session must not remove an already displayed login form.
  const configurationOwner = configurationAuthenticated
    ? JSON.stringify([
        true,
        userSessionDetails.userId ?? null,
        userSessionDetails.sessionId ?? null,
        userSessionDetails.loginLabUnit ?? null,
        userSessionDetails.roles ?? [],
        userSessionDetails.userLabRolesMap ?? {},
      ])
    : "public";
  const configurationOwnerRef = useRef(configurationOwner);
  configurationOwnerRef.current = configurationOwner;
  const configurationRead = useRef(null);
  const configurationActive = useRef(true);
  const [configurationSnapshot, setConfigurationSnapshot] = useState({
    owner: configurationOwner,
    value: {},
    failed: false,
  });
  const configurationProperties =
    configurationSnapshot.owner === configurationOwner
      ? configurationSnapshot.value
      : {};
  const configurationFailed =
    configurationSnapshot.owner === configurationOwner &&
    configurationSnapshot.failed;
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [supportedLocales, setSupportedLocales] = useState([]);
  const [enabledLanguages, setEnabledLanguages] = useState(defaultLanguages);

  // Determine layout config from props or route-based fallbacks
  const isStorageContext =
    location.pathname.startsWith("/Storage") ||
    location.pathname.startsWith("/FreezerMonitoring");

  const isAnalyzerContext =
    location.pathname.startsWith("/analyzers") ||
    location.pathname.startsWith("/AnalyzerManagement");
  const navContext = isAdminEditorRoute(location.pathname) ? "admin" : "main";
  const pageFamily = getPageFamily(location.pathname);

  // Used by Header to persist per-context menu expansion state
  const storageKeyPrefix =
    navContext === "admin"
      ? "admin-editor"
      : isStorageContext
        ? "storage"
        : isAnalyzerContext
          ? "analyzer"
          : "main";

  // Nav on desktop: pinned (default) renders it persistently and pushes
  // content; unpinned turns it into the same hamburger-opened overlay drawer
  // used below the breakpoint, closed on navigation.
  const isDesktop = useIsDesktop();
  const [navPinned, setNavPinned] = useState(readNavPinnedPreference);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navPersistent = isDesktop && navPinned;
  const navOpen = navPersistent || drawerOpen;

  const closeSideNav = useCallback(() => setDrawerOpen(false), []);

  const toggleNavPinned = useCallback(() => {
    setNavPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_PINNED_STORAGE_KEY, String(next));
      } catch {
        // preference simply won't survive a reload
      }
      return next;
    });
    // Unpinning keeps the nav visible as a drawer (instead of vanishing
    // mid-interaction); pinning hands visibility back to the persistent nav.
    setDrawerOpen(navPinned);
  }, [navPinned]);

  useEffect(() => {
    closeSideNav();
  }, [location.pathname, closeSideNav]);

  // Credential-change screens are login-adjacent and render focused (no sidenav),
  // matching /login regardless of auth state.
  const isFocusedAuthRoute = location.pathname === "/ChangePasswordLogin";
  // Landing pages use the primary task navigation. Configuration detail pages
  // switch to the contextual admin navigation for their active domain.
  const showAppSideNav = !isFocusedAuthRoute;

  // Only push content when the persistent sidenav is actually present
  // (authenticated desktop UX with the nav pinned). Unauthenticated pages
  // like /login have no sidenav to make room for.
  const isLocked =
    userSessionDetails.authenticated && navPersistent && showAppSideNav;

  const addNotification = (notificationBody) => {
    setNotifications([...notifications, notificationBody]);
  };

  const removeNotification = (index) => {
    const newNotifications = [...notifications];
    newNotifications.splice(index, 1);
    setNotifications(newNotifications);
  };

  const loadConfigurationProperties = useCallback(
    (afterLoad) => {
      if (!configurationActive.current) return;
      configurationRead.current?.abort();
      const controller = new AbortController();
      configurationRead.current = controller;
      getFromOpenElisServer(
        configurationAuthenticated
          ? "/rest/configuration-properties"
          : "/rest/open-configuration-properties",
        (res) => {
          if (
            controller.signal.aborted ||
            configurationRead.current !== controller ||
            configurationOwnerRef.current !== configurationOwner
          )
            return;
          setConfigurationSnapshot((previous) => ({
            owner: configurationOwner,
            value:
              res ??
              (previous.owner === configurationOwner ? previous.value : {}),
            failed: res === undefined,
          }));
          if (afterLoad) afterLoad();
        },
        controller.signal,
      );
    },
    [configurationOwner, configurationAuthenticated],
  );

  useEffect(() => {
    configurationActive.current = true;
    const hide = () => {
      configurationActive.current = false;
      configurationRead.current?.abort();
    };
    const resume = (event) => {
      if (!event.persisted) return;
      configurationActive.current = true;
      loadConfigurationProperties();
    };
    loadConfigurationProperties();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    return () => {
      hide();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
    };
  }, [loadConfigurationProperties]);

  useEffect(() => {
    if (!resetConfig) return;
    setResetConfig(false);
    loadConfigurationProperties();
  }, [loadConfigurationProperties, resetConfig]);

  useEffect(() => {
    let controller;
    let active = true;
    const loadLocales = () => {
      if (!active) return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      getFromOpenElisServer(
        "/rest/supportedlocales/active",
        (response) => {
          if (
            !active ||
            current.signal.aborted ||
            controller !== current ||
            configurationOwnerRef.current !== configurationOwner
          )
            return;
          if (response && Array.isArray(response)) {
            setSupportedLocales(response);
            setEnabledLanguages(buildLanguagesFromConfig(response));
          }
        },
        current.signal,
      );
    };
    const hide = () => {
      active = false;
      controller?.abort();
    };
    const resume = (event) => {
      if (event.persisted) {
        active = true;
        loadLocales();
      }
    };
    loadLocales();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    return () => {
      hide();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
    };
  }, [configurationOwner]);

  useEffect(() => {
    const activeLocaleCodes = Object.keys(enabledLanguages);
    if (
      activeLocaleCodes.length === 1 &&
      activeLocaleCodes[0] !== intl.locale
    ) {
      props.onChangeLanguage?.(activeLocaleCodes[0]);
    }
  }, [enabledLanguages, intl.locale, props.onChangeLanguage]);

  return (
    <ConfigurationContext.Provider
      value={{
        configurationProperties: configurationProperties,
        navigationMenuItems,
        publishNavigationMenu,
        reloadConfiguration: () => {
          setResetConfig(true);
        },
        supportedLocales: supportedLocales,
        enabledLanguages: enabledLanguages,
      }}
    >
      <NotificationContext.Provider
        value={{
          notificationVisible,
          setNotificationVisible,
          notifications,
          addNotification,
          removeNotification,
        }}
      >
        <div
          className={`oe-app-shell d-flex flex-column min-vh-100 ${
            userSessionDetails.authenticated
              ? "oe-app-shell--authenticated"
              : "oe-app-shell--public"
          }`}
          data-page-family={pageFamily}
          data-navigation-profile={resolveNavigationProfile(
            configurationProperties?.NAVIGATION_PROFILE,
            config.navigationProfile,
          )}
        >
          <a className="oe-skip-link" href="#main-content">
            {intl.formatMessage({ id: "accessibility.skip.to.content" })}
          </a>
          <Header
            onChangeLanguage={props.onChangeLanguage}
            navOpen={navOpen}
            isDesktop={isDesktop}
            navPinned={navPinned}
            navPersistent={navPersistent}
            toggleNavPinned={toggleNavPinned}
            toggleSideNav={() => setDrawerOpen((open) => !open)}
            closeSideNav={closeSideNav}
            storageKeyPrefix={storageKeyPrefix}
            navContext={navContext}
            showSideNav={showAppSideNav}
          />
          {userSessionDetails.authenticated &&
            drawerOpen &&
            !navPersistent &&
            showAppSideNav && (
              <button
                type="button"
                className="oe-nav-scrim"
                aria-label={intl.formatMessage({
                  id: "header.icon.menu.close",
                })}
                onClick={closeSideNav}
              />
            )}
          {/* Theme wrapper creates white theme zone for content area */}
          {/* Global SCSS theme = blue header/nav, this = light content */}
          <Theme theme="white">
            <Content
              id="main-content"
              tabIndex={-1}
              data-testid="content-wrapper"
              data-page-family={pageFamily}
              className={`oe-main-content ${isLocked ? "content-nav-locked" : ""}`.trim()}
            >
              {configurationFailed && (
                <>
                  <InlineNotification
                    kind="error"
                    lowContrast
                    hideCloseButton
                    title={intl.formatMessage({
                      id: "app.session.error.title",
                    })}
                    subtitle={intl.formatMessage({
                      id: "app.session.error.message",
                    })}
                  />
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => loadConfigurationProperties()}
                  >
                    {intl.formatMessage({ id: "button.retry" })}
                  </Button>
                </>
              )}
              <RouteErrorBoundary>{children}</RouteErrorBoundary>
            </Content>
          </Theme>
          <Footer />
        </div>
      </NotificationContext.Provider>
    </ConfigurationContext.Provider>
  );
}
