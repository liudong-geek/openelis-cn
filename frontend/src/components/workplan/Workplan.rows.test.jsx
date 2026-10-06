import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { within, waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import messages from "../../languages/zh.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";

const fixture = vi.hoisted(() => ({
  state: null,
  rows: [],
  child: null,
  epoch: 0,
  pdf: vi.fn(),
  legacyPrint: vi.fn(),
}));
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({ configurationProperties: {} }),
    NotificationContext: createContext({
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
      addNotification: vi.fn(),
    }),
  };
});
vi.mock("../utils/Utils", async (original) => ({
  ...(await original()),
  postToOpenElisServerForPDF: fixture.legacyPrint,
}));
vi.mock("./workplanRequest", () => ({
  workplanSessionKey: (details) => details?.owner || null,
  requestWorkplanPDF: fixture.pdf,
}));
vi.mock("./WorkplanSearchForm", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    default: (props) => {
      fixture.child = props;
      const lastFilter = useRef(null);
      useEffect(() => {
        const query = {
          type: props.type,
          filterId: fixture.state.filterId,
          pageSnapshot: fixture.state.pageSnapshot,
        };
        props.onSelectionChange?.({
          filterId: query.filterId,
          label: "血常规",
          restored:
            lastFilter.current === null ||
            lastFilter.current === query.filterId,
        });
        lastFilter.current = query.filterId;
        props.selectedValue?.(query.filterId);
        props.selectedLabel?.("血常规");
        if (props.onQueryStateChange) {
          const { page, pageSize } = props.pageRequest;
          props.onQueryStateChange({
            phase: fixture.state.phase,
            owner: props.owner,
            epoch: ++fixture.epoch,
            query,
            rows: fixture.rows.slice((page - 1) * pageSize, page * pageSize),
            paging: {
              currentPage: String(page),
              totalPages: String(
                Math.max(1, Math.ceil(fixture.rows.length / pageSize)),
              ),
              pageSize,
              totalResults: fixture.rows.length,
            },
            errorCode: fixture.state.errorCode,
          });
        } else {
          props.createTestsList({ workplanTests: fixture.rows, paging: null });
        }
      }, [
        fixture.state,
        fixture.rows,
        props.owner,
        props.pageRequest,
        props.type,
      ]);
      return null;
    },
  };
});

import { ConfigurationContext } from "../layout/Layout";
import Workplan from "./Workplan";

const row = (id = "11", extra = {}) => ({
  analysisId: id,
  sampleId: `1${id}`,
  sampleItemId: `2${id}`,
  testId: "31",
  accessionNumber: `HMC260928${id.padStart(5, "0")}`,
  statusId: "4",
  lastupdated: "2026-10-06T03:00:00.123456Z",
  rowKind: "ANALYSIS",
  groupKey: extra.groupKey ?? extra.sampleId ?? `1${id}`,
  groupLabel: "",
  canPrint: true,
  printUnavailableReason: null,
  testName: "血常规",
  receivedDate: "2026/09/28",
  patientName: "张三",
  patientInfo: "SUBJECT-1",
  nextVisitDate: "2026/10/07",
  notIncludedInWorkplan: false,
  ...extra,
});
const identities = (data) => {
  const {
    analysisId,
    sampleId,
    sampleItemId,
    testId,
    accessionNumber,
    statusId,
    lastupdated,
  } = data;
  return {
    analysisId,
    sampleId,
    sampleItemId,
    testId,
    accessionNumber,
    statusId,
    lastupdated,
  };
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const pdfBlob = () =>
  new Blob(["%PDF-1.4\nfixture"], { type: "application/pdf" });
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalLocation = `${window.location.pathname}${window.location.search}`;

beforeEach(() => {
  fixture.epoch = 0;
  fixture.pdf.mockReset().mockResolvedValue(pdfBlob());
  fixture.legacyPrint.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:workplan-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(window, "open").mockReturnValue({ opener: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", originalLocation);
  if (originalCreate)
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreate,
    });
  else delete URL.createObjectURL;
  if (originalRevoke)
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevoke,
    });
  else delete URL.revokeObjectURL;
});

