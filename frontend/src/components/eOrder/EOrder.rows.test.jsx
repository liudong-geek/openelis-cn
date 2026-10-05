import React, { useEffect, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor, within } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/zh.json";

vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({ configurationProperties: {} }),
  };
});

import { ConfigurationContext } from "../layout/Layout";
import EOrder from "./EOrder";

const scope = {
  phase: "success",
  kind: "pending",
  owner: "actor-11-session-1-reception",
  epoch: 1,
  pageSize: 10,
  paging: { currentPage: 1, totalPages: 1, pageSize: 10 },
};
const order = (id = "11", patientLastName = "甲", extra = {}) => ({
  id,
  electronicOrderId: id,
  externalOrderId: `EXT-${id}`,
  patientLastName,
  statusId: "status-entered",
  statusCode: "ENTERED",
  status: "已录入",
  canReceive: true,
  actionUnavailableReason: null,
  warningCodes: [],
  labNo: "",
  ...extra,
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
};

function Harness({
  orders,
  state,
  capture,
  readAction,
  onReviewOrder,
  onPageChange,
  configuration = {},
}) {
  const [rows, setRows] = useState(orders);
  useEffect(() => setRows(orders), [orders]);
  capture.current = rows;
  return (
    <IntlProvider locale="zh-CN" messages={messages}>
      <ConfigurationContext.Provider
        value={{ configurationProperties: configuration }}
      >
        <EOrder
          eOrders={rows}
          setEOrders={setRows}
          eOrderRef={{ current: null }}
          queryState={state}
          readAction={readAction}
          onReviewOrder={onReviewOrder}
          onPageChange={onPageChange}
        />
      </ConfigurationContext.Provider>
    </IntlProvider>
  );
}

function setup(orders = [order()], options = {}) {
  const capture = { current: [] };
  let props = {
    orders,
    state: { ...scope, totalResults: orders.length },
    readAction: vi
      .fn()
      .mockResolvedValue({ status: true, body: "generated-1" }),
    onReviewOrder: vi.fn(),
    onPageChange: vi.fn(),
    capture,
    ...options,
  };
  const view = render(<Harness {...props} />);
  return {
    ...view,
    capture,
    readAction: props.readAction,
    onReviewOrder: props.onReviewOrder,
    onPageChange: props.onPageChange,
    update(next) {
      props = { ...props, ...next };
      view.rerender(<Harness {...props} />);
    },
  };
}

function mainRow(patient = "甲") {
  return within(screen.getByRole("cell", { name: patient }).closest("tr"));
}

function reviewButton(patient = "甲") {
  return mainRow(patient).getByRole("button", { name: "核对并接收" });
}

function expand(patient = "甲") {
  const button = mainRow(patient).getByRole("button", { name: "展开当前行" });
  const target = document.getElementById(button.getAttribute("aria-controls"));
  expect(target).not.toBeVisible();
  fireEvent.click(button);
  expect(target).toBeVisible();
  expect(button).toHaveAttribute("aria-label", "收起当前行");
  return within(target);
}

test("uses the received semantic and capability instead of localized status text", () => {
  const data = order("11", "甲", {
    status: "已实现",
    statusCode: "REALIZED",
    canReceive: false,
    actionUnavailableReason: "NOT_PENDING",
  });
  const view = setup([data]);
  expect(screen.getByRole("cell", { name: "已接收" })).toBeVisible();
  const details = expand();
  expect(reviewButton()).toBeDisabled();
  expect(details.getByRole("button", { name: "生成" })).toBeDisabled();
  expect(details.getByRole("textbox")).toBeDisabled();
  fireEvent.click(reviewButton());
  expect(view.onReviewOrder).not.toHaveBeenCalled();
  expect(view.readAction).not.toHaveBeenCalled();
  expect(data.status).toBe("已实现");
});

test.each([
  ["missing capability", { canReceive: undefined }],
  ["unknown semantic", { statusCode: "UNKNOWN" }],
  ["cancelled semantic", { statusCode: "CANCELLED" }],
  ["missing status identity", { statusId: undefined }],
  ["wrong business ID", { electronicOrderId: "12" }],
  ["missing external identity", { externalOrderId: "" }],
])("fails closed for %s", (_label, extra) => {
  setup([order("11", "甲", extra)]);
  const details = expand();
  expect(reviewButton()).toBeDisabled();
  expect(details.getByRole("button", { name: "生成" })).toBeDisabled();
});

test("requires the current query actor before any row action", () => {
  const view = setup([order()], { state: { ...scope, owner: undefined } });
  const details = expand();
  expect(details.getByRole("button", { name: "生成" })).toBeDisabled();
  expect(reviewButton()).toBeDisabled();
  expect(view.readAction).not.toHaveBeenCalled();
});

test("keeps distinct label and expansion targets for multiple ALPHANUM rows and clears raw input", async () => {
  const view = setup(
    [order("11", "甲", { labNo: "AB1234" }), order("12", "乙")],
    { configuration: { AccessionFormat: "ALPHANUM" } },
  );
  const first = expand("甲").getByRole("textbox");
  const second = expand("乙").getByRole("textbox");
  expect(first.id).not.toBe(second.id);
  expect(document.querySelectorAll("[id]").length).toBe(
    new Set([...document.querySelectorAll("[id]")].map((item) => item.id)).size,
  );
  fireEvent.change(first, { target: { value: "" } });
  await waitFor(() => expect(view.capture.current[0].labNo).toBe(""));
  expect(first).toHaveValue("");
  expect(second).toHaveValue("");
});

test("opens only the existing manual review contract with the current exact draft", () => {
  const data = order("11", "甲", {
    externalOrderId: "EXT A&extra=1",
    labNo: "LAB A&extra=2",
  });
  const view = setup([data]);
  const details = expand();
  expect(details.getByText(messages["eorder.action.manualSave"])).toBeVisible();
  expect(details.queryByRole("button", { name: "修改申请" })).toBeNull();
  fireEvent.click(reviewButton());
  expect(view.onReviewOrder).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      electronicOrderId: "11",
      externalOrderId: "EXT A&extra=1",
      statusCode: "ENTERED",
    }),
    "LAB A&extra=2",
    {
      signal: expect.any(AbortSignal),
      owner: scope.owner,
      epoch: scope.epoch,
    },
  );
  expect(view.readAction).not.toHaveBeenCalled();
});

