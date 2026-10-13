/**
 * TestCatalogEditor — OGC-949 M2 / OGC-927 editor shell.
 *
 * Covers the previously-untested shell: empty + error states, the envelope
 * happy-path (heading + the first section mounted), SideNav section-switch, and
 * Cancel navigation. The network seam (getFromOpenElisServer) and the leaf
 * BasicInfoSection are mocked — the shell's own wiring is under test.
 */

// ========== MOCKS (before imports) ==========
const mockHistory = {
  push: vi.fn(),
  replace: vi.fn(),
  location: { search: "" },
};
let mockParams = {};
let mockLocation = {
  pathname: "/MasterListsPage/TestCatalogEditor/7",
  search: "",
};
let mockNameSaved;

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useHistory: () => mockHistory,
    useParams: () => mockParams,
    // base is derived from the pathname; a non-/admin path → /MasterListsPage.
    useLocation: () => mockLocation,
  };
});

vi.mock("../../utils/Utils", () => ({ getFromOpenElisServer: vi.fn() }));

vi.mock("../../common/PageBreadCrumb", () => ({ default: () => null }));

vi.mock("../../layout/Layout", async () => {
  const React = await import("react");
  return {
    NotificationContext: React.createContext({
      addNotification: () => {},
      setNotificationVisible: () => {},
    }),
  };
});

vi.mock("./sections/BasicInfoSection", async () => {
  const React = await import("react");
  return {
    default: ({ onSaved }) =>
      React.createElement(
        "button",
        { "data-testid": "basic-info-section", onClick: onSaved },
        "Save basic info",
      ),
  };
});

vi.mock("./sections/LocalizationSection", async () => {
  const React = await import("react");
  return {
    default: ({ onSaved }) => {
      mockNameSaved = onSaved;
      const [draft, setDraft] = React.useState("");
      return (
        <>
          <input
            aria-label="Unsaved report name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button onClick={onSaved}>Confirmed name save</button>
        </>
      );
    },
  };
});

vi.mock("./sections/MethodsSection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "methods-section" }),
  };
});

vi.mock("./sections/SampleResultsSection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "sample-results-section" }),
  };
});

vi.mock("./sections/RangesSection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "ranges-section" }),
  };
});

vi.mock("./sections/StorageSection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "storage-section" }),
  };
});

vi.mock("./sections/AnalyzersSection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "analyzers-section" }),
  };
});

vi.mock("./sections/DisplayOrderSection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "display-order-section" }),
  };
});

vi.mock("./sections/TerminologySection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "terminology-section" }),
  };
});

vi.mock("./sections/PanelsSection", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "panels-section" }),
  };
});

// ========== IMPORTS ==========
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { BrowserRouter } from "react-router-dom";
import TestCatalogEditor from "./TestCatalogEditor";
import AdminSideNav from "../AdminSideNav";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { AdminCurrentObjectProvider } from "../../layout/AdminCurrentObjectContext";
import { getFromOpenElisServer } from "../../utils/Utils";
import messages from "../../../languages/en.json";

const session = {
  authenticated: true,
  userId: "admin",
  sessionId: "session-1",
  roles: ["ADMIN"],
};
const editorTree = ({
  identity = session,
  locale = "en",
  showNav = false,
} = {}) => (
  <BrowserRouter>
    <UserSessionDetailsContext.Provider
      value={{ userSessionDetails: identity }}
    >
      <IntlProvider locale={locale} messages={messages}>
        <AdminCurrentObjectProvider>
          {showNav && <AdminSideNav />}
          <TestCatalogEditor />
        </AdminCurrentObjectProvider>
      </IntlProvider>
    </UserSessionDetailsContext.Provider>
  </BrowserRouter>
);
const renderEditor = (options = {}) => {
  const result = render(editorTree(options));
  return {
    ...result,
    rerenderEditor: (next = {}) => {
      options = { ...options, ...next };
      result.rerender(editorTree(options));
    },
  };
};

const envelope = {
  testId: "7",
  name: "Glucose Panel",
  code: "GLU",
  domain: "CLINICAL",
  applicableSections: [
    "basic-info",
    "sample-results",
    "methods",
    "ranges",
    "storage",
    "panels",
    "terminology",
    "analyzers",
    "display-order",
  ],
};

const navContext = () =>
  document.querySelector('[data-cy="testCatalogSectionsContext"]');

