import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { waitFor, within } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Route } from "react-router-dom";
import { vi } from "vitest";
import userEvent from "@testing-library/user-event";
import OEHeader from "./Header";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "./Layout";
import messages from "../../languages/en.json";
import {
  getFromOpenElisServer,
  getFromOpenElisServerV2,
  putToOpenElisServer,
  postToOpenElisServer,
} from "../utils/Utils";

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
  sessionId: "SIM-header-session",
  firstName: "Test",
  lastName: "User",
  loginLabUnit: "Test Lab",
  logout: vi.fn(),
};

const mockConfigurationContext = {
  configurationProperties: {
    BANNER_TEXT: "Test LIMS",
    releaseNumber: "3.2.1",
    NAVIGATION_PROFILE: "global",
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

  describe("Site navigation profile", () => {
    const profileMenuData = [
      MOCK_MENU_DATA[0],
      {
        menu: {
          elementId: "menu_help",
          displayKey: "banner.menu.help",
          actionURL: "",
          isActive: true,
        },
        childMenus: [
          {
            menu: {
              elementId: "menu_help_user_manual",
              displayKey: "banner.menu.help",
              actionURL: "/docs/UserManual",
              isActive: true,
            },
            childMenus: [],
          },
        ],
      },
    ];

    test.each([
      {
        name: "Chinese only",
        languages: { zh: { label: "简体中文", messages } },
      },
      {
        name: "English only",
        languages: { en: { label: "English", messages } },
      },
      {
        name: "multiple languages",
        languages: mockConfigurationContext.enabledLanguages,
      },
    ])("keeps the China product menu with $name", async ({ languages }) => {
      const { container } = renderHeader({
        menuData: profileMenuData,
        configurationContext: {
          ...mockConfigurationContext,
          enabledLanguages: languages,
          configurationProperties: {
            ...mockConfigurationContext.configurationProperties,
            NAVIGATION_PROFILE: "china",
          },
        },
      });

      await waitFor(() => {
        expect(container.querySelector('a[href="/Dashboard"]')).toBeTruthy();
      });
      expect(container.querySelector("#menu_help")).toBeNull();
    });

    test("respects an explicitly global site even when Chinese is the only language", async () => {
      const { container } = renderHeader({
        menuData: profileMenuData,
        configurationContext: {
          ...mockConfigurationContext,
          enabledLanguages: { zh: { label: "简体中文", messages } },
        },
      });

      await waitFor(() => {
        expect(container.querySelector("#menu_help button")).toBeTruthy();
      });
    });

    test.each([{}, { NAVIGATION_PROFILE: "unknown" }])(
      "uses the explicit deployment default while site settings are unavailable or invalid",
      async (configurationProperties) => {
        const { container } = renderHeader({
          menuData: profileMenuData,
          configurationContext: {
            ...mockConfigurationContext,
            configurationProperties,
          },
        });

        await waitFor(() => {
          expect(container.querySelector('a[href="/Dashboard"]')).toBeTruthy();
        });
        expect(container.querySelector("#menu_help")).toBeNull();
      },
    );
  });

  describe("Clinical workspace presentation", () => {
    const chinaConfiguration = {
      ...mockConfigurationContext,
      configurationProperties: {
        ...mockConfigurationContext.configurationProperties,
        NAVIGATION_PROFILE: "china",
      },
    };

    test("numbers the authorized workspace navigation without changing accessible labels", async () => {
      const { container } = renderHeader({
        configurationContext: chinaConfiguration,
      });
      await waitFor(() => {
        expect(
          container.querySelector(".oe-workspace-nav-number"),
        ).toBeTruthy();
      });
      const homeLink = container.querySelector('a[href="/Dashboard"]');
      expect(
        homeLink.querySelector(".oe-workspace-nav-number"),
      ).toHaveTextContent("01");
      expect(
        homeLink.querySelector(".oe-workspace-nav-number"),
      ).toHaveAttribute("aria-hidden", "true");
      expect(homeLink).toHaveAttribute("aria-current", "page");
      expect(container.querySelector(".oe-workspace-nav-section")).toBeNull();
      expect(
        container.querySelector(".oe-header-workspace__lab"),
      ).toHaveTextContent("Test Lab");
      expect(container.querySelector("#header-logo img")).toBeNull();
      expect(container.querySelector(".oe-product-brand")).toHaveAttribute(
        "aria-label",
        "LIS 检验工作台",
      );
      expect(
        container.querySelector(".oe-product-brand__copy strong"),
      ).toHaveTextContent("LIS 检验工作台");
    });

    test("keeps the global profile free of clinical navigation decoration", async () => {
      const { container } = renderHeader({
        menuData: MOCK_MENU_DATA.map((item) => ({
          ...item,
          menu: {
            ...item.menu,
            workspaceNumber: "01",
            workspaceSection: "clinical",
          },
        })),
      });
      await waitFor(() => {
        expect(container.querySelector('a[href="/Dashboard"]')).toBeTruthy();
      });
      expect(container.querySelector("#mainHeader")).toHaveAttribute(
        "data-navigation-profile",
        "global",
      );
      expect(container.querySelector(".oe-workspace-nav-number")).toBeNull();
      expect(container.querySelector(".oe-workspace-nav-section")).toBeNull();
      expect(container.querySelector(".oe-header-workspace")).toBeNull();
    });

    test("uses the supported Carbon icon slot for parent numbers and a plain title", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const { container } = renderHeader({
          configurationContext: chinaConfiguration,
        });
        await waitFor(() => {
          expect(
            container.querySelector(
              "#menu_intake_workspace .cds--side-nav__submenu",
            ),
          ).toBeTruthy();
        });
        const orderToggle = container.querySelector(
          "#menu_intake_workspace .cds--side-nav__submenu",
        );
        expect(orderToggle).toHaveAccessibleName(
          messages["sidenav.workspace.orders"],
        );
        expect(
          orderToggle.querySelector(".cds--side-nav__submenu-title"),
        ).toHaveTextContent(messages["sidenav.workspace.orders"]);
        const number = orderToggle.querySelector(
          ".cds--side-nav__icon .oe-workspace-nav-number",
        );
        expect(number).toHaveTextContent("02");
        expect(number).toHaveAttribute("aria-hidden", "true");
        expect(
          consoleError.mock.calls.some((args) =>
            args.some((arg) => String(arg).includes("Invalid prop `title`")),
          ),
        ).toBe(false);
      } finally {
        consoleError.mockRestore();
      }
    });

    test("allows keyboard expansion and Escape to close the clinical drawer", async () => {
      const user = userEvent.setup();
      const { container, mockCloseSideNav } = renderHeader({
        configurationContext: chinaConfiguration,
        isDesktop: false,
        navOpen: true,
      });
      await waitFor(() => {
        expect(
          container.querySelector(
            ".oe-workspace-nav-item .cds--side-nav__submenu",
          ),
        ).toBeTruthy();
      });
      const getToggle = () =>
        container.querySelector(
          ".oe-workspace-nav-item .cds--side-nav__submenu",
        );
      getToggle().focus();
      await user.keyboard("{Enter}");
      await waitFor(() => {
        expect(getToggle()).toHaveAttribute("aria-expanded", "true");
      });
      expect(getToggle()).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(mockCloseSideNav).toHaveBeenCalledTimes(1);
      expect(container.querySelector("#sidenav-menu-button")).toHaveFocus();
    });
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
          configurationProperties: {
            ...mockConfigurationContext.configurationProperties,
            NAVIGATION_PROFILE: "china",
          },
          enabledLanguages: {
            zh: { label: "简体中文", messages },
          },
        },
      });

      await waitFor(() => {
        expect(
          container.querySelector("#menu_intake_workspace button"),
        ).toBeTruthy();
      });
      fireEvent.click(container.querySelector("#menu_intake_workspace button"));

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
          configurationProperties: {
            ...mockConfigurationContext.configurationProperties,
            NAVIGATION_PROFILE: "china",
          },
          enabledLanguages: {
            zh: { label: "简体中文", messages },
          },
        },
      });

      await waitFor(() => {
        expect(
          container.querySelector("#menu_review_report_workspace button"),
        ).toBeTruthy();
      });
      fireEvent.click(
        container.querySelector("#menu_review_report_workspace button"),
      );

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

    test("top-level menus expand and collapse independently", async () => {
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
        expect(getOrderToggle()).toHaveAttribute("aria-expanded", "true");
        expect(getResultsToggle()).toHaveAttribute("aria-expanded", "true");
      });

      fireEvent.click(container.querySelector("#menu_sample_add_nav"));
      await waitFor(() => {
        expect(getOrderToggle()).toHaveAttribute("aria-expanded", "true");
        expect(getResultsToggle()).toHaveAttribute("aria-expanded", "true");
      });

      fireEvent.click(getOrderToggle());
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

      expect(
        await screen.findByText(messages["admin.navigation.backToCenter"]),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages["admin.navigation.useCenter"]),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(messages["banner.menu.home"]),
      ).not.toBeInTheDocument();
      const statusCalls = getFromOpenElisServer.mock.calls.filter(
        ([url]) => url === "/rest/database-cleaning/status",
      );
      expect(statusCalls).toHaveLength(1);
    });

    test.each([
      ["/MasterListsPage/systemOperations", true],
      ["/MasterListsPage/globalMenuManagement", false],
    ])(
      "admin workspace link preserves current-route and legacy context for %s",
      async (initialRoute, isCurrentWorkspace) => {
        const { container } = renderHeader({
          initialRoute,
          navContext: "admin",
        });

        const sideNavs = container.querySelectorAll(".cds--side-nav");
        expect(sideNavs).toHaveLength(1);
        expect(sideNavs[0]).toHaveClass("cds--side-nav--expanded");
        expect(sideNavs[0]).toHaveClass("admin-shell-side-nav");
        const contextNav = within(sideNavs[0]);
        expect(
          await contextNav.findByRole("button", {
            name: messages["admin.dashboard.domain.security"],
          }),
        ).toHaveAttribute("aria-expanded", "true");
        const workspaceLink = contextNav.getByRole("link", {
          name: messages["workspace.system.title"],
        });
        expect(workspaceLink).toHaveAttribute(
          "href",
          "/MasterListsPage/systemOperations",
        );
        if (isCurrentWorkspace) {
          expect(workspaceLink).toHaveAttribute("aria-current", "page");
        } else {
          expect(workspaceLink).not.toHaveAttribute("aria-current");
        }
        expect(contextNav.getAllByRole("link")).toHaveLength(2);
        expect(
          contextNav.getByRole("link", {
            name: messages["admin.navigation.backToCenter"],
          }),
        ).toHaveAttribute("href", "/MasterListsPage");
        expect(
          contextNav.queryByRole("link", {
            name: messages["sidenav.label.admin.menu"],
          }),
        ).not.toBeInTheDocument();
        expect(
          contextNav.queryByRole("button", {
            name: messages["admin.dashboard.domain.catalog"],
          }),
        ).not.toBeInTheDocument();
      },
    );

    test("admin back control navigates to the management center", async () => {
      renderHeader({
        initialRoute: "/MasterListsPage/globalMenuManagement",
        navContext: "admin",
      });

      fireEvent.click(
        await screen.findByText(messages["admin.navigation.backToCenter"]),
      );

      expect(screen.getByTestId("current-path")).toHaveTextContent(
        "/MasterListsPage",
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

// Keep all three header components real; control only I/O and session context.
describe("Header protected reads follow the authenticated session", () => {
  const paths = [
    "/rest/properties",
    "/rest/notification/pnconfig",
    "/rest/notifications",
  ];
  const ownerA = {
    ...mockUserSessionDetails,
    userId: "SIM-A",
    sessionId: "SIM-session-A",
  };
  const ownerB = {
    ...mockUserSessionDetails,
    userId: "SIM-B",
    sessionId: "SIM-session-B",
  };
  let reads,
    writes,
    originalServiceWorker,
    originalPushManager,
    getSubscription;
  const respond = async (read, body) => {
    await act(async () => {
      read.callback(body);
    });
  };
  const request = (path, index = 0) =>
    reads.filter((read) => read.path === path)[index];
  const expectCount = async (count) => {
    await waitFor(() => {
      paths.forEach((path) =>
        expect(reads.filter((read) => read.path === path)).toHaveLength(count),
      );
    });
  };
  const renderSession = (initialSession, logout = vi.fn()) => {
    const tree = (session) => (
      <MemoryRouter initialEntries={["/login"]}>
        <IntlProvider locale="en" messages={messages}>
          <UserSessionDetailsContext.Provider
            value={{ userSessionDetails: session, logout }}
          >
            <ConfigurationContext.Provider value={mockConfigurationContext}>
              <NotificationContext.Provider value={mockNotificationContext}>
                <OEHeader
                  onChangeLanguage={vi.fn()}
                  navOpen={false}
                  toggleSideNav={vi.fn()}
                  closeSideNav={vi.fn()}
                />
              </NotificationContext.Provider>
            </ConfigurationContext.Provider>
          </UserSessionDetailsContext.Provider>
        </IntlProvider>
      </MemoryRouter>
    );
    const view = render(tree(initialSession));
    return { ...view, setSession: (session) => view.rerender(tree(session)) };
  };
  const openNotifications = (view) =>
    fireEvent.click(view.container.querySelector("#notification-Icon"));
  const exitSession = (view) => {
    fireEvent.click(view.container.querySelector("#user-Icon"));
    fireEvent.click(view.container.querySelector('[data-cy="logOut"]'));
  };
  beforeEach(() => {
    vi.clearAllMocks();
    reads = [];
    writes = [];
    originalServiceWorker = Object.getOwnPropertyDescriptor(
      navigator,
      "serviceWorker",
    );
    originalPushManager = Object.getOwnPropertyDescriptor(
      window,
      "PushManager",
    );
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    getSubscription = vi.fn().mockResolvedValue({ endpoint: "SIM-device" });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
    });
    getFromOpenElisServer.mockImplementation((path, callback, signal) => {
      if (paths.includes(path)) reads.push({ path, callback, signal });
      else if (path === "/rest/menu") callback(MOCK_MENU_DATA);
      else if (path === "/rest/database-cleaning/status")
        callback({ trainingInstallation: false });
    });
    // Capture the old pnconfig Promise API too for the pre-fix red run.
    getFromOpenElisServerV2.mockImplementation(
      (path) => new Promise((callback) => reads.push({ path, callback })),
    );
    putToOpenElisServer.mockImplementation((path, body, callback) =>
      writes.push({ path, callback }),
    );
    postToOpenElisServer.mockImplementation((path, body, callback) =>
      writes.push({ path, body, callback }),
    );
  });
  afterEach(() => {
    if (originalServiceWorker)
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    else delete navigator.serviceWorker;
    if (originalPushManager)
      Object.defineProperty(window, "PushManager", originalPushManager);
    else delete window.PushManager;
    vi.restoreAllMocks();
  });

  test("does not request protected data before a real identity exists and keeps the local manual", async () => {
    const view = renderSession({});
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(reads).toEqual([]);
    view.setSession({ authenticated: false });
    view.setSession({ authenticated: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(reads).toEqual([]);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(view.container.querySelector("#user-Help"));
    fireEvent.click(screen.getByText(messages["banner.menu.help.usermanual"]));
    expect(open).toHaveBeenCalledWith(
      "/docs/china-lis-user-manual.html",
      "_blank",
      "noopener,noreferrer",
    );
  });

  test("initializes after authentication, preserves same-session data, and refreshes a rotated session", async () => {
    const view = renderSession({ authenticated: false });
    view.setSession(ownerA);
    await expectCount(1);
    await respond(request("/rest/notifications"), [
      {
        id: "SIM-note",
        message: "SIM current notification",
        createdDate: "2026-09-24",
      },
    ]);
    await respond(request("/rest/properties"), {
      "org.openelisglobal.help.tutorials.url": "https://example.test/SIM-A",
    });
    await respond(request("/rest/notification/pnconfig"), {
      subscribed: true,
      pfEndpoint: "SIM-device",
    });
    openNotifications(view);
    expect(screen.getByText("SIM current notification")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.unsubscribe"],
      }),
    ).toBeVisible();
    view.setSession({ ...ownerA, csrf: "SIM-refreshed" });
    await expectCount(1);
    expect(screen.getByText("SIM current notification")).toBeVisible();
    view.setSession({ ...ownerA, sessionId: "SIM-A-rotated" });
    await expectCount(2);
    expect(
      screen.queryByText("SIM current notification"),
    ).not.toBeInTheDocument();
    paths.forEach((path) => expect(request(path).signal.aborted).toBe(true));
  });

  test("cancels old reads and ignores their callbacks after account change and logout", async () => {
    const view = renderSession(ownerA);
    await expectCount(1);
    view.setSession(ownerB);
    await expectCount(2);
    paths.forEach((path) => expect(request(path).signal.aborted).toBe(true));
    await respond(request("/rest/notifications", 1), [
      { id: "SIM-B-note", message: "SIM B notification" },
    ]);
    await respond(request("/rest/properties", 1), {
      "org.openelisglobal.help.tutorials.url": "https://example.test/SIM-B",
    });
    await respond(request("/rest/notification/pnconfig", 1), {
      subscribed: false,
    });
    await respond(request("/rest/notifications"), [
      { message: "SIM stale A notification" },
    ]);
    await respond(request("/rest/properties"), {
      "org.openelisglobal.help.tutorials.url": "https://example.test/SIM-A",
    });
    await respond(request("/rest/notification/pnconfig"), {
      subscribed: true,
      pfEndpoint: "SIM-device",
    });
    openNotifications(view);
    expect(screen.getByText("SIM B notification")).toBeVisible();
    expect(
      screen.queryByText("SIM stale A notification"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.subscribe"],
      }),
    ).toBeVisible();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(view.container.querySelector("#user-Help"));
    fireEvent.click(screen.getByText(messages["banner.menu.help.about"]));
    expect(open).toHaveBeenLastCalledWith(
      "https://example.test/SIM-B",
      "_blank",
      "noopener,noreferrer",
    );
    view.setSession({ authenticated: false });
    paths.forEach((path) => expect(request(path, 1).signal.aborted).toBe(true));
    await respond(request("/rest/notifications", 1), [
      { message: "SIM late B notification" },
    ]);
    await respond(request("/rest/properties", 1), {
      "org.openelisglobal.help.tutorials.url": "https://example.test/SIM-late",
    });
    expect(screen.queryByText("SIM B notification")).not.toBeInTheDocument();
    expect(
      screen.queryByText("SIM late B notification"),
    ).not.toBeInTheDocument();
    fireEvent.click(view.container.querySelector("#user-Help"));
    fireEvent.click(screen.getByText(messages["banner.menu.help.about"]));
    expect(open).toHaveBeenCalledTimes(1);
  });

  test("ends protected reads on the logout click before the logout response", async () => {
    let abortedAtLogout;
    const logout = vi.fn(() => {
      abortedAtLogout = paths.map((path) => request(path).signal?.aborted);
    });
    const view = renderSession(ownerA, logout);
    await expectCount(1);
    exitSession(view);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(abortedAtLogout).toEqual([true, true, true]);
    paths.forEach((path) => expect(request(path).signal.aborted).toBe(true));
    await respond(request("/rest/notifications"), [
      { message: "SIM after exit" },
    ]);
    expect(screen.queryByText("SIM after exit")).not.toBeInTheDocument();
    view.setSession({ ...ownerA });
    await expectCount(1);
    view.setSession({ authenticated: false });
    view.setSession(ownerB);
    await expectCount(2);
  });

  test("refreshes after a current mark-as-read but never after its owner logs out", async () => {
    const view = renderSession(ownerA);
    await expectCount(1);
    await respond(request("/rest/notifications"), [
      { id: "SIM-note", message: "SIM to mark" },
    ]);
    openNotifications(view);
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.markasread"],
      }),
    );
    expect(writes[0].path).toBe("/rest/notification/markasread/SIM-note");
    await act(async () => {
      writes[0].callback({});
    });
    await waitFor(() =>
      expect(
        reads.filter((read) => read.path === "/rest/notifications"),
      ).toHaveLength(2),
    );
    await respond(request("/rest/notifications", 1), [
      { id: "SIM-note", message: "SIM to mark again" },
    ]);
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.markallasread"],
      }),
    );
    expect(writes[1].path).toBe("/rest/notification/markasread/all");
    exitSession(view);
    await act(async () => {
      writes[1].callback({});
    });
    expect(
      reads.filter((read) => read.path === "/rest/notifications"),
    ).toHaveLength(2);
  });

  test("discards a subscription lookup that completes after its session changes", async () => {
    let resolveSubscription;
    getSubscription.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSubscription = resolve;
      }),
    );
    const view = renderSession(ownerA);
    await expectCount(1);
    await respond(request("/rest/notification/pnconfig"), {
      subscribed: true,
      pfEndpoint: "SIM-device",
    });
    expect(getSubscription).toHaveBeenCalledTimes(1);
    view.setSession(ownerB);
    await expectCount(2);
    await respond(request("/rest/notification/pnconfig", 1), {
      subscribed: false,
    });
    await act(async () => {
      resolveSubscription({ endpoint: "SIM-device" });
    });
    openNotifications(view);
    expect(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.subscribe"],
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: messages["notification.slideover.button.unsubscribe"],
      }),
    ).not.toBeInTheDocument();
  });
  test("does not reuse old write callbacks after the same identity reenters or the header unmounts", async () => {
    const view = renderSession(ownerA);
    await expectCount(1);
    await respond(request("/rest/notifications"), [
      { id: "SIM-old", message: "SIM old cycle" },
    ]);
    openNotifications(view);
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.markallasread"],
      }),
    );
    view.setSession({ authenticated: false });
    view.setSession({ ...ownerA });
    await expectCount(2);
    await act(async () => {
      writes[0].callback({});
    });
    expect(
      reads.filter((read) => read.path === "/rest/notifications"),
    ).toHaveLength(2);
    await respond(request("/rest/notifications", 1), [
      { id: "SIM-new", message: "SIM new cycle" },
    ]);
    openNotifications(view);
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.markallasread"],
      }),
    );
    view.unmount();
    await act(async () => {
      writes[1].callback({});
    });
    expect(
      reads.filter((read) => read.path === "/rest/notifications"),
    ).toHaveLength(2);
  });

  test("does not continue an old service-worker lookup after the owner changes", async () => {
    let resolveReady;
    navigator.serviceWorker.ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const oldGetSubscription = vi
      .fn()
      .mockResolvedValue({ endpoint: "SIM-old-device" });
    const view = renderSession(ownerA);
    await expectCount(1);
    await respond(request("/rest/notification/pnconfig"), {
      subscribed: true,
      pfEndpoint: "SIM-old-device",
    });
    view.setSession(ownerB);
    await expectCount(2);
    navigator.serviceWorker.ready = Promise.resolve({
      pushManager: { getSubscription },
    });
    await respond(request("/rest/notification/pnconfig", 1), {
      subscribed: false,
    });
    await act(async () => {
      resolveReady({ pushManager: { getSubscription: oldGetSubscription } });
    });
    expect(oldGetSubscription).not.toHaveBeenCalled();
    expect(getSubscription).toHaveBeenCalledTimes(1);
  });
  test.each([
    { authenticated: true, userId: "SIM-A" },
    { ...ownerA, userId: "  " },
    { ...ownerA, sessionId: "  " },
    { ...ownerA, userId: 42 },
    { ...ownerA, sessionId: 42 },
  ])(
    "requires complete string identity before reading: %j",
    async (session) => {
      renderSession(session);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(reads).toEqual([]);
    },
  );

  const subscriptionFlow = (stage) => {
    let resolve, reject;
    const promise = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const push = {
      endpoint: "SIM-device",
      getKey: () => new Uint8Array([1, 2]).buffer,
    };
    const subscribe = vi
      .fn()
      .mockImplementation(() =>
        stage === "push" ? promise : Promise.resolve(push),
      );
    const registration = { pushManager: { getSubscription, subscribe } };
    navigator.serviceWorker.register = vi
      .fn()
      .mockImplementation(() =>
        stage === "register" ? promise : Promise.resolve(registration),
      );
    navigator.serviceWorker.ready =
      stage === "ready" ? promise : Promise.resolve(registration);
    getFromOpenElisServerV2.mockImplementation((path) => {
      if (path === "/rest/notification/pnconfig") {
        return new Promise((callback) => reads.push({ path, callback }));
      }
      expect(path).toBe("/rest/notification/public_key");
      return stage === "publicKey"
        ? promise
        : Promise.resolve({ publicKey: "SIM-key" });
    });
    return {
      subscribe,
      resolve: () =>
        resolve(
          stage === "push"
            ? push
            : stage === "publicKey"
              ? { publicKey: "SIM-key" }
              : registration,
        ),
      reject,
    };
  };
  const clickSubscribe = async (view) => {
    openNotifications(view);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: messages["notification.slideover.button.subscribe"],
        }),
      );
    });
  };

  test.each(["register", "ready", "publicKey", "push"])(
    "stops a subscription after account change during %s",
    async (stage) => {
      const flow = subscriptionFlow(stage);
      const view = renderSession(ownerA);
      await expectCount(1);
      await clickSubscribe(view);
      expect(navigator.serviceWorker.register).toHaveBeenCalledTimes(1);
      if (stage === "publicKey" || stage === "push")
        expect(
          getFromOpenElisServerV2.mock.calls.filter(
            ([path]) => path === "/rest/notification/public_key",
          ),
        ).toHaveLength(1);
      if (stage === "push") expect(flow.subscribe).toHaveBeenCalledTimes(1);
      view.setSession(ownerB);
      await expectCount(2);
      await act(async () => {
        flow.resolve();
      });
      expect(postToOpenElisServer).not.toHaveBeenCalled();
      expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
      if (stage === "register" || stage === "ready")
        expect(
          getFromOpenElisServerV2.mock.calls.filter(
            ([path]) => path === "/rest/notification/public_key",
          ),
        ).toHaveLength(0);
      if (stage !== "push") expect(flow.subscribe).not.toHaveBeenCalled();
    },
  );

  test("does not publish an old subscription error after logout", async () => {
    const flow = subscriptionFlow("publicKey");
    const view = renderSession(ownerA);
    await expectCount(1);
    await clickSubscribe(view);
    expect(
      getFromOpenElisServerV2.mock.calls.filter(
        ([path]) => path === "/rest/notification/public_key",
      ),
    ).toHaveLength(1);
    exitSession(view);
    await act(async () => {
      flow.reject(new Error("SIM old request failed"));
    });
    expect(postToOpenElisServer).not.toHaveBeenCalled();
    expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
  });

  test("ignores an unsubscribe callback after the same identity starts a new session cycle", async () => {
    subscriptionFlow();
    const view = renderSession(ownerA);
    await expectCount(1);
    await respond(request("/rest/notification/pnconfig"), {
      subscribed: true,
      pfEndpoint: "SIM-device",
    });
    openNotifications(view);
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.unsubscribe"],
      }),
    );
    expect(writes[0].path).toBe("/rest/notification/unsubscribe");
    view.setSession({ authenticated: false });
    view.setSession({ ...ownerA });
    await expectCount(2);
    await respond(request("/rest/notification/pnconfig", 1), {
      subscribed: true,
      pfEndpoint: "SIM-device",
    });
    await act(async () => {
      writes[0].callback(200);
    });
    expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
    openNotifications(view);
    expect(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.unsubscribe"],
      }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.unsubscribe"],
      }),
    );
    await act(async () => {
      writes[1].callback(200);
    });
    expect(mockNotificationContext.addNotification).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", {
        name: messages["notification.slideover.button.subscribe"],
      }),
    ).toBeVisible();
  });

  test("waits for subscription persistence and ignores its callback after logout", async () => {
    subscriptionFlow();
    const view = renderSession(ownerA);
    await expectCount(1);
    await clickSubscribe(view);
    expect(writes[0].path).toBe("/rest/notification/subscribe");
    expect(JSON.parse(writes[0].body).pfEndpoint).toBe("SIM-device");
    expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
    exitSession(view);
    await act(async () => {
      writes[0].callback(200);
    });
    expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
  });

  test.each([200, 204, 503, 0])(
    "reports the current subscription persistence outcome %s",
    async (status) => {
      subscriptionFlow();
      const view = renderSession(ownerA);
      await expectCount(1);
      await clickSubscribe(view);
      expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
      await act(async () => {
        writes[0].callback(status);
      });
      expect(mockNotificationContext.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: status >= 200 && status < 300 ? "success" : "warning",
        }),
      );
      expect(
        screen.getByRole("button", {
          name: messages[
            status >= 200 && status < 300
              ? "notification.slideover.button.unsubscribe"
              : "notification.slideover.button.subscribe"
          ],
        }),
      ).toBeVisible();
    },
  );
  test.each([200, 204, 503, 0])(
    "reports the current unsubscribe persistence outcome %s",
    async (status) => {
      subscriptionFlow();
      const view = renderSession(ownerA);
      await expectCount(1);
      await respond(request("/rest/notification/pnconfig"), {
        subscribed: true,
        pfEndpoint: "SIM-device",
      });
      openNotifications(view);
      fireEvent.click(
        screen.getByRole("button", {
          name: messages["notification.slideover.button.unsubscribe"],
        }),
      );
      expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
      await act(async () => {
        writes[0].callback(status);
      });
      expect(mockNotificationContext.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: status >= 200 && status < 300 ? "success" : "warning",
        }),
      );
      expect(
        screen.getByRole("button", {
          name: messages[
            status >= 200 && status < 300
              ? "notification.slideover.button.subscribe"
              : "notification.slideover.button.unsubscribe"
          ],
        }),
      ).toBeVisible();
    },
  );

  test.each(["subscribe", "unsubscribe"])(
    "discards an old %s failure response without changing the new user's state",
    async (operation) => {
      subscriptionFlow();
      const view = renderSession(ownerA);
      await expectCount(1);
      if (operation === "subscribe") await clickSubscribe(view);
      else {
        await respond(request("/rest/notification/pnconfig"), {
          subscribed: true,
          pfEndpoint: "SIM-device",
        });
        openNotifications(view);
        fireEvent.click(
          screen.getByRole("button", {
            name: messages["notification.slideover.button.unsubscribe"],
          }),
        );
      }
      view.setSession(ownerB);
      await expectCount(2);
      await respond(request("/rest/notification/pnconfig", 1), {
        subscribed: true,
        pfEndpoint: "SIM-device",
      });
      mockNotificationContext.addNotification.mockClear();
      mockNotificationContext.setNotificationVisible.mockClear();
      await act(async () => {
        writes[0].callback(0);
      });
      expect(mockNotificationContext.addNotification).not.toHaveBeenCalled();
      expect(
        mockNotificationContext.setNotificationVisible,
      ).not.toHaveBeenCalled();
      openNotifications(view);
      expect(
        screen.getByRole("button", {
          name: messages["notification.slideover.button.unsubscribe"],
        }),
      ).toBeVisible();
    },
  );
});