test("generates once and applies a late response by business ID after reordering without mutating originals", async () => {
  const pending = deferred();
  const first = Object.freeze(order("11", "甲"));
  const second = Object.freeze(order("12", "乙"));
  const view = setup([first, second], {
    readAction: vi.fn().mockReturnValue(pending.promise),
  });
  const generate = expand().getByRole("button", { name: "生成" });
  fireEvent.click(generate);
  fireEvent.click(generate);
  expect(generate).toBeDisabled();
  expect(view.readAction).toHaveBeenCalledExactlyOnceWith(
    "/rest/SampleEntryGenerateScanProvider",
    expect.any(AbortSignal),
    scope.owner,
    first,
  );
  view.update({ orders: [second, first] });
  await act(async () => pending.resolve({ status: true, body: "LAB-GEN-11" }));
  expect(view.capture.current.find((item) => item.id === "11").labNo).toBe(
    "LAB-GEN-11",
  );
  expect(view.capture.current.find((item) => item.id === "12").labNo).toBe("");
  expect(first.labNo).toBe("");
  expect(second.labNo).toBe("");
});

test.each([
  ["query epoch", { ...scope, epoch: 2 }],
  ["actor", { ...scope, owner: "actor-12-session-2-reception" }],
  ["loading", { ...scope, phase: "loading" }],
])(
  "discards generated numbers after changing %s",
  async (_label, nextState) => {
    const pending = deferred();
    const view = setup([order()], {
      readAction: vi.fn().mockReturnValue(pending.promise),
    });
    fireEvent.click(expand().getByRole("button", { name: "生成" }));
    const signal = view.readAction.mock.calls[0][1];
    view.update({ state: { ...nextState, totalResults: 1 } });
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ status: true, body: "OLD-GENERATED" }),
    );
    expect(view.capture.current[0].labNo).toBe("");
  },
);

