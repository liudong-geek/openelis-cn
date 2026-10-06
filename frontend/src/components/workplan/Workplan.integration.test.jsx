import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import messages from "../../languages/zh.json";
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({ configurationProperties: {} }),
  };
});
import Workplan from "./Workplan";
const session = {
  authenticated: true,
  userId: "42",
  sessionId: "fixture-session",
  roles: ["Results"],
  loginLabUnit: "7",
  userLabRolesMap: { 7: ["Results"], 8: ["Results"] },
  csrf: "fixture-csrf",
};
const row = (n) => ({
  analysisId: String(100 + n),
  sampleId: String(200 + n),
  sampleItemId: String(300 + n),
  testId: "401",
  statusId: "4",
  lastupdated: "2026-10-06T01:02:03.123456Z",
  accessionNumber: `HMC260928${String(n).padStart(5, "0")}`,
  testSectionId: "7",
  receivedDate: "2026/10/06 10:02",
  testName: "白细胞计数",
  patientInfo: "",
  patientName: "张三",
  nextVisitDate: "",
  nonconforming: false,
  sampleGroupingNumber: 1,
  rowKind: "ANALYSIS",
  groupKey: String(200 + n),
  groupLabel: "",
  canPrint: true,
  printUnavailableReason: null,
});
const json = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const historyFor = (url) => {
  window.history.replaceState({}, "", url);
  return createMemoryHistory({ initialEntries: [url] });
};
const mount = (history, type = "unit") =>
  render(
    <Router history={history}>
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: session }}
        >
          <Workplan type={type} />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>,
  );