function setup(rows = [row()], options = {}) {
  fixture.rows = rows;
  fixture.state = {
    phase: "success",
    filterId: "31",
    pageSnapshot: "a".repeat(64),
    ...options.state,
  };
  let owner = options.owner === undefined ? "actor-11" : options.owner;
  const history = createMemoryHistory({
    initialEntries: ["/WorkPlanByTest?type=test"],
  });
  const draw = () => (
    <Router history={history}>
      <IntlProvider locale="zh-CN" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { owner } }}
        >
          <ConfigurationContext.Provider
            value={{ configurationProperties: options.configuration || {} }}
          >
            <Workplan type={options.type || "test"} />
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>
  );
  const view = render(draw());
  return {
    ...view,
    history,
    update(next = {}) {
      if (next.rows) fixture.rows = next.rows;
      if (next.state) fixture.state = { ...fixture.state, ...next.state };
      if (Object.prototype.hasOwnProperty.call(next, "owner"))
        owner = next.owner;
      view.rerender(draw());
    },
  };
}
const ui = () => within(document.body);
const printButton = () =>
  ui().getByRole("button", {
    name: /打印当前页|打印检验工作单|workplan.print.currentPage/,
  });
const exclusions = () => ui().getAllByRole("checkbox");
const changePageSize = (size) =>
  fireEvent.change(ui().getByLabelText(messages["pagination.items-per-page"]), {
    target: { value: String(size) },
  });

test("shows the original accession number and preserves the encoded result route", () => {
  const data = row("11", { accessionNumber: "HMC26092800001" });
  const view = setup([data]);
  const link = ui().getByRole("link", { name: data.accessionNumber });
  expect(link).toHaveAttribute(
    "href",
    "/Results?accessionNumber=HMC26092800001",
  );
  expect(ui().queryByText("HM-C26092-800-001")).toBeNull();
  fireEvent.click(link);
  expect(view.history.location.pathname).toBe("/Results");
  expect(view.history.location.search).toBe("?accessionNumber=HMC26092800001");
});

test("keeps spaces and special characters in the raw accession and encodes only the route", () => {
  const value = "26 001/A&x=2";
  const view = setup([row("11", { accessionNumber: value })]);
  fireEvent.click(ui().getByRole("link", { name: value }));
  expect(view.history.location.search).toBe(
    "?accessionNumber=26%20001%2FA%26x%3D2",
  );
});

test("excludes the real eleventh analysis on page two without mutating any server row", () => {
  const data = Array.from({ length: 11 }, (_, index) => row(String(index + 1)));
  setup(data);
  changePageSize(10);
  fireEvent.click(ui().getByRole("button", { name: "下一页" }));
  expect(exclusions()).toHaveLength(1);
  fireEvent.click(exclusions()[0]);
  expect(exclusions()[0]).toBeChecked();
  expect(data[0].notIncludedInWorkplan).toBe(false);
  expect(data[10].notIncludedInWorkplan).toBe(false);
  expect(printButton()).toBeDisabled();
});

test("uses a single controlled API page and the real total for Chinese Carbon pagination", () => {
  setup(Array.from({ length: 53 }, (_, index) => row(String(index + 1))));
  expect(exclusions()).toHaveLength(50);
  expect(ui().getByRole("combobox", { name: "页码，共2页" })).toBeVisible();
  expect(ui().getByText("第 1–50 项，共 53 项")).toBeVisible();
  expect(
    [...ui().getByLabelText("每页显示").options].map((item) =>
      Number(item.value),
    ),
  ).toEqual([10, 20, 50, 100]);
  fireEvent.click(ui().getByRole("button", { name: "下一页" }));
  expect(fixture.child.pageRequest).toEqual({ page: 2, pageSize: 50 });
  expect(exclusions()).toHaveLength(3);
  expect(ui().getByText("第 51–53 项，共 53 项")).toBeVisible();
  changePageSize(20);
  expect(fixture.child.pageRequest).toEqual({ page: 1, pageSize: 20 });
  expect(exclusions()).toHaveLength(20);
});

test("prints only the included real analysis identities from the current API page", async () => {
  const shared = {
    sampleId: "71",
    accessionNumber: "HMC26092800001",
    testName: "血常规",
  };
  const first = Object.freeze(row("11", { ...shared, sampleItemId: "81" }));
  const second = Object.freeze(row("12", { ...shared, sampleItemId: "82" }));
  setup([first, second]);
  fireEvent.click(exclusions()[0]);
  fireEvent.click(printButton());
  expect(fixture.pdf).toHaveBeenCalledTimes(1);
  expect(fixture.pdf).toHaveBeenCalledWith(
    {
      type: "test",
      filterId: "31",
      page: 1,
      pageSize: 50,
      pageSnapshot: "a".repeat(64),
      analyses: [identities(second)],
    },
    expect.any(AbortSignal),
    "actor-11",
  );
  await waitFor(() =>
    expect(window.open).toHaveBeenCalledWith("blob:workplan-test", "_blank"),
  );
  expect(first.notIncludedInWorkplan).toBe(false);
  expect(second.notIncludedInWorkplan).toBe(false);
});

