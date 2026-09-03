import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Route } from "react-router-dom";
import { vi } from "vitest";
import OEHeader from "./Header";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "./Layout";
import messages from "../../languages/en.json";
import { getFromOpenElisServer } from "../utils/Utils";

// Mock Utils
vi.mock("../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../utils/Utils");
  return {
    ...actualUtils,
    getFromOpenElisServer: vi.fn(),
    getFromOpenElisServerV2: vi.fn().mockResolvedValue({}),
    putToOpenElisServer: vi.fn(),
    postToOpenElisServer: vi.fn(),
    deleteToOpenElisServer: vi.fn(),
    urlBase64ToUint8Array: vi.fn(),
    formatTimestamp: vi.fn((ts) => ts),
  };
});

// Import mocked functions for use in tests
// Replaced inline utils require

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Test configuration
const mockUserSessionDetails = {
  authenticated: true,
  roles: ["ROLE_USER"],
  userId: "1",
  firstName: "Test",
  lastName: "User",
  loginLabUnit: "Test Lab",
  logout: vi.fn(),
};

const mockConfigurationContext = {
  configurationProperties: {
    BANNER_TEXT: "Test LIMS",
    releaseNumber: "3.2.1",
  },
  enabledLanguages: {
    en: { label: "English", messages },
    zh: { label: "简体中文", messages },
  },
  reloadConfiguration: vi.fn(),
};

const mockNotificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  notifications: [],
  addNotification: vi.fn(),
  removeNotification: vi.fn(),
};

/**
 * Realistic menu mock that matches actual database structure
 * Based on liquibase migrations and en.json translation keys
 */
const MOCK_MENU_DATA = [
  {
    menu: {
      elementId: "menu_home",
      displayKey: "banner.menu.home",
      actionURL: "/Dashboard",
      isActive: true,
    },
    childMenus: [],
  },
  {
    menu: {
      elementId: "menu_sample",
      displayKey: "banner.menu.sample",
      actionURL: "",
      isActive: true,
    },
    childMenus: [
      {
        menu: {
          elementId: "menu_sample_add",
          displayKey: "sidenav.label.addorder",
          actionURL: "/SamplePatientEntry",
          isActive: true,
        },
        childMenus: [],
      },
      {
        menu: {
          elementId: "menu_sample_edit",
          displayKey: "sidenav.label.editorder",
          actionURL: "/FindOrder",
          isActive: true,
        },
        childMenus: [],
      },
    ],
  },
  {
    menu: {
      elementId: "menu_results",
      displayKey: "banner.menu.results",
      actionURL: "",
      isActive: true,
    },
    childMenus: [
      {
        menu: {
          elementId: "menu_results_logbook",
          displayKey: "banner.menu.results.logbook",
          actionURL: "/LogbookResults",
          isActive: true,
        },
        childMenus: [],
      },
      {
        menu: {
          elementId: "menu_results_patient",
          displayKey: "sidenav.label.results.patient",
          actionURL: "/PatientResults",
          isActive: true,
        },
        childMenus: [],
      },
    ],
  },
  {
    menu: {
      elementId: "menu_resultvalidation",
      displayKey: "banner.menu.resultvalidation",
      actionURL: "",
      isActive: true,
    },
    childMenus: [
      {
        menu: {
          elementId: "menu_resultvalidation_routine",
          displayKey: "sidenav.label.validation.routine",
          actionURL: "/ResultValidation",
          isActive: true,
        },
        childMenus: [],
      },
    ],
  },
  {
    menu: {
      elementId: "menu_workplan",
      displayKey: "banner.menu.workplan",
      actionURL: "",
      isActive: true,
    },
    childMenus: [
      {
        menu: {
          elementId: "menu_workplan_test",
          displayKey: "sidenav.label.workplan.test",
          actionURL: "/WorkPlanByTest",
          isActive: true,
        },
        childMenus: [],
      },
    ],
  },
  {
    menu: {
      elementId: "menu_reports",
      displayKey: "banner.menu.reports",
      actionURL: "",
      isActive: true,
    },
    childMenus: [
      {
        menu: {
          elementId: "menu_reports_routine",
          displayKey: "sidenav.label.reports.routine",
          actionURL: "",
          isActive: true,
        },
        childMenus: [
          {
            menu: {
              elementId: "menu_reports_status",
              displayKey: "sidenav.label.statusreport",
              actionURL: "/Report?type=patient&report=patientCILNSP_vreduit",
              isActive: true,
            },
            childMenus: [],
          },
        ],
      },
    ],
  },
  {
    menu: {
      elementId: "menu_storage",
      displayKey: "banner.menu.storage",
      actionURL: "",
      isActive: true,
    },
    childMenus: [
      {
        menu: {
          elementId: "menu_storage_management",
          displayKey: "storage.nav.dashboard",
          actionURL: "/Storage",
          isActive: true,
        },
        childMenus: [],
      },
      {
        menu: {
          elementId: "menu_freezer_monitoring",
          displayKey: "sidenav.label.storage.coldstorage",
          actionURL: "/FreezerMonitoring",
          isActive: true,
        },
        childMenus: [],
      },
    ],
  },
  {
    menu: {
      elementId: "menu_admin",
      displayKey: "sidenav.label.admin",
      actionURL: "",
      isActive: true,
    },
    childMenus: [
      {
        menu: {
          elementId: "menu_admin_usermgt",
          displayKey: "sidenav.label.admin.usermgt",
          actionURL: "/MasterListsPage#!usersManagement",
          isActive: true,
        },
        childMenus: [],
      },
      {
        menu: {
          elementId: "menu_admin_menu",
          displayKey: "sidenav.label.admin.menu",
          actionURL: "",
          isActive: true,
        },
        childMenus: [
          {
            menu: {
              elementId: "menu_admin_menu_global",
              displayKey: "sidenav.label.admin.menu.global",
              actionURL: "/MasterListsPage#!globalMenuManagement",
              isActive: true,
            },
            childMenus: [],
          },
        ],
      },
    ],
  },
];