let posts, queries, mode;
beforeEach(() => {
  posts = [];
  queries = [];
  mode = "ready";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      if (url.endsWith("/session")) return json(session);
      if (url.includes("/user-test-sections/Results"))
        return json([
          { id: "7", value: "生化" },
          { id: "8", value: "血液学" },
        ]);
      if (url.includes("/rest/displayList/ORDER_PRIORITY"))
        return json([
          { id: "ROUTINE", value: "Routine" },
          { id: "STAT", value: "STAT" },
        ]);
      if (url.includes("/rest/Workplan?")) {
        const params = new URLSearchParams(url.split("?")[1]);
        queries.push(Object.fromEntries(params));
        const page = Number(params.get("page")),
          size = Number(params.get("pageSize"));
        const all = Array.from(
          { length: params.get("filterId") === "7" ? 18 : 3 },
          (_, index) => row(index + 1),
        );
        if (mode === "incomplete")
          Object.assign(all[0], {
            lastupdated: null,
            canPrint: false,
            printUnavailableReason: "INCOMPLETE_ANALYSIS_IDENTITY",
          });
        return json({
          queryVersion: "2",
          currentUserId: "42",
          canPrint: true,
          pageSnapshot: "b".repeat(64),
          query: {
            type: params.get("type"),
            filterId: params.get("filterId"),
            page,
            pageSize: size,
          },
          effectiveScope: { role: "Results", testIds: ["401"] },
          paging: {
            currentPage: String(page),
            totalPages: String(Math.max(1, Math.ceil(all.length / size))),
            totalResults: all.length,
            pageSize: size,
          },
          workplanTests: all.slice((page - 1) * size, page * size),
        });
      }
      if (url.includes("/PrintWorkplanReport?")) {
        posts.push(JSON.parse(options.body));
        return mode === "pdfError"
          ? new Response("<html>login</html>", {
              status: 200,
              headers: { "Content-Type": "text/html" },
            })
          : new Response("%PDF-1.4\nfixture\n%%EOF", {
              status: 200,
              headers: { "Content-Type": "application/pdf" },
            });
      }
      throw new Error("Unexpected fixture request");
    }),
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:fixture-report"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  vi.spyOn(window, "open").mockReturnValue({ opener: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("real parent, Carbon selector, query and PDF adapter preserve page 2 and print only selected current identities", async () => {
  const history = historyFor(
    "/WorkPlanByTestSection?type=unit&testSectionId=7&page=2&pageSize=10",
  );
  mount(history);
  await screen
    .findByRole("link", { name: "HMC26092800011", exact: true })
    .catch((error) => {
      console.warn("Fixture query trace", JSON.stringify(queries));
      throw error;
    });
  expect(screen.getAllByRole("checkbox")).toHaveLength(8);
  expect(queries.at(-1)).toEqual({
    queryVersion: "2",
    type: "unit",
    filterId: "7",
    page: "2",
    pageSize: "10",
  });
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(
    screen.getByRole("button", { name: "打印当前页", exact: true }),
  );
  await screen.findByText(messages["workplan.print.ready"]);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    type: "unit",
    filterId: "7",
    page: 2,
    pageSize: 10,
    pageSnapshot: "b".repeat(64),
  });
  expect(posts[0].analyses).toHaveLength(7);
  expect(posts[0].analyses.map((item) => item.analysisId)).toEqual([
    "112",
    "113",
    "114",
    "115",
    "116",
    "117",
    "118",
  ]);
  expect(posts[0].analyses[0]).toMatchObject({
    accessionNumber: "HMC26092800012",
    lastupdated: "2026-10-06T01:02:03.123456Z",
  });
  fireEvent.click(screen.getByRole("button", { name: "上一页", exact: true }));
  await screen.findByRole("link", { name: "HMC26092800001", exact: true });
  expect(screen.getAllByRole("checkbox").every((item) => !item.checked)).toBe(
    true,
  );
  expect(
    new URLSearchParams(history.location.search).get("testSectionId"),
  ).toBe("7");
  expect(new URLSearchParams(history.location.search).get("page")).toBe("1");
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["workplan.options.clear"],
      exact: true,
    }),
  );
  await screen.findByText(messages["workplan.list.idle"]);
  expect(
    screen.queryByRole("link", { name: "HMC26092800001", exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "打印当前页", exact: true }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["carbon.open.menu"],
      exact: true,
    }),
  );
  fireEvent.click(
    await screen.findByRole("option", { name: "血液学", exact: true }),
  );
  await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));
  expect(queries.at(-1)).toMatchObject({
    filterId: "8",
    page: "1",
    pageSize: "10",
  });
});
test("real response with a known missing version stays visible and must be excluded before printing other rows", async () => {
  mode = "incomplete";
  mount(
    historyFor(
      "/WorkPlanByTestSection?type=unit&testSectionId=7&page=1&pageSize=10",
    ),
  );
  await screen.findByRole("link", { name: "HMC26092800001", exact: true });
  await screen.findByText(
    messages["workplan.print.reason.INCOMPLETE_ANALYSIS_IDENTITY"],
  );
  expect(
    screen.getByRole("button", { name: "打印当前页", exact: true }),
  ).toBeDisabled();
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  expect(
    screen.getByRole("button", { name: "打印当前页", exact: true }),
  ).toBeEnabled();
  fireEvent.click(
    screen.getByRole("button", { name: "打印当前页", exact: true }),
  );
  await screen.findByText(messages["workplan.print.ready"]);
  expect(posts[0].analyses.map((item) => item.analysisId)).not.toContain("101");
  expect(posts[0].analyses.every((item) => item.lastupdated !== null)).toBe(
    true,
  );
});
test("an HTML print response never opens a PDF or reports success in the real component chain", async () => {
  mode = "pdfError";
  mount(
    historyFor(
      "/WorkPlanByTestSection?type=unit&testSectionId=7&page=1&pageSize=10",
    ),
  );
  await screen.findByRole("link", { name: "HMC26092800001", exact: true });
  fireEvent.click(
    screen.getByRole("button", { name: "打印当前页", exact: true }),
  );
  await screen.findByText(messages["workplan.print.failed"]);
  expect(window.open).not.toHaveBeenCalled();
  expect(
    screen.queryByText(messages["workplan.print.ready"]),
  ).not.toBeInTheDocument();
});

test("real priority chain displays Chinese labels while querying the actual priority enum", async () => {
  const history = historyFor("/WorkPlanByPriority?type=priority");
  mount(history, "priority");
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "优先级" })).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "展开选项", exact: true }),
  );
  fireEvent.click(screen.getByRole("option", { name: "急诊", exact: true }));
  await waitFor(() =>
    expect(
      queries.some(
        (query) => query.type === "priority" && query.filterId === "STAT",
      ),
    ).toBe(true),
  );
  await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));
  expect(history.location.search).toContain("priority=STAT");
  expect(screen.getByRole("combobox", { name: "优先级" })).toHaveValue("急诊");
});