describe("current test shared with navigation", () => {
  it("reads the envelope once and keeps the editor read alive when navigation closes", () => {
    let done, signal;
    getFromOpenElisServer.mockImplementation(
      (_url, callback, controllerSignal) => {
        done = callback;
        signal = controllerSignal;
      },
    );
    const page = renderEditor({ showNav: true });
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(1);
    page.rerenderEditor({ showNav: false });
    expect(signal.aborted).toBe(false);
    act(() => done(envelope));
    page.rerenderEditor({ showNav: true });
    expect(navContext()).toHaveTextContent("Glucose Panel");
    mockParams.section = "methods";
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/7/methods";
    page.rerenderEditor();
    expect(screen.getByTestId("methods-section")).toBeInTheDocument();
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(1);
  });

  it("does not accept a prior record's late reply or reuse its name on a return visit", () => {
    const reads = [];
    getFromOpenElisServer.mockImplementation((_url, callback, signal) =>
      reads.push({ callback, signal }),
    );
    const page = renderEditor({ showNav: true });
    mockParams = { testId: "8", section: "basic-info" };
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/8/basic-info";
    page.rerenderEditor();
    expect(reads[0].signal.aborted).toBe(true);
    act(() => reads[1].callback({ ...envelope, testId: "8", name: "Albumin" }));
    act(() => reads[0].callback(envelope));
    expect(navContext()).toHaveTextContent("Albumin");
    expect(screen.queryByText("Glucose Panel")).not.toBeInTheDocument();
    mockParams = { testId: "7", section: "basic-info" };
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/7/basic-info";
    page.rerenderEditor();
    expect(navContext()).not.toHaveTextContent("Albumin");
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(3);
    act(() => reads[2].callback(undefined));
    expect(
      screen.getByText(messages["label.testCatalog.editor.loadError"]),
    ).toBeInTheDocument();
    expect(navContext()).not.toHaveTextContent("Glucose Panel");
  });

  it("clears both headings on logout and ignores a previous login's pending refresh", () => {
    const reads = [];
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      reads.push(callback),
    );
    const page = renderEditor({ showNav: true });
    act(() => reads[0](envelope));
    fireEvent.click(screen.getByTestId("basic-info-section"));
    page.rerenderEditor({ identity: { authenticated: false } });
    expect(screen.queryByText("Glucose Panel")).not.toBeInTheDocument();
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(2);
    page.rerenderEditor({ identity: { ...session, sessionId: "session-2" } });
    act(() => reads[1]({ ...envelope, name: "Old session reply" }));
    expect(screen.queryByText("Old session reply")).not.toBeInTheDocument();
    act(() => reads[2]({ ...envelope, name: "Current session name" }));
    expect(navContext()).toHaveTextContent("Current session name");
  });

  it("loads the current locale instead of retaining a previous locale's name", () => {
    mockParams.section = "localization";
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/7/localization";
    const reads = [];
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      reads.push(callback),
    );
    const page = renderEditor({ showNav: true });
    act(() => reads[0](envelope));
    fireEvent.change(screen.getByLabelText("Unsaved report name"), {
      target: { value: "Keep my translated draft" },
    });
    page.rerenderEditor({ locale: "fr" });
    expect(screen.getByLabelText("Unsaved report name")).toHaveValue(
      "Keep my translated draft",
    );
    expect(screen.queryByText("Glucose Panel")).not.toBeInTheDocument();
    act(() => reads[1]({ ...envelope, name: "Glycémie" }));
    expect(navContext()).toHaveTextContent("Glycémie");
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(2);
  });

  it("refreshes a completed blur-save after section navigation but ignores it after leaving that editor", () => {
    mockParams.section = "localization";
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/7/localization";
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({ ...envelope, testId: mockParams.testId }),
    );
    const page = renderEditor({ showNav: true });
    const done = mockNameSaved;
    mockParams.section = "methods";
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/7/methods";
    page.rerenderEditor();
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(1);
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({ ...envelope, name: "Saved after leaving the section" }),
    );
    act(() => done());
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(2);
    expect(navContext()).toHaveTextContent("Saved after leaving the section");
    mockParams.testId = "8";
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/8/methods";
    page.rerenderEditor();
    const count = getFromOpenElisServer.mock.calls.length;
    act(() => done());
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(count);
  });

  it("updates both names after a confirmed save without discarding another field's draft", () => {
    mockParams.section = "localization";
    mockLocation.pathname = "/MasterListsPage/TestCatalogEditor/7/localization";
    const reads = [];
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      reads.push(callback),
    );
    renderEditor({ showNav: true });
    act(() => reads[0](envelope));
    const input = screen.getByLabelText("Unsaved report name");
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByText("Confirmed name save"));
    expect(input).toHaveValue("Keep this draft");
    act(() => reads[1]({ ...envelope, name: "Updated glucose" }));
    expect(navContext()).toHaveTextContent("Updated glucose");
    expect(
      screen.getByRole("heading", { name: "Updated glucose" }),
    ).toBeInTheDocument();
    expect(input).toHaveValue("Keep this draft");
    fireEvent.click(screen.getByText("Confirmed name save"));
    act(() => reads[2](undefined));
    expect(navContext()).not.toHaveTextContent("Updated glucose");
    expect(input).toHaveValue("Keep this draft");
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = { testId: "7" };
  mockLocation = {
    pathname: "/MasterListsPage/TestCatalogEditor/7",
    search: "",
  };
});