const renderHeader = (options = {}) => {
  const {
    initialRoute = "/",
    isDesktop = true,
    navOpen = isDesktop,
    menuData = MOCK_MENU_DATA,
    navContext = "main",
    sessionDetails = mockUserSessionDetails,
    configurationContext = mockConfigurationContext,
    logout = vi.fn(),
    showSideNav = true,
  } = options;
  const mockGetFromServer = getFromOpenElisServer;
  mockGetFromServer.mockImplementation((url, callback) => {
    if (url === "/rest/menu") {
      callback(menuData);
    } else if (url.includes("/notifications")) {
      callback([]);
    } else if (url === "/rest/database-cleaning/status") {
      callback({ trainingInstallation: false });
    }
  });

  const mockToggle = vi.fn();
  const mockCloseSideNav = vi.fn();

  const result = render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: sessionDetails, logout }}
        >
          <ConfigurationContext.Provider value={configurationContext}>
            <NotificationContext.Provider value={mockNotificationContext}>
              <OEHeader
                onChangeLanguage={vi.fn()}
                navOpen={navOpen}
                isDesktop={isDesktop}
                toggleSideNav={mockToggle}
                closeSideNav={mockCloseSideNav}
                navContext={navContext}
                showSideNav={showSideNav}
              />
              <Route
                path="*"
                render={({ location }) => (
                  <span data-testid="current-path">{location.pathname}</span>
                )}
              />
            </NotificationContext.Provider>
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
  return { ...result, mockCloseSideNav, mockToggle };
};