test.each([
  ["external identity", { externalOrderId: "EXT-REPLACED" }],
  ["capability", { canReceive: false }],
  ["draft", { labNo: "NEW-DRAFT" }],
])(
  "discards generated numbers after replacing a row's %s",
  async (_label, extra) => {
    const pending = deferred();
    const view = setup([order()], {
      readAction: vi.fn().mockReturnValue(pending.promise),
    });
    fireEvent.click(expand().getByRole("button", { name: "生成" }));
    const signal = view.readAction.mock.calls[0][1];
    view.update({ orders: [order("11", "甲", extra)] });
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ status: true, body: "OLD-GENERATED" }),
    );
    expect(view.capture.current[0].labNo).toBe(extra.labNo ?? "");
  },
);

test("Enter validates an encoded current number without consuming the generation counter", async () => {
  const view = setup([order("11", "甲", { labNo: "LAB A&b=中?" })]);
  const input = expand().getByRole("textbox");
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(view.readAction).toHaveBeenCalledTimes(1));
  const [url, signal, owner, snapshot] = view.readAction.mock.calls[0];
  const parsed = new URL(url, "http://test.invalid");
  expect(parsed.pathname).toBe("/rest/SampleEntryAccessionNumberValidation");
  expect(parsed.searchParams.get("accessionNumber")).toBe("LAB A&b=中?");
  expect(parsed.searchParams.get("ignoreYear")).toBe("false");
  expect(parsed.searchParams.get("ignoreUsage")).toBe("false");
  expect(parsed.searchParams.get("field")).toBe("labNo");
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(owner).toBe(scope.owner);
  expect(snapshot).toMatchObject({
    id: "11",
    electronicOrderId: "11",
    externalOrderId: "EXT-11",
    statusId: "status-entered",
    statusCode: "ENTERED",
    canReceive: true,
    labNo: "LAB A&b=中?",
  });
  expect(view.capture.current[0].labNo).toBe("LAB A&b=中?");
});

test("does not show a stale validation error after editing the current draft", async () => {
  const pending = deferred();
  const view = setup([order("11", "甲", { labNo: "OLD" })], {
    readAction: vi.fn().mockReturnValue(pending.promise),
  });
  const input = expand().getByRole("textbox");
  fireEvent.focusOut(input);
  fireEvent.change(input, { target: { value: "NEW" } });
  expect(view.readAction.mock.calls[0][1].aborted).toBe(true);
  await act(async () =>
    pending.resolve({ status: false, body: "old invalid" }),
  );
  expect(screen.queryByText(messages["eorder.number.invalid"])).toBeNull();
  expect(screen.getByRole("button", { name: "核对并接收" })).toBeEnabled();
  expect(view.capture.current[0].labNo).toBe("NEW");
});

test("keeps known invalid-number feedback until a new valid draft is checked", async () => {
  const view = setup([order("11", "甲", { labNo: "INVALID" })], {
    readAction: vi
      .fn()
      .mockResolvedValueOnce({ status: false, body: "SAMPLE_FOUND" })
      .mockResolvedValueOnce({ status: true, body: "Valid accession number" }),
  });
  const input = expand().getByRole("textbox");
  fireEvent.focusOut(input);
  await waitFor(() =>
    expect(screen.getByText(messages["eorder.number.invalid"])).toBeVisible(),
  );
  expect(screen.getByRole("button", { name: "核对并接收" })).toBeDisabled();
  expect(screen.queryByText("SAMPLE_FOUND")).toBeNull();
  fireEvent.change(input, { target: { value: "VALID" } });
  fireEvent.focusOut(input);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "核对并接收" })).toBeEnabled(),
  );
  expect(view.readAction).toHaveBeenCalledTimes(2);
});

test.each([undefined, { status: true }, { status: false, body: "failed" }])(
  "reports an unconfirmed generation outcome without changing the draft: %s",
  async (response) => {
    const view = setup([order("11", "甲", { labNo: "KEEP" })], {
      readAction: vi.fn().mockResolvedValue(response),
    });
    fireEvent.click(expand().getByRole("button", { name: "生成" }));
    await waitFor(() =>
      expect(
        screen.getByText(messages["eorder.number.generateFailed"]),
      ).toBeVisible(),
    );
    expect(view.capture.current[0].labNo).toBe("KEEP");
    expect(screen.getByRole("button", { name: "核对并接收" })).toBeDisabled();
  },
);