test.each(["loading", "error", "idle"])(
  "does not expose or print old clinical rows during %s",
  (phase) => {
    const view = setup();
    view.update({ state: { phase } });
    expect(
      ui().queryByRole("link", { name: row().accessionNumber }),
    ).toBeNull();
    expect(ui().queryByRole("checkbox")).toBeNull();
    expect(printButton()).toBeDisabled();
    fireEvent.click(printButton());
    expect(fixture.pdf).not.toHaveBeenCalled();
    expect(fixture.legacyPrint).not.toHaveBeenCalled();
    expect(ui().queryByText(messages["result.noTestsFound"])).toBeNull();
  },
);

test.each(["timeout", "forbidden", "unauthenticated", "scope"])(
  "shows the specific query failure reason for %s without displaying old rows",
  (errorCode) => {
    const view = setup();
    view.update({ state: { phase: "error", errorCode } });
    expect(
      ui().getByText(messages[`workplan.query.${errorCode}`]),
    ).toBeVisible();
    expect(ui().queryByRole("checkbox")).toBeNull();
    expect(printButton()).toBeDisabled();
    expect(ui().queryByText(messages["result.noTestsFound"])).toBeNull();
  },
);

test("clears the exclusions when the same analyses are reordered or refreshed", () => {
  const first = row("11");
  const second = row("12");
  const view = setup([first, second]);
  fireEvent.click(exclusions()[0]);
  expect(exclusions()[0]).toBeChecked();
  view.update({ rows: [second, first] });
  expect(exclusions().every((item) => !item.checked)).toBe(true);
});

test.each([
  ["condition", { state: { filterId: "32" } }],
  ["actor", { owner: "actor-12" }],
  ["missing actor", { owner: null }],
])(
  "clears selections and cancels a pending PDF when the %s changes",
  async (_label, next) => {
    const pending = deferred();
    fixture.pdf.mockReturnValue(pending.promise);
    const view = setup([row("11"), row("12")]);
    fireEvent.click(exclusions()[0]);
    fireEvent.click(printButton());
    const signal = fixture.pdf.mock.calls[0][1];
    view.update(next);
    expect(signal.aborted).toBe(true);
    if (next.owner !== null)
      expect(exclusions().every((item) => !item.checked)).toBe(true);
    await act(async () => pending.resolve(pdfBlob()));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  },
);

test("ignores an old query callback after the selected condition changes", () => {
  const view = setup();
  const old = {
    phase: "success",
    owner: "actor-11",
    epoch: 1,
    query: { type: "test", filterId: "31", pageSnapshot: "a".repeat(64) },
    rows: [row("99")],
    paging: { currentPage: 1, totalPages: 1, pageSize: 50, totalResults: 1 },
  };
  view.update({ state: { filterId: "32" } });
  act(() => fixture.child.onQueryStateChange(old));
  expect(
    ui().queryByRole("link", { name: row("99").accessionNumber }),
  ).toBeNull();
});

test("allows a read-only row to remain visible but requires explicit exclusion before printing other rows", () => {
  setup([
    row("11", { canPrint: false, printUnavailableReason: "INACTIVE_STATUS" }),
    row("12"),
  ]);
  expect(exclusions()).toHaveLength(2);
  expect(printButton()).toBeDisabled();
  expect(ui().getByRole("link", { name: row().accessionNumber })).toBeVisible();
  expect(
    ui().getByText(messages["workplan.print.reason.INACTIVE_STATUS"]),
  ).toBeVisible();
  fireEvent.click(exclusions()[0]);
  expect(printButton()).toBeEnabled();
});

test.each([
  ["missing analysis", { analysisId: "" }],
  ["missing version", { lastupdated: "" }],
  ["wrong row kind", { rowKind: "GROUP" }],
])(
  "fails closed for %s rather than fabricating an identity",
  (_label, extra) => {
    setup([row("11", extra)]);
    expect(printButton()).toBeDisabled();
    expect(exclusions()[0]).toBeDisabled();
    expect(fixture.pdf).not.toHaveBeenCalled();
  },
);