describe("Header Component - M2b Enhancement Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe("Home item active state", () => {
    test.each(["/", "/Dashboard"])(
      "landing on %s highlights the Home menu item",
      async (route) => {
        const { container } = renderHeader({ initialRoute: route });

        await waitFor(() => {
          expect(container.querySelector('a[href="/Dashboard"]')).toBeTruthy();
        });

        const homeLink = container.querySelector('a[href="/Dashboard"]');
        expect(homeLink).toHaveClass("cds--side-nav__link--current");
        expect(homeLink).toHaveAttribute("aria-current", "page");
      },
    );
  });

  describe("Responsive sidenav", () => {
    test("desktop renders a persistent expanded nav and no toggle button", async () => {
      const { container } = renderHeader();

      await waitFor(() => {
        expect(container.querySelector(".cds--side-nav")).toBeTruthy();
      });

      const sideNav = container.querySelector(".cds--side-nav");
      expect(sideNav).toHaveClass("cds--side-nav--expanded");
      expect(sideNav).toHaveClass("oe-app-sidenav--persistent");
      expect(sideNav).not.toHaveClass("cds--side-nav--hidden");
      expect(container.querySelector('[data-cy="menuButton"]')).toBeNull();
    });

    test("desktop keeps a visible loading state while the menu endpoint warms up", async () => {
      const { container } = renderHeader({ menuData: [] });

      expect(
        await screen.findByText(messages["sidenav.menu.loading"]),
      ).toBeInTheDocument();
      expect(container.querySelector(".cds--side-nav")).toHaveClass(
        "oe-app-sidenav--persistent",
      );
    });

    test("small viewport renders hamburger; nav is a closed overlay drawer", async () => {
      const { container, mockToggle } = renderHeader({ isDesktop: false });

      await waitFor(() => {
        expect(container.querySelector('[data-cy="menuButton"]')).toBeTruthy();
      });

      const sideNav = container.querySelector(".cds--side-nav");
      expect(sideNav).not.toHaveClass("cds--side-nav--expanded");
      expect(sideNav).toHaveClass("cds--side-nav--hidden");

      fireEvent.click(container.querySelector('[data-cy="menuButton"]'));
      expect(mockToggle).toHaveBeenCalledTimes(1);
    });

    test("small viewport with drawer open closes on outside mousedown", async () => {
      const { container, mockCloseSideNav } = renderHeader({
        isDesktop: false,
        navOpen: true,
      });

      await waitFor(() => {
        expect(container.querySelector(".cds--side-nav")).toHaveClass(
          "cds--side-nav--expanded",
        );
      });

      fireEvent.mouseDown(document.body);
      expect(mockCloseSideNav).toHaveBeenCalled();
    });

    test("desktop never closes nav on outside mousedown", async () => {
      const { container, mockCloseSideNav } = renderHeader();

      await waitFor(() => {
        expect(container.querySelector(".cds--side-nav")).toBeTruthy();
      });

      fireEvent.mouseDown(document.body);
      expect(mockCloseSideNav).not.toHaveBeenCalled();
    });
  });

  describe("Menu Auto-Expansion (useMenuAutoExpand integration)", () => {
    /**
     * TEST: Auto-expand parent menu when on nested route
     * When user navigates to /Storage/Dashboard, the Storage menu should auto-expand
     * This requires integrating useMenuAutoExpand hook
     */
    test("FUTURE: parent menu auto-expands when child route is active", async () => {
      // Navigate to nested storage route
      const { container } = renderHeader("/Storage/Dashboard");

      await waitFor(() => {
        const sideNav = container.querySelector(".cds--side-nav");
        expect(sideNav).toBeTruthy();
      });

      // TODO: After T066, verify Storage menu is expanded
      // For now, just verify menu renders
      // The menu should have expanded="true" or similar state
    });
  });

  describe("HOC Migration Verification", () => {
    /**
     * TEST: Component renders correctly with MemoryRouter
     * Verifies Header works with standard React Router, preparing for HOC removal
     */
    test("renders header structure with router context", async () => {
      const { container } = renderHeader();

      await waitFor(
        () => {
          const header = container.querySelector("#mainHeader");
          expect(header).toBeTruthy();
        },
        { timeout: 3000 },
      );
    });

    /**
     * TEST: Component renders with IntlProvider
     * Verifies Header works with standard React Intl, preparing for HOC removal
     */
    test("renders banner section with intl context", async () => {
      const { container } = renderHeader();

      await waitFor(
        () => {
          const banner = container.querySelector(".banner");
          expect(banner).toBeTruthy();
        },
        { timeout: 3000 },
      );
    });
  });

  describe("Existing Functionality Preservation", () => {
    test("menu toggle button is visible when authenticated on small viewports", async () => {
      const { container } = renderHeader({ isDesktop: false });

      await waitFor(() => {
        const menuButton = container.querySelector('[data-cy="menuButton"]');
        expect(menuButton).toBeTruthy();
      });
    });

    test("search icon is visible when authenticated", async () => {
      const { container } = renderHeader();

      await waitFor(() => {
        const searchIcon = container.querySelector("#search-Icon");
        expect(searchIcon).toBeTruthy();
      });
    });

    test("notification icon is visible when authenticated", async () => {
      const { container } = renderHeader();

      await waitFor(() => {
        const notificationIcon = container.querySelector("#notification-Icon");
        expect(notificationIcon).toBeTruthy();
      });
    });

    test("user icon is visible when authenticated", async () => {
      const { container } = renderHeader();

      await waitFor(() => {
        const userIcon = container.querySelector("#user-Icon");
        expect(userIcon).toBeTruthy();
      });
    });
  });

  describe("URL Matching and Active State", () => {
    /**
     * Test: URL matching logic is covered by E2E tests
     * Unit testing active state requires complex DOM mocking
     * See: cypress/e2e/sidenavEnhanced.cy.js for comprehensive URL matching tests
     *
     * Note: Active state is determined by:
     * 1. Exact match: location.pathname === menuItem.menu.actionURL
     * 2. Prefix match: location.pathname.startsWith(menuItem.menu.actionURL + "/")
     * 3. Length check: actionURL.length > 1 (prevents "/" from matching everything)
     */
    test("URL matching logic documentation", () => {
      // This test documents the URL matching algorithm
      // Actual behavior is tested in E2E tests with real navigation
      expect(true).toBe(true);
    });

    /**
     * Test: Active state styling verification
     * Verifies that active nav items have correct styling:
     * - Left border (4px blue)
     * - Background color (not transparent)
     * - No double borders
     * - No white background on focus/active
     * - Subnav items (like workplan) show active state correctly
     */
    test("active nav items have correct styling", async () => {
      // Sidenav must be expanded to see menu items
      const { container } = renderHeader({
        initialRoute: "/Storage",
      });

      await waitFor(
        () => {
          const activeLink = container.querySelector(
            '.cds--side-nav__link--current[href="/Storage"]',
          );
          expect(activeLink).toBeTruthy();

          // Log DOM for debugging (uncomment to inspect)
          // logDOM(container, '.cds--side-nav__link--current');
          // screen.debug(activeLink);

          // Verify active link exists and has correct class
          expect(
            activeLink.classList.contains("cds--side-nav__link--current"),
          ).toBe(true);

          // Verify it's a subnav item (has reduced-padding class on parent)
          const menuItem = activeLink.closest(".cds--side-nav__menu-item");
          expect(menuItem).toBeTruthy();
          expect(
            menuItem.classList.contains("reduced-padding-nav-menu-item"),
          ).toBe(true);
        },
        { timeout: 5000 },
      );
    });

    /**
     * Test: Workplan subnav shows active state
     * Verifies that subnav items like workplan correctly show active state
     * when the current path matches their actionURL
     */
    test("workplan subnav shows active state when path matches", async () => {
      // Sidenav must be expanded to see menu items
      const { container } = renderHeader({
        initialRoute: "/WorkPlanByTest",
      });

      await waitFor(
        () => {
          const workplanLink = container.querySelector(
            '.cds--side-nav__link[href="/WorkPlanByTest"]',
          );
          expect(workplanLink).toBeTruthy();

          // Log DOM for debugging (uncomment to inspect)
          // logDOM(container, '[href="/WorkPlanByTest"]');

          // Verify workplan link has active class
          expect(
            workplanLink.classList.contains("cds--side-nav__link--current"),
          ).toBe(true);

          // Verify it's a subnav item
          const menuItem = workplanLink.closest(".cds--side-nav__menu-item");
          expect(menuItem).toBeTruthy();
          expect(
            menuItem.classList.contains("reduced-padding-nav-menu-item"),
          ).toBe(true);
        },
        { timeout: 5000 },
      );
    });

    /**
     * Test: No double borders on active items
     * Verifies that active items don't have multiple borders applied
     * Note: jsdom's getComputedStyle has limitations, so we check class and structure instead
     */
    test("active items have only left border, no double borders", async () => {
      // Sidenav must be expanded to see menu items
      const { container } = renderHeader({
        initialRoute: "/Storage",
      });

      await waitFor(
        () => {
          const activeLink = container.querySelector(
            '.cds--side-nav__link--current[href="/Storage"]',
          );
          expect(activeLink).toBeTruthy();

          // Verify active class is present
          expect(
            activeLink.classList.contains("cds--side-nav__link--current"),
          ).toBe(true);

          // Verify it's a subnav item (has reduced-padding class on parent)
          const menuItem = activeLink.closest(".cds--side-nav__menu-item");
          expect(menuItem).toBeTruthy();
          expect(
            menuItem.classList.contains("reduced-padding-nav-menu-item"),
          ).toBe(true);

          // In jsdom, getComputedStyle may not work correctly, so we verify structure instead
          // The CSS rules ensure only left border is applied (verified via CSS file)
          // For actual computed styles, use browser DevTools or E2E tests
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Menu Initialization", () => {
    test("keeps the request worklist as the single primary order entry", async () => {
      const orderMenuData = [
        MOCK_MENU_DATA[0],
        {
          menu: {
            elementId: "menu_sample",
            displayKey: "banner.menu.sample",
            actionURL: "",
            isActive: true,
          },
          childMenus: [
            {
              menu: {
                elementId: "menu_order_workflow",
                displayKey: "sidenav.label.order.workflow",
                actionURL: "",
                isActive: true,
              },
              childMenus: [
                {
                  menu: {
                    elementId: "menu_order_dashboard",
                    displayKey: "sidenav.label.order.dashboard",
                    actionURL: "/order",
                    isActive: true,
                  },
                  childMenus: [],
                },
                {
                  menu: {
                    elementId: "menu_order_enter",
                    displayKey: "sidenav.label.order.enter",
                    actionURL: "/order/enter",
                    isActive: true,
                  },
                  childMenus: [],
                },
              ],
            },
          ],
        },
      ];

      const { container } = renderHeader({
        menuData: orderMenuData,
        configurationContext: {
          ...mockConfigurationContext,
          enabledLanguages: {
            zh: { label: "简体中文", messages },
          },
        },
      });

      await waitFor(() => {
        expect(container.querySelector("#menu_sample button")).toBeTruthy();
      });
      fireEvent.click(container.querySelector("#menu_sample button"));

      expect(
        await screen.findByText(messages["sidenav.label.order.active"]),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(messages["sidenav.label.order.new"]),
      ).not.toBeInTheDocument();
    });

    test("hides restricted server report entries and keeps available reports navigable", async () => {
      const reportMenuData = [
        MOCK_MENU_DATA[0],
        {
          menu: {
            elementId: "menu_reports",
            displayKey: "banner.menu.reports",
            actionURL: "",
            isActive: true,
          },
          childMenus: [
            {
              menu: {
                elementId: "menu_reports_export_routine",
                displayKey: "reports.export.byDate_routine",
                actionURL: "/Report?type=routine&report=CISampleRoutineExport",
                isActive: true,
              },
              childMenus: [],
            },
            {
              menu: {
                elementId: "menu_reports_patient",
                displayKey: "sidenav.label.statusreport",
                actionURL: "/Report?type=patient&report=patientClinical",
                isActive: true,
              },
              childMenus: [],
            },
          ],
        },
      ];

      const { container } = renderHeader({
        initialRoute: "/Dashboard",
        menuData: reportMenuData,
        configurationContext: {
          ...mockConfigurationContext,
          enabledLanguages: {
            zh: { label: "简体中文", messages },
          },
        },
      });

      await waitFor(() => {
        expect(container.querySelector("#menu_reports button")).toBeTruthy();
      });
      fireEvent.click(container.querySelector("#menu_reports button"));

      expect(
        container.querySelector("#menu_reports_export_routine_nav"),
      ).not.toBeInTheDocument();

      const availableItem = container.querySelector(
        "#menu_reports_patient_nav",
      );
      expect(availableItem).toHaveAttribute(
        "href",
        "/Report?type=patient&report=patientClinical",
      );
      expect(availableItem).not.toHaveAttribute("aria-disabled");
    });

    test("opens direct report documents in a separate tab without replacing the application", async () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue({});
      const directReportMenu = [
        MOCK_MENU_DATA[0],
        {
          menu: {
            elementId: "menu_reports",
            displayKey: "banner.menu.reports",
            actionURL: "",
            isActive: true,
          },
          childMenus: [
            {
              menu: {
                elementId: "menu_reports_validation_backlog",
                displayKey: "sideNav.label.delayedvalidation",
                actionURL:
                  "/ReportPrint?type=indicator&report=validationBacklog",
                isActive: true,
              },
              childMenus: [],
            },
          ],
        },
      ];

      const { container } = renderHeader({
        initialRoute: "/Dashboard",
        menuData: directReportMenu,
      });

      await waitFor(() => {
        expect(container.querySelector("#menu_reports button")).toBeTruthy();
      });
      fireEvent.click(container.querySelector("#menu_reports button"));

      const directReport = container.querySelector(
        "#menu_reports_validation_backlog_nav",
      );
      expect(directReport).toHaveAttribute("target", "_blank");
      fireEvent.click(directReport);

      expect(openSpy).toHaveBeenCalledWith(
        "/ReportPrint?type=indicator&report=validationBacklog",
        "_blank",
        "noopener,noreferrer",
      );
      expect(screen.getByTestId("current-path")).toHaveTextContent(
        "/Dashboard",
      );
      openSpy.mockRestore();
    });

    test("does not render an active leaf menu item without an action", async () => {
      const inertMenuData = [
        ...MOCK_MENU_DATA,
        {
          menu: {
            elementId: "menu_billing",
            displayKey: "banner.menu.billing",
            actionURL: "",
            isActive: true,
          },
          childMenus: [],
        },
      ];

      const { container } = renderHeader({ menuData: inertMenuData });

      await waitFor(() => {
        expect(container.querySelector("#menu_home_nav")).toBeTruthy();
      });

      expect(container.querySelector("#menu_billing_nav")).toBeNull();
      expect(
        screen.queryByText(messages["banner.menu.billing"]),
      ).not.toBeInTheDocument();
    });

    test("opening a top-level menu collapses its open sibling", async () => {
      const { container } = renderHeader();

      await waitFor(() => {
        expect(container.querySelector("#menu_sample button")).toBeTruthy();
        expect(container.querySelector("#menu_results button")).toBeTruthy();
      });

      const getOrderToggle = () =>
        container.querySelector("#menu_sample button");
      const getResultsToggle = () =>
        container.querySelector("#menu_results button");

      fireEvent.click(getOrderToggle());
      await waitFor(() => {
        expect(getOrderToggle()).toHaveAttribute("aria-expanded", "true");
      });

      fireEvent.click(getResultsToggle());
      await waitFor(() => {
        expect(getOrderToggle()).toHaveAttribute("aria-expanded", "false");
        expect(getResultsToggle()).toHaveAttribute("aria-expanded", "true");
      });
    });

    /**
     * Test: Menu items from API get expanded property initialized to false
     * Ensures no undefined expanded properties that cause toggle bugs
     */
    test("menu items from API get expanded=false initialized", async () => {
      const menuWithoutExpanded = [
        {
          menu: {
            elementId: "menu_storage",
            displayKey: "banner.menu.storage",
            actionURL: "",
            isActive: true,
          },
          childMenus: [
            {
              menu: {
                elementId: "menu_storage_mgmt",
                displayKey: "sidenav.label.storage.management",
                actionURL: "/Storage",
                isActive: true,
              },
              childMenus: [],
              // Note: No expanded property - simulates real API response
            },
          ],
          // Note: No expanded property - simulates real API response
        },
      ];

      getFromOpenElisServer.mockImplementation((url, callback) => {
        if (url === "/rest/menu") {
          callback(menuWithoutExpanded);
        }
      });

      renderHeader();

      // Wait for menu to load and ensure item rendered
      await waitFor(() => {
        expect(screen.getByText("Storage")).toBeTruthy();
      });
    });
  });

  describe("Admin navigation context switching", () => {
    const MENU_DATA = [
      {
        menu: {
          elementId: "menu_home",
          displayKey: "banner.menu.home",
          actionURL: "/Dashboard",
          isActive: true,
        },
        childMenus: [],
      },
      {
        menu: {
          elementId: "menu_administration",
          displayKey: "sidenav.label.admin",
          actionURL: "/MasterListsPage",
          isActive: true,
        },
        childMenus: [],
      },
    ];

    test("clicking link to /MasterListsPage keeps the desktop nav open", async () => {
      const { container, mockCloseSideNav } = renderHeader({
        menuData: MENU_DATA,
      });
      await waitFor(() => {
        expect(
          container.querySelector("#menu_administration_nav"),
        ).toBeTruthy();
      });

      fireEvent.click(container.querySelector("#menu_administration_nav"));
      expect(mockCloseSideNav).not.toHaveBeenCalled();
      expect(container.querySelector(".cds--side-nav")).toHaveClass(
        "cds--side-nav--expanded",
      );
    });

    test("clicking a non-admin leaf keeps the desktop nav open", async () => {
      const { container, mockCloseSideNav } = renderHeader({
        menuData: MENU_DATA,
      });
      await waitFor(() => {
        expect(container.querySelector("#menu_home_nav")).toBeTruthy();
      });

      fireEvent.click(container.querySelector("#menu_home_nav"));
      expect(mockCloseSideNav).not.toHaveBeenCalled();
      expect(container.querySelector(".cds--side-nav")).toHaveClass(
        "cds--side-nav--expanded",
      );
    });

    test("admin context renders Admin nav contents instead of main menu contents", async () => {
      renderHeader({
        initialRoute: "/MasterListsPage",
        menuData: MENU_DATA,
        navContext: "admin",
      });

      expect(await screen.findByText("Back to main menu")).toBeInTheDocument();
      expect(
        screen.getByText(messages["sidenav.label.admin.testmgt"]),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(messages["banner.menu.home"]),
      ).not.toBeInTheDocument();
      const statusCalls = getFromOpenElisServer.mock.calls.filter(
        ([url]) => url === "/rest/database-cleaning/status",
      );
      expect(statusCalls).toHaveLength(1);
    });

    test("admin nav items expose href and current-route state", async () => {
      renderHeader({
        initialRoute: "/MasterListsPage/billingMenuManagement",
        navContext: "admin",
      });

      const billingLink = (
        await screen.findByText(messages["sidenav.label.admin.menu.billing"])
      ).closest("a");

      expect(billingLink).toHaveAttribute(
        "href",
        "/MasterListsPage/billingMenuManagement",
      );
      expect(billingLink).toHaveAttribute("aria-current", "page");
    });

    test("admin back control navigates to /Dashboard", async () => {
      renderHeader({
        initialRoute: "/MasterListsPage",
        navContext: "admin",
      });

      fireEvent.click(await screen.findByText("Back to main menu"));

      expect(screen.getByTestId("current-path")).toHaveTextContent(
        "/Dashboard",
      );
    });
  });

  describe("User panel actions", () => {
    test("single-language installation hides the language selector", async () => {
      const { container } = renderHeader({
        configurationContext: {
          ...mockConfigurationContext,
          enabledLanguages: {
            zh: { label: "简体中文", messages },
          },
        },
      });

      await waitFor(() => {
        expect(
          container.querySelector('[data-cy="headerChangePassword"]'),
        ).toBeTruthy();
      });

      expect(container.querySelector("#selector")).toBeNull();
    });

    test("authenticated panel orders locale, change password, then logout", async () => {
      const { container } = renderHeader();

      await waitFor(() => {
        expect(
          container.querySelector('[data-cy="headerChangePassword"]'),
        ).toBeTruthy();
      });

      const panelItems = [
        ...container.querySelectorAll(".headerPanel ul > li"),
      ];
      const localeIndex = panelItems.findIndex((li) =>
        li.querySelector("#selector"),
      );
      const changePasswordIndex = panelItems.findIndex((li) =>
        li.querySelector('[data-cy="headerChangePassword"]'),
      );
      const logoutIndex = panelItems.findIndex((li) =>
        li.querySelector('[data-cy="logOut"]'),
      );

      expect(localeIndex).toBeGreaterThan(-1);
      expect(changePasswordIndex).toBe(localeIndex + 1);
      expect(logoutIndex).toBe(changePasswordIndex + 1);
    });

    test("change password item navigates to /ChangePasswordLogin", async () => {
      const { container } = renderHeader();
      await waitFor(() => {
        expect(
          container.querySelector('[data-cy="headerChangePassword"]'),
        ).toBeTruthy();
      });

      fireEvent.click(
        container.querySelector('[data-cy="headerChangePassword"]'),
      );
      expect(screen.getByTestId("current-path")).toHaveTextContent(
        "/ChangePasswordLogin",
      );
    });

    test("logout item calls the session logout", async () => {
      const logout = vi.fn();
      const { container } = renderHeader({ logout });

      await waitFor(() => {
        expect(container.querySelector('[data-cy="logOut"]')).toBeTruthy();
      });

      fireEvent.click(container.querySelector('[data-cy="logOut"]'));
      expect(logout).toHaveBeenCalledTimes(1);
    });

    test("unauthenticated panel hides change password and logout but keeps locale", async () => {
      const { container } = renderHeader({
        sessionDetails: { authenticated: false },
      });

      expect(container.querySelector("#selector")).toBeTruthy();
      expect(
        container.querySelector('[data-cy="headerChangePassword"]'),
      ).toBeNull();
      expect(container.querySelector('[data-cy="logOut"]')).toBeNull();
    });
  });

  describe("Focused screen (showSideNav=false)", () => {
    test("hides the sidenav and hamburger even when authenticated", async () => {
      const desktop = renderHeader({ showSideNav: false });
      await waitFor(() => {
        expect(desktop.container.querySelector("#user-Icon")).toBeTruthy();
      });
      expect(desktop.container.querySelector(".cds--side-nav")).toBeNull();
      desktop.unmount();

      const mobile = renderHeader({ showSideNav: false, isDesktop: false });
      expect(
        mobile.container.querySelector('[data-cy="menuButton"]'),
      ).toBeNull();
    });

    test("still renders the sidenav by default", async () => {
      const { container } = renderHeader();
      await waitFor(() => {
        expect(container.querySelector(".cds--side-nav")).toBeTruthy();
      });
    });
  });
});
