// Tests for the Test Catalog Management entry in the admin SideNav.

// ========== MOCKS (before imports) ==========
const mockHistory = { push: vi.fn() };
let mockLocation = { pathname: "/MasterListsPage", search: "" };

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useHistory: () => mockHistory,
    useLocation: () => mockLocation,
  };
});

// The nav fetches the open test's name for the "Editing: <name>" context line.
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn((_endpoint, callback) =>
    callback({ name: "Hemoglobin" }),
  ),
}));

// ========== IMPORTS ==========
import React from "react";
import { render, act, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import AdminSideNav from "./AdminSideNav";
import { V1_SECTIONS } from "./testCatalog/sectionConfig";
import { SAMPLE_TYPE_SECTIONS } from "./sampleTypeManagement/sectionConfig";
import messages from "../../languages/en.json";

const renderNav = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <AdminSideNav />
    </IntlProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe("AdminSideNav — Test Catalog Management entry", () => {
  it("shows only the current configuration domain off an editor route", () => {
    mockLocation = { pathname: "/MasterListsPage/reflex", search: "" };
    const { container } = renderNav();

    V1_SECTIONS.forEach((key) => {
      expect(container.querySelector(`[data-cy="section-${key}"]`)).toBeNull();
    });

    expect(
      screen.getByRole("button", { name: "Test catalog" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelectorAll('[data-cy^="admin-domain-"]'),
    ).toHaveLength(2);
    expect(
      container.querySelector(
        '[data-cy="admin-domain-testManagementConfigMenu"]',
      ),
    ).toHaveAttribute("href", "/MasterListsPage/testManagementConfigMenu");
    expect(
      container.querySelector('[data-cy="admin-domain-rulesWorkspace"]'),
    ).toHaveAttribute("href", "/MasterListsPage/rulesWorkspace");
    expect(
      container.querySelector('[data-cy="admin-domain-reflex"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-cy="admin-domain-organizationPeopleWorkspace"]',
      ),
    ).toBeNull();
    expect(
      screen.getByTestId("admin-back-to-management-center"),
    ).toHaveAttribute("href", "/MasterListsPage");
  });

  it("keeps organization details within one workspace entry", () => {
    mockLocation = {
      pathname: "/MasterListsPage/userManagement",
      search: "",
    };
    const { container } = renderNav();

    expect(
      screen.getByRole("button", { name: "Organizations & people" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelectorAll('[data-cy^="admin-domain-"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector(
        '[data-cy="admin-domain-organizationPeopleWorkspace"]',
      ),
    ).toHaveAttribute("href", "/MasterListsPage/organizationPeopleWorkspace");
    expect(
      container.querySelector('[data-cy="admin-domain-reflex"]'),
    ).toBeNull();
  });

  it("keeps workflow and report settings within one workspace entry", () => {
    mockLocation = {
      pathname: "/MasterListsPage/PrintedReportsConfigurationMenu",
      search: "",
    };
    const { container } = renderNav();

    expect(
      screen.getByRole("button", { name: "Workflow & reports" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelectorAll('[data-cy^="admin-domain-"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector(
        '[data-cy="admin-domain-workflowReportWorkspace"]',
      ),
    ).toHaveAttribute("href", "/MasterListsPage/workflowReportWorkspace");
  });

  it("keeps analyzer and interface settings within one workspace entry", () => {
    mockLocation = {
      pathname: "/MasterListsPage/AnalyzerTestName",
      search: "",
    };
    const { container } = renderNav();

    expect(
      screen.getByRole("button", { name: "Instruments & interfaces" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelectorAll('[data-cy^="admin-domain-"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-cy="admin-domain-interfaceWorkspace"]'),
    ).toHaveAttribute("href", "/MasterListsPage/interfaceWorkspace");
  });

  it("makes the 9 sections live routed links when editing a test", () => {
    mockLocation = {
      pathname: "/MasterListsPage/TestCatalogEditor/7/methods",
      search: "",
    };
    const { container } = renderNav();

    V1_SECTIONS.forEach((key) => {
      const item = container.querySelector(`[data-cy="section-${key}"]`);
      expect(item).not.toBeNull();
      expect(item.getAttribute("aria-disabled")).toBeNull();
    });
    // each links to the routed section URL
    expect(
      container
        .querySelector('[data-cy="section-ranges"]')
        .getAttribute("href"),
    ).toBe("/MasterListsPage/TestCatalogEditor/7/ranges");
    // the active section (methods) is aria-current; others are not
    expect(
      container
        .querySelector('[data-cy="section-methods"]')
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      container
        .querySelector('[data-cy="section-basic-info"]')
        .getAttribute("aria-current"),
    ).toBeNull();

    // wayfinding: list item flips to "back to list", context names the test
    expect(
      container.querySelector('[data-cy="testCatalogList"]').textContent,
    ).toBe("← All Tests");
    expect(
      container.querySelector('[data-cy="testCatalogSectionsContext"]')
        .textContent,
    ).toBe("Editing: Hemoglobin");
  });

  it("falls back to a generic context label when the test name can't load", async () => {
    const { getFromOpenElisServer } = await import("../utils/Utils");
    getFromOpenElisServer.mockImplementationOnce((_endpoint, callback) =>
      callback(null),
    );
    mockLocation = {
      pathname: "/MasterListsPage/TestCatalogEditor/7/methods",
      search: "",
    };
    const { container } = renderNav();
    expect(
      container.querySelector('[data-cy="testCatalogSectionsContext"]')
        .textContent,
    ).toBe("Editing test");
  });

  it("aborts the in-flight test-name fetch on unmount", async () => {
    const { getFromOpenElisServer } = await import("../utils/Utils");
    mockLocation = {
      pathname: "/MasterListsPage/TestCatalogEditor/7/methods",
      search: "",
    };
    const { unmount } = renderNav();
    // getFromOpenElisServer(endpoint, callback, signal) — the 3rd arg
    const signal = getFromOpenElisServer.mock.calls.at(-1)[2];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    // act() so React 17 flushes the passive-effect cleanup synchronously
    act(() => {
      unmount();
    });
    expect(signal.aborted).toBe(true);
  });

  it("shows entity links first, then only the sample-type sections, when editing a sample type", () => {
    mockLocation = {
      pathname: "/MasterListsPage/SampleTypeManagement/38/basic-info",
      search: "",
    };
    const { container } = renderNav();

    const sampleTypesLink = container.querySelector(
      '[data-cy="sampleTypeManagement"]',
    );
    const testsLink = container.querySelector('[data-cy="testCatalogList"]');
    expect(sampleTypesLink.textContent).toBe("← All Sample Types");
    expect(testsLink.textContent).toBe("Test Catalog Editor");

    // both entity links precede the editing caption and its sections
    const caption = container.querySelector(
      '[data-cy="sampleTypeSectionsContext"]',
    );
    expect(caption).not.toBeNull();
    expect(
      sampleTypesLink.compareDocumentPosition(testsLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      testsLink.compareDocumentPosition(caption) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // sample-type sections are live routed links
    SAMPLE_TYPE_SECTIONS.forEach((key) => {
      const item = container.querySelector(
        `[data-cy="sampleType-section-${key}"]`,
      );
      expect(item).not.toBeNull();
      expect(item.getAttribute("href")).toBe(
        `/MasterListsPage/SampleTypeManagement/38/${key}`,
      );
    });

    // the test editor's (disabled) sections are not rendered at all
    V1_SECTIONS.forEach((key) => {
      expect(container.querySelector(`[data-cy="section-${key}"]`)).toBeNull();
    });
  });

  it("stays expanded on the list routes so leaving an editor doesn't collapse it", () => {
    mockLocation = {
      pathname: "/MasterListsPage/SampleTypeManagement",
      search: "",
    };
    const first = renderNav();
    expect(
      screen.getByRole("button", { name: "Test Catalog Management" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      first.container.querySelector('[data-cy="testCatalogSectionsContext"]'),
    ).toBeNull();
    first.unmount();

    mockLocation = { pathname: "/MasterListsPage/TestCatalogList", search: "" };
    const second = renderNav();
    expect(
      screen.getByRole("button", { name: "Test Catalog Management" }),
    ).toHaveAttribute("aria-expanded", "true");
    second.unmount();

    // Outside an editor, the shorter business-domain menu replaces editor
    // sections and remains open so sibling configuration is one click away.
    mockLocation = { pathname: "/MasterListsPage/reflex", search: "" };
    renderNav();
    expect(
      screen.queryByRole("button", { name: "Test Catalog Management" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Test catalog" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("uses the /admin base prefix when on an /admin editor route", () => {
    mockLocation = {
      pathname: "/admin/TestCatalogEditor/7/storage",
      search: "",
    };
    const { container } = renderNav();
    expect(
      container
        .querySelector('[data-cy="section-storage"]')
        .getAttribute("href"),
    ).toBe("/admin/TestCatalogEditor/7/storage");
  });
});