describe("TestCatalogEditor shell", () => {
  it("shows the empty state when no test is selected", () => {
    mockParams = {}; // no testId in the route
    renderEditor();
    expect(
      screen.getByText(messages["label.testCatalog.editor.empty"]),
    ).toBeInTheDocument();
    expect(getFromOpenElisServer).not.toHaveBeenCalled();
  });

  it("shows an error state when the envelope fetch fails", async () => {
    mockParams = { testId: "7", section: "basic-info" };
    getFromOpenElisServer.mockImplementation((url, cb) => cb(undefined));
    renderEditor();
    expect(
      await screen.findByText(messages["label.testCatalog.editor.loadError"]),
    ).toBeInTheDocument();
  });

  it("renders the test name + mounts the section named in the URL", async () => {
    mockParams = { testId: "7", section: "basic-info" };
    getFromOpenElisServer.mockImplementation((url, cb) => cb(envelope));
    renderEditor();
    expect(await screen.findByText("Glucose Panel")).toBeInTheDocument();
    expect(screen.getByTestId("basic-info-section")).toBeInTheDocument();
    expect(
      screen.queryByTestId("test-editor-back-to-list"),
    ).not.toBeInTheDocument();
  });

  it("keeps one page-level return action while creating a test", () => {
    mockParams = { testId: "new", section: "basic-info" };
    renderEditor();
    expect(screen.getByTestId("test-editor-back-to-list")).toBeVisible();
    expect(screen.getByTestId("basic-info-section")).toBeInTheDocument();
  });

  // Section is driven entirely by the URL :section param — the editor owns no
  // nav (that lives in AdminSideNav). Each param mounts its section.
  // All nine v1 sections are built; each URL :section param mounts its section.
  it.each([
    ["methods", "methods-section"],
    ["sample-results", "sample-results-section"],
    ["ranges", "ranges-section"],
    ["storage", "storage-section"],
    ["analyzers", "analyzers-section"],
    ["display-order", "display-order-section"],
    ["terminology", "terminology-section"],
    ["panels", "panels-section"],
  ])(
    "mounts the %s section from the URL section param",
    async (sec, testid) => {
      mockParams = { testId: "7", section: sec };
      getFromOpenElisServer.mockImplementation((url, cb) => cb(envelope));
      renderEditor();
      expect(await screen.findByTestId(testid)).toBeInTheDocument();
      expect(screen.queryByTestId("basic-info-section")).toBeNull();
    },
  );

  it.each([["bogus"], [undefined]])(
    "canonicalizes a missing/invalid section into the URL (section=%s)",
    (sec) => {
      mockParams = sec ? { testId: "7", section: sec } : { testId: "7" };
      getFromOpenElisServer.mockImplementation((url, cb) => cb(envelope));
      renderEditor();
      expect(mockHistory.replace).toHaveBeenCalledWith(
        "/MasterListsPage/TestCatalogEditor/7/basic-info",
      );
    },
  );

  it("navigates to the test list on Cancel", async () => {
    mockParams = { testId: "7", section: "basic-info" };
    getFromOpenElisServer.mockImplementation((url, cb) => cb(envelope));
    renderEditor();
    await screen.findByText("Glucose Panel");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockHistory.push).toHaveBeenCalledWith(
      "/MasterListsPage/TestCatalogList",
    );
  });

  it("create mode: a non-Basic-Info section shows a 'save first' notice, not Basic Info", () => {
    mockParams = { testId: "new", section: "methods" };
    getFromOpenElisServer.mockImplementation((url, cb) => cb([]));
    renderEditor();
    expect(
      screen.getByText(
        messages["label.testCatalog.editor.createSaveFirst.title"],
      ),
    ).toBeInTheDocument();
    // The envelope is never fetched for a new test.
    expect(getFromOpenElisServer).not.toHaveBeenCalledWith(
      "/rest/test-catalog/tests/new",
      expect.anything(),
    );
  });
});

describe("catalog return context", () => {
  const list = "/MasterListsPage/TestCatalogList?q=GLU&page=3&pageSize=20";
  const search = `?returnTo=${encodeURIComponent(list)}`;

  it("retains context during section canonicalization, related-group entry and Cancel", async () => {
    mockLocation.search = search;
    getFromOpenElisServer.mockImplementation((url, cb) =>
      cb(
        url.endsWith("/siblings")
          ? [{ testId: "7" }, { testId: "8" }]
          : envelope,
      ),
    );
    renderEditor();
    await screen.findByText("Glucose Panel");
    expect(mockHistory.replace).toHaveBeenCalledWith(
      `/MasterListsPage/TestCatalogEditor/7/basic-info${search}`,
    );
    fireEvent.click(screen.getByTestId("edit-related-tests"));
    expect(mockHistory.push).toHaveBeenCalledWith(
      `/MasterListsPage/TestCatalogEditor/group/7,8/ranges${search}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockHistory.push).toHaveBeenLastCalledWith(list);
  });

  it("returns an admin legacy deep link to its own list when returnTo is unsafe", async () => {
    mockLocation = {
      pathname: "/admin/TestCatalogEditor/7/ranges",
      search: "?returnTo=https%3A%2F%2Fevil.invalid",
    };
    mockParams = { testId: "7", section: "ranges" };
    getFromOpenElisServer.mockImplementation((url, cb) => cb(envelope));
    renderEditor();
    await screen.findByText("Glucose Panel");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockHistory.push).toHaveBeenCalledWith("/admin/TestCatalogList");
  });
});