test("renders the current server page once and delegates controlled paging without local sorting", () => {
  const view = setup(
    [order("11", "甲"), order("12", "乙"), order("13", "丙")],
    {
      state: {
        ...scope,
        totalResults: 23,
        paging: { currentPage: 2, totalPages: 3, pageSize: 10 },
      },
    },
  );
  expect(screen.getByText("共 23 份申请")).toBeVisible();
  for (const patient of ["甲", "乙", "丙"])
    expect(screen.getByRole("cell", { name: patient })).toBeVisible();
  expect(
    within(screen.getAllByRole("row")[0]).queryAllByRole("button"),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(view.onPageChange).toHaveBeenCalledWith({ page: 3, pageSize: 10 });
  const sizeSelector = screen.getByLabelText(
    messages["pagination.items-per-page"],
  );
  expect(
    [...sizeSelector.options].map((option) => Number(option.value)),
  ).toEqual([10, 20, 50, 100]);
  fireEvent.change(sizeSelector, { target: { value: "20" } });
  expect(view.onPageChange).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
});

test.each([1, 3])(
  "localizes the real Carbon page selector and all pagination labels for %s pages",
  (totalPages) => {
    setup([order()], {
      state: {
        ...scope,
        totalResults: totalPages === 1 ? 1 : 23,
        paging: { ...scope.paging, totalPages },
      },
    });
    const pageLabel = `页码，共${totalPages}页`;
    const controls = within(document.body);
    expect(controls.getByRole("combobox", { name: pageLabel })).toBeVisible();
    expect(screen.getByText(pageLabel)).toBeInTheDocument();
    expect(screen.getByText(`共 ${totalPages} 页`)).toBeVisible();
    expect(
      controls.getByRole("combobox", {
        name: messages["pagination.items-per-page"],
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "上一页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeInTheDocument();
    expect(screen.queryByText(/Page of \d+ pages?/)).toBeNull();
  },
);

test("shows neutral placeholders for missing facility and test without changing the order", () => {
  const data = order("11", "甲", {
    requestingFacility: " ",
    testName: null,
  });
  setup([data]);
  expect(mainRow().getAllByRole("cell", { name: "—" })).toHaveLength(2);
  expect(data.requestingFacility).toBe(" ");
  expect(data.testName).toBeNull();
});

test.each(["loading", "error", "idle"])(
  "does not expose old clinical rows or an empty-success message while %s",
  (phase) => {
    setup([order()], { state: { ...scope, phase } });
    expect(screen.queryByRole("cell", { name: "甲" })).toBeNull();
    expect(screen.queryByText("未找到电子检验申请")).toBeNull();
    expect(screen.queryByText("共 1 份申请")).toBeNull();
    expect(screen.getByRole("table")).toBeVisible();
    if (phase === "error")
      expect(screen.getByText(messages["eorder.search.failed"])).toBeVisible();
    if (phase === "idle")
      expect(screen.getByText(messages["eorder.list.idle"])).toBeVisible();
  },
);

test.each(["FHIR_DETAILS_UNAVAILABLE", "SOURCE_IDENTITY_UNCONFIRMED"])(
  "keeps the %s warning visible while allowing explicit manual review",
  (warning) => {
    const view = setup([order("11", "甲", { warningCodes: [warning] })]);
    const details = expand();
    expect(
      details.getByText(messages[`eorder.warning.${warning}`]),
    ).toBeVisible();
    expect(reviewButton()).toBeEnabled();
    fireEvent.click(reviewButton());
    expect(view.onReviewOrder).toHaveBeenCalledTimes(1);
  },
);

test("shows the confirmed source identity mismatch warning and the disabled main-row reason", () => {
  const view = setup([
    order("11", "甲", {
      canReceive: false,
      actionUnavailableReason: "INCOMPLETE_ORDER_DATA",
      warningCodes: ["SOURCE_IDENTITY_MISMATCH"],
    }),
  ]);
  expect(reviewButton()).toBeDisabled();
  expect(
    mainRow().getByText(
      messages["eorder.actionUnavailable.INCOMPLETE_ORDER_DATA"],
    ),
  ).toBeVisible();
  expect(
    expand().getByText(messages["eorder.warning.SOURCE_IDENTITY_MISMATCH"]),
  ).toBeVisible();
  fireEvent.click(reviewButton());
  expect(view.onReviewOrder).not.toHaveBeenCalled();
});

test("renders eight primary columns with a Chinese patient name and keeps secondary identifiers in the expanded details", () => {
  const view = setup([
    order("11", "张", {
      patientFirstName: " 三 ",
      requestDateDisplay: "2026-10-06",
      requestingFacility: "第一医院",
      testName: "血常规",
      priority: "Routine",
      patientNationalId: "NATIONAL-123",
      passportNumber: "PASSPORT-456",
      subjectNumber: "SUBJECT-789",
      referringLabNumber: "REFERRING-123",
      labNumber: "LOCAL-456",
    }),
  ]);
  const header = screen.getAllByRole("row")[0];
  const columnHeaders = within(header).getAllByRole("columnheader");
  expect(columnHeaders).toHaveLength(9);
  expect(columnHeaders.slice(1).map((cell) => cell.textContent)).toEqual([
    messages["eorder.requestDate"],
    messages["eorder.patient"],
    messages["eorder.externalOrderNumber"],
    messages["eorder.facility.requesting"],
    messages["eorder.test.name"],
    messages["eorder.priority"],
    messages["eorder.status"],
    messages["eorder.operations"],
  ]);
  expect(mainRow("张三").getAllByRole("cell")).toHaveLength(9);
  for (const value of ["2026-10-06", "EXT-11", "第一医院", "血常规"])
    expect(mainRow("张三").getByRole("cell", { name: value })).toBeVisible();
  for (const value of [
    "NATIONAL-123",
    "PASSPORT-456",
    "SUBJECT-789",
    "REFERRING-123",
    "LOCAL-456",
  ])
    expect(screen.queryByText(value)).toBeNull();
  expect(reviewButton("张三")).toBeEnabled();
  expect(screen.getAllByRole("button", { name: "核对并接收" })).toHaveLength(1);
  fireEvent.click(reviewButton("张三"));
  expect(view.onReviewOrder).toHaveBeenCalledTimes(1);
  const details = expand("张三");
  for (const [key, value] of [
    ["eorder.id.national", "NATIONAL-123"],
    ["eorder.passport.number", "PASSPORT-456"],
    ["eorder.id.subjectNumber", "SUBJECT-789"],
    ["eorder.labnumber.referring", "REFERRING-123"],
    ["eorder.labNumber", "LOCAL-456"],
  ]) {
    const label = details.getByText(messages[key], { selector: "dt" });
    expect(label.tagName).toBe("DT");
    expect(label.nextElementSibling.tagName).toBe("DD");
    expect(label.nextElementSibling).toHaveTextContent(value);
    expect(label.nextElementSibling).toBeVisible();
  }
  expect(details.queryByRole("button", { name: "核对并接收" })).toBeNull();
});

test("keeps space-separated given and family names for non-Chinese patients", () => {
  setup([order("11", " Smith ", { patientFirstName: " Anna " })]);
  expect(screen.getByRole("cell", { name: "Anna Smith" })).toBeVisible();
});

test("reports current review failure without marking the draft number invalid", async () => {
  setup([order()], {
    onReviewOrder: vi.fn().mockRejectedValue(new Error("preflight-failed")),
  });
  const details = expand();
  fireEvent.click(reviewButton());
  await waitFor(() =>
    expect(
      screen.getByText(messages["eorder.action.reviewFailed"]),
    ).toBeVisible(),
  );
  expect(details.getByRole("textbox")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(reviewButton()).toBeDisabled();
});

test("aborts number requests when leaving the page", async () => {
  const pending = deferred();
  const view = setup([order()], {
    readAction: vi.fn().mockReturnValue(pending.promise),
  });
  fireEvent.click(expand().getByRole("button", { name: "生成" }));
  const signal = view.readAction.mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ status: true, body: "TOO-LATE" }));
  expect(view.capture.current[0].labNo).toBe("");
});

test("clears row data safely while Carbon still has its previous rendered rows and ignores the removed row's pending number", async () => {
  const pending = deferred();
  const view = setup([order()], {
    readAction: vi.fn().mockReturnValue(pending.promise),
  });
  fireEvent.click(expand().getByRole("button", { name: "生成" }));
  const signal = view.readAction.mock.calls[0][1];
  expect(() =>
    view.update({
      orders: [],
      state: { ...scope, totalResults: 0 },
    }),
  ).not.toThrow();
  expect(signal.aborted).toBe(true);
  expect(screen.queryByRole("cell", { name: "甲" })).toBeNull();
  expect(screen.queryByRole("button", { name: "核对并接收" })).toBeNull();
  expect(screen.getByText(messages["eorder.search.noresults"])).toBeVisible();
  await act(async () => pending.resolve({ status: true, body: "REMOVED-ROW" }));
  expect(view.capture.current).toEqual([]);
});

test.each([
  ["generate", "eorder.number.generateFailed"],
  ["validate", "eorder.number.validationFailed"],
])(
  "bounds %s requests to 20 seconds and ignores their eventual result",
  async (kind, errorKey) => {
    vi.useFakeTimers();
    try {
      const pending = deferred();
      const view = setup([order("11", "甲", { labNo: "KEEP" })], {
        readAction: vi.fn().mockReturnValue(pending.promise),
      });
      const details = expand();
      if (kind === "generate")
        fireEvent.click(details.getByRole("button", { name: "生成" }));
      else fireEvent.focusOut(details.getByRole("textbox"));
      const signal = view.readAction.mock.calls[0][1];
      await act(async () => vi.advanceTimersByTime(20_000));
      expect(signal.aborted).toBe(true);
      expect(screen.getByText(messages[errorKey])).toBeVisible();
      expect(screen.getByRole("button", { name: "核对并接收" })).toBeDisabled();
      await act(async () =>
        pending.resolve({ status: true, body: "TOO-LATE" }),
      );
      expect(view.capture.current[0].labNo).toBe("KEEP");
      expect(screen.getByText(messages[errorKey])).toBeVisible();
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  },
);

test("locks asynchronous review against repeated clicks and discards stale failure after a new query", async () => {
  const pending = deferred();
  const view = setup([order()], {
    onReviewOrder: vi.fn().mockReturnValue(pending.promise),
  });
  const review = reviewButton();
  fireEvent.click(review);
  fireEvent.click(review);
  expect(review).toBeDisabled();
  expect(view.onReviewOrder).toHaveBeenCalledTimes(1);
  const signal = view.onReviewOrder.mock.calls[0][2].signal;
  expect(signal.aborted).toBe(false);
  view.update({ state: { ...scope, epoch: 2, totalResults: 1 } });
  expect(signal.aborted).toBe(true);
  await act(async () => pending.reject(new Error("old-review-failure")));
  expect(screen.queryByText(messages["eorder.action.reviewFailed"])).toBeNull();
  const currentReview = reviewButton();
  expect(currentReview).toBeEnabled();
});

test("bounds manual review preflight to 20 seconds, aborts it and ignores a late result", async () => {
  vi.useFakeTimers();
  try {
    const pending = deferred();
    const view = setup([order()], {
      onReviewOrder: vi.fn().mockReturnValue(pending.promise),
    });
    fireEvent.click(reviewButton());
    const signal = view.onReviewOrder.mock.calls[0][2].signal;
    expect(reviewButton()).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(signal.aborted).toBe(true);
    expect(mainRow().getByRole("alert")).toHaveTextContent(
      messages["eorder.action.reviewFailed"],
    );
    expect(reviewButton()).toBeDisabled();
    expect(screen.queryByText(messages["eorder.action.reviewing"])).toBeNull();
    await act(async () => pending.resolve(true));
    expect(mainRow().getByRole("alert")).toHaveTextContent(
      messages["eorder.action.reviewFailed"],
    );
    expect(view.onReviewOrder).toHaveBeenCalledTimes(1);
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});
