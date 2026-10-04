const mockHistory = { push: vi.fn() };
let mockLocation;
vi.mock("react-router-dom", async (original) => ({
  ...(await original()),
  useHistory: () => mockHistory,
  useLocation: () => mockLocation,
  useParams: () => ({ ids: "7,8,9" }),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  putToOpenElisServer: vi.fn(),
}));
vi.mock("../../common/PageBreadCrumb", () => ({
  default: ({ breadcrumbs }) => (
    <nav>
      {breadcrumbs.map((b) => (
        <a key={b.link} href={b.link}>
          {b.label}
        </a>
      ))}
    </nav>
  ),
}));
vi.mock("../../layout/Layout", async () => ({
  NotificationContext: (await import("react")).createContext({
    addNotification: vi.fn(),
    setNotificationVisible: vi.fn(),
  }),
}));
vi.mock("./sections/StorageSection", () => ({
  default: () => <div>Storage</div>,
}));
vi.mock("./sections/RangeModal", () => ({ default: () => null }));

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/en.json";
import CombinedTestEditor from "./CombinedTestEditor";
import { getFromOpenElisServer, putToOpenElisServer } from "../../utils/Utils";

const list = "/MasterListsPage/TestCatalogList?q=GLU&page=2&pageSize=10";
const search = `?returnTo=${encodeURIComponent(list)}`;
const renderEditor = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <CombinedTestEditor />
    </IntlProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockLocation = {
    pathname: "/MasterListsPage/TestCatalogEditor/group/7,8,9/ranges",
    search,
  };
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.includes("/group/summary"))
      cb(
        [7, 8, 9].map((id) => ({
          testId: String(id),
          name: `Test ${id}`,
          active: true,
        })),
      );
    else if (url.endsWith("/sample-results")) cb({ components: [] });
    else cb({ ranges: [] });
  });
});

it("carries list context into individual config and reduced group routes without writing", async () => {
  renderEditor();
  fireEvent.click(await screen.findByRole("button", { name: "Test 7" }));
  expect(mockHistory.push).toHaveBeenLastCalledWith(
    `/MasterListsPage/TestCatalogEditor/7/terminology${search}`,
  );
  fireEvent.click(
    screen.getAllByRole("button", {
      name: messages["button.testCatalog.removeFromSet"],
    })[0],
  );
  expect(mockHistory.push).toHaveBeenLastCalledWith(
    `/MasterListsPage/TestCatalogEditor/group/8,9/ranges${search}`,
  );
  expect(putToOpenElisServer).not.toHaveBeenCalled();
});

it("returns from grouped configuration and breadcrumb to the original list query", async () => {
  renderEditor();
  await screen.findByRole("button", { name: "Test 7" });
  expect(
    screen.getByRole("link", { name: "label.testCatalog.editor" }),
  ).toHaveAttribute("href", list);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mockHistory.push).toHaveBeenLastCalledWith(list);
});

it("rejects an arbitrary grouped-editor return address", async () => {
  mockLocation = {
    pathname: "/admin/TestCatalogEditor/group/7,8,9/ranges",
    search: "?returnTo=https%3A%2F%2Fevil.invalid",
  };
  renderEditor();
  await screen.findByRole("button", { name: "Test 7" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mockHistory.push).toHaveBeenLastCalledWith("/admin/TestCatalogList");
});