test("fails closed for duplicate analysis IDs even if the lab number or tube differs", () => {
  setup([row("11"), row("11", { sampleItemId: "999" })]);
  expect(printButton()).toBeDisabled();
  expect(exclusions().every((item) => item.disabled)).toBe(true);
});

test("renders the Haiti group label as an unselectable header and counts only analyses", () => {
  setup(
    [
      row("11", { groupKey: "111", groupLabel: "张三 / 受试者1" }),
      row("12", {
        groupKey: "111",
        groupLabel: "张三 / 受试者1",
        sampleId: "111",
      }),
    ],
    {
      type: "panel",
      configuration: {
        SUBJECT_ON_WORKPLAN: "true",
        NEXT_VISIT_DATE_ON_WORKPLAN: "true",
      },
    },
  );
  const group = ui().getByText("张三 / 受试者1").closest("tr");
  expect(within(group).queryByRole("checkbox")).toBeNull();
  expect(exclusions()).toHaveLength(2);
  expect(ui().getByText("共 2 项，当前第 1 页显示 2 项")).toBeVisible();
  expect(
    ui().getByRole("columnheader", {
      name: messages["patient.subject.number"],
    }),
  ).toBeVisible();
  expect(
    ui().getByRole("columnheader", {
      name: messages["sample.entry.nextVisit.date"],
    }),
  ).toBeVisible();
});

test("prints the original raw accession in the identity snapshot", () => {
  const data = row("11", { accessionNumber: "HMC26092800001" });
  setup([data]);
  fireEvent.click(printButton());
  expect(fixture.pdf.mock.calls[0][0].analyses[0].accessionNumber).toBe(
    data.accessionNumber,
  );
  expect(Object.keys(fixture.pdf.mock.calls[0][0].analyses[0]).sort()).toEqual(
    [
      "analysisId",
      "sampleId",
      "sampleItemId",
      "testId",
      "accessionNumber",
      "statusId",
      "lastupdated",
    ].sort(),
  );
});

test("locks printing against repeated clicks and stops if exclusions change", async () => {
  const pending = deferred();
  fixture.pdf.mockReturnValue(pending.promise);
  setup([row("11"), row("12")]);
  fireEvent.click(printButton());
  fireEvent.click(printButton());
  expect(fixture.pdf).toHaveBeenCalledTimes(1);
  expect(printButton()).toBeDisabled();
  fireEvent.click(exclusions()[0]);
  expect(fixture.pdf.mock.calls[0][1].aborted).toBe(true);
  await act(async () => pending.resolve(pdfBlob()));
  expect(window.open).not.toHaveBeenCalled();
});

test("has a bounded print timeout and ignores a late PDF", async () => {
  vi.useFakeTimers();
  const pending = deferred();
  fixture.pdf.mockReturnValue(pending.promise);
  setup();
  fireEvent.click(printButton());
  await act(async () => vi.advanceTimersByTime(20_000));
  expect(fixture.pdf.mock.calls[0][1].aborted).toBe(true);
  expect(ui().getByText(messages["workplan.print.timeout"])).toBeVisible();
  expect(printButton()).toBeEnabled();
  await act(async () => pending.resolve(pdfBlob()));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test("reports print failure without a PDF success or object URL", async () => {
  fixture.pdf.mockRejectedValue(new Error("service failure"));
  setup();
  fireEvent.click(printButton());
  await waitFor(() =>
    expect(ui().getByText(messages["workplan.print.failed"])).toBeVisible(),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(ui().queryByText(messages["workplan.print.ready"])).toBeNull();
});

test("reports a blocked PDF window and revokes its unused object URL", async () => {
  window.open.mockReturnValue(null);
  setup();
  fireEvent.click(printButton());
  await waitFor(() =>
    expect(ui().getByText(messages["workplan.print.openFailed"])).toBeVisible(),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:workplan-test");
});

test.each(["window open", "opener isolation"])(
  "revokes the generated object URL when %s throws",
  async (failure) => {
    if (failure === "window open") {
      window.open.mockImplementation(() => {
        throw new Error("blocked window");
      });
    } else {
      window.open.mockReturnValue({
        set opener(_value) {
          throw new Error("unavailable opener");
        },
      });
    }
    setup();
    fireEvent.click(printButton());
    await waitFor(() =>
      expect(
        ui().getByText(messages["workplan.print.openFailed"]),
      ).toBeVisible(),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:workplan-test");
    expect(ui().queryByText(messages["workplan.print.ready"])).toBeNull();
  },
);

test("cancels an unmounted print and ignores the late PDF", async () => {
  const pending = deferred();
  fixture.pdf.mockReturnValue(pending.promise);
  const view = setup();
  fireEvent.click(printButton());
  const signal = fixture.pdf.mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(pdfBlob()));
  expect(window.open).not.toHaveBeenCalled();
});

test("cleans up the successful PDF object URL when the workplan unmounts", async () => {
  const view = setup();
  fireEvent.click(printButton());
  await waitFor(() => expect(window.open).toHaveBeenCalledTimes(1));
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:workplan-test");
});

test("restores a valid URL page without the initial condition resetting it", () => {
  window.history.replaceState(
    {},
    "",
    "/WorkPlanByTest?testId=31&page=2&pageSize=10",
  );
  setup(Array.from({ length: 11 }, (_, index) => row(String(index + 1))));
  expect(fixture.child.pageRequest).toEqual({ page: 2, pageSize: 10 });
  expect(exclusions()).toHaveLength(1);
  expect(
    ui().getByRole("link", { name: row("11").accessionNumber }),
  ).toBeVisible();
});

test.each([
  "page=0&pageSize=30",
  "page=-1&pageSize=abc",
  "page=999999999999999999999&pageSize=0",
])("rejects invalid URL pagination: %s", (parameters) => {
  window.history.replaceState(
    {},
    "",
    `/WorkPlanByTest?testId=31&${parameters}`,
  );
  setup();
  expect(fixture.child.pageRequest).toEqual({ page: 1, pageSize: 50 });
});

test("retries the identical query with a new controlled request object", () => {
  setup([row()], { state: { phase: "error" } });
  const previous = fixture.child.pageRequest;
  const epoch = fixture.epoch;
  fireEvent.click(
    ui().getByRole("button", { name: messages["workplan.query.retry"] }),
  );
  expect(fixture.child.pageRequest).toEqual(previous);
  expect(fixture.child.pageRequest).not.toBe(previous);
  expect(fixture.epoch).toBeGreaterThan(epoch);
});

test("aborts a pending PDF if the current row version changes within the same query epoch", async () => {
  const pending = deferred();
  fixture.pdf.mockReturnValue(pending.promise);
  setup();
  fireEvent.click(printButton());
  const signal = fixture.pdf.mock.calls[0][1];
  act(() =>
    fixture.child.onQueryStateChange({
      phase: "success",
      owner: "actor-11",
      epoch: fixture.epoch,
      query: { type: "test", filterId: "31", pageSnapshot: "a".repeat(64) },
      rows: [row("11", { lastupdated: "2026-10-06T03:00:01.123456Z" })],
      paging: {
        currentPage: "1",
        totalPages: "1",
        pageSize: 50,
        totalResults: 1,
      },
    }),
  );
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(pdfBlob()));
  expect(window.open).not.toHaveBeenCalled();
});

test.each([
  ["missing", undefined],
  ["empty", ""],
  ["incorrect length", "a".repeat(63)],
  ["non-hexadecimal", "g".repeat(64)],
])(
  "does not print a current page with a %s page snapshot",
  (_label, pageSnapshot) => {
    setup([row()], { state: { pageSnapshot } });
    expect(
      ui().getByRole("link", { name: row().accessionNumber }),
    ).toBeVisible();
    expect(printButton()).toBeDisabled();
    fireEvent.click(printButton());
    expect(fixture.pdf).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  },
);

test("aborts a pending PDF when the complete-page snapshot changes despite unchanged visible identities", async () => {
  const pending = deferred();
  fixture.pdf.mockReturnValue(pending.promise);
  setup();
  fireEvent.click(printButton());
  const [payload, signal] = fixture.pdf.mock.calls[0];
  expect(payload.pageSnapshot).toBe("a".repeat(64));
  act(() =>
    fixture.child.onQueryStateChange({
      phase: "success",
      owner: "actor-11",
      epoch: fixture.epoch,
      query: { type: "test", filterId: "31", pageSnapshot: "b".repeat(64) },
      rows: [row()],
      paging: {
        currentPage: "1",
        totalPages: "1",
        pageSize: 50,
        totalResults: 1,
      },
    }),
  );
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(pdfBlob()));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(window.open).not.toHaveBeenCalled();
});

test("keeps a known missing-version analysis visible and explicitly excludable before printing the complete identity", () => {
  const readOnly = Object.freeze(
    row("11", {
      lastupdated: null,
      canPrint: false,
      printUnavailableReason: "INCOMPLETE_ANALYSIS_IDENTITY",
    }),
  );
  const complete = Object.freeze(row("12"));
  setup([readOnly, complete]);
  expect(
    ui().getByRole("link", { name: readOnly.accessionNumber }),
  ).toBeVisible();
  expect(
    ui().getByText(
      messages["workplan.print.reason.INCOMPLETE_ANALYSIS_IDENTITY"],
    ),
  ).toBeVisible();
  expect(ui().queryByText(messages["workplan.identity.invalid"])).toBeNull();
  expect(printButton()).toBeDisabled();
  expect(exclusions()[0]).toBeEnabled();
  expect(exclusions()[0].id).toBe("workplan-exclude-11");
  fireEvent.click(exclusions()[0]);
  expect(exclusions()[0]).toBeChecked();
  expect(printButton()).toBeEnabled();
  fireEvent.click(printButton());
  expect(fixture.pdf).toHaveBeenCalledWith(
    {
      type: "test",
      filterId: "31",
      page: 1,
      pageSize: 50,
      pageSnapshot: "a".repeat(64),
      analyses: [identities(complete)],
    },
    expect.any(AbortSignal),
    "actor-11",
  );
  expect(readOnly.lastupdated).toBeNull();
  expect(readOnly.notIncludedInWorkplan).toBe(false);
});

test("shows a neutral missing accession with no fabricated result link and allows explicit exclusion", () => {
  setup([
    row("11", {
      accessionNumber: null,
      canPrint: false,
      printUnavailableReason: "INCOMPLETE_ANALYSIS_IDENTITY",
    }),
    row("12"),
  ]);
  const missing = exclusions()[0].closest("tr");
  expect(within(missing).queryByRole("link")).toBeNull();
  expect(within(missing).getByText("—")).toBeVisible();
  expect(exclusions()[0]).toHaveAccessibleName("从打印中排除 — 的 血常规");
  expect(printButton()).toBeDisabled();
  fireEvent.click(exclusions()[0]);
  expect(printButton()).toBeEnabled();
  fireEvent.click(printButton());
  expect(fixture.pdf.mock.calls[0][0].analyses).toEqual([
    identities(row("12")),
  ]);
});

test.each([
  ["forbidden", "workplan.print.forbidden"],
  ["changed", "workplan.print.changed"],
  ["scope", "workplan.print.scopeChanged"],
  ["unauthenticated", "workplan.query.unauthenticated"],
])(
  "requires a fresh query after the server rejects printing with %s",
  async (kind, messageId) => {
    fixture.pdf.mockRejectedValue(Object.assign(new Error(kind), { kind }));
    setup([row("11"), row("12")]);
    fireEvent.click(exclusions()[0]);
    const previous = fixture.child.pageRequest;
    fireEvent.click(printButton());
    await waitFor(() =>
      expect(ui().getByText(messages[messageId])).toBeVisible(),
    );
    expect(ui().queryByRole("checkbox")).toBeNull();
    expect(
      ui().queryByRole("link", { name: row("12").accessionNumber }),
    ).toBeNull();
    expect(printButton()).toBeDisabled();
    fireEvent.click(printButton());
    expect(fixture.pdf).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(ui().queryByText(messages["workplan.print.ready"])).toBeNull();
    expect(ui().queryByText(messages["result.noTestsFound"])).toBeNull();
    fireEvent.click(
      ui().getByRole("button", { name: messages["workplan.query.retry"] }),
    );
    expect(fixture.child.pageRequest).not.toBe(previous);
    expect(fixture.child.pageRequest).toEqual(previous);
    expect(exclusions().every((item) => !item.checked)).toBe(true);
  },
);

test("does not create a whitespace text node in the real Carbon table body for empty group labels", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  setup([row("11", { groupLabel: "" }), row("12", { groupLabel: "" })]);
  expect(exclusions()).toHaveLength(2);
  expect(
    errors.mock.calls.filter(
      (args) =>
        args.some((value) => String(value).includes("validateDOMNesting")) &&
        args.some((value) => String(value).includes("tbody")),
    ),
  ).toEqual([]);
});
