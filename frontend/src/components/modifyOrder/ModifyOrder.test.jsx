import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import {
  MemoryRouter,
  Route,
  Switch,
  useHistory,
  useLocation,
} from "react-router-dom";
import messages from "../../languages/zh.json";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  notification: vi.fn(),
}));
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServerFullResponse: api.post,
}));
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return { NotificationContext: createContext({}) };
});
// Child form wiring is isolated here. Each child keeps the real parent's draft
// setter and DOM disabled semantics; EditSample has its own interaction tests.
vi.mock("./EditSample", () => ({
  default: ({
    orderFormValues,
    setOrderFormValues,
    disabled,
    isSubmitting,
  }) => (
    <section aria-label="已有标本与检验项目" data-testid="existing-samples">
      {orderFormValues.existingTests.map((item) => (
        <label key={item.analysisId}>
          {`取消项目 ${item.analysisId}`}
          <input
            type="checkbox"
            aria-label={`取消项目 ${item.analysisId}`}
            checked={Boolean(item.canceled)}
            disabled={disabled || isSubmitting}
            onChange={(event) => {
              const checked = event.target.checked;
              setOrderFormValues((previous) => ({
                ...previous,
                existingTests: previous.existingTests.map((row) =>
                  row.analysisId === item.analysisId
                    ? { ...row, canceled: checked }
                    : row,
                ),
              }));
            }}
          />
          <span>{item.accessionNumber}</span>
          <span>{item.testName}</span>
        </label>
      ))}
    </section>
  ),
}));
vi.mock("../addOrder/AddOrder", () => ({
  default: ({
    orderFormValues,
    setOrderFormValues,
    disabled,
    isSubmitting,
    error,
  }) => (
    <section aria-label="送检信息编辑" data-testid="referring-information">
      <label>
        申请医生名字
        <input
          value={orderFormValues.sampleOrderItems.providerFirstName || ""}
          disabled={disabled || isSubmitting}
          onChange={(event) => {
            const value = event.target.value;
            setOrderFormValues((previous) => ({
              ...previous,
              sampleOrderItems: {
                ...previous.sampleOrderItems,
                providerFirstName: value,
              },
            }));
          }}
        />
      </label>
      <label>
        医生邮箱
        <input
          value={orderFormValues.sampleOrderItems.providerEmail || ""}
          disabled={disabled || isSubmitting}
          onChange={(event) => {
            const value = event.target.value;
            setOrderFormValues((previous) => ({
              ...previous,
              sampleOrderItems: {
                ...previous.sampleOrderItems,
                providerEmail: value,
              },
            }));
          }}
        />
      </label>
      {error?.("sampleOrderItems.providerFirstName") && (
        <p>{error("sampleOrderItems.providerFirstName")}</p>
      )}
      {error?.("sampleOrderItems.providerEmail") && (
        <p>{error("sampleOrderItems.providerEmail")}</p>
      )}
      <output data-testid="display-lists">
        {JSON.stringify({
          providers: orderFormValues.sampleOrderItems.providersList,
          sites: orderFormValues.sampleOrderItems.referringSiteList,
          priorities: orderFormValues.sampleOrderItems.priorityList,
          programs: orderFormValues.sampleOrderItems.programList,
          paymentOptions: orderFormValues.sampleOrderItems.paymentOptions,
          locations: orderFormValues.sampleOrderItems.testLocationCodeList,
          initialConditions: orderFormValues.initialSampleConditionList,
          sections: orderFormValues.testSectionList,
        })}
      </output>
    </section>
  ),
}));
vi.mock("./EditOrderEntryAdditionalQuestions", () => ({
  default: () => (
    <section data-testid="additional-business-information">原业务信息</section>
  ),
}));
vi.mock("../addOrder/Index", () => ({
  sampleObject: {
    index: 1,
    tests: [],
    panels: [],
    referralItems: [],
    sampleTypeId: "",
    sampleXML: null,
  },
}));
vi.mock("../common/PageBreadCrumb", () => ({
  default: () => <nav aria-label="面包屑">申请列表</nav>,
}));
vi.mock("../common/PatientHeader", () => ({
  default: () => <div data-testid="legacy-patient-header" />,
}));
vi.mock("../addOrder/OrderSuccessMessage", () => ({
  default: () => <div data-testid="new-order-success" />,
}));

import ModifyOrder from "./ModifyOrder";
import { NotificationContext } from "../layout/Layout";

const accession = "HMC26092800001";
function fixture(overrides = {}) {
  return {
    accessionNumber: accession,
    patientId: "9200001",
    patientName: "张, 伟",
    gender: "M",
    dob: "1982/03/16",
    nationalId: "DEMO-ID-0001",
    searchFinished: true,
    noSampleFound: false,
    isEditable: true,
    existingTests: [
      {
        analysisId: "7101",
        sampleItemId: "6101",
        testId: "WBC",
        accessionNumber: `${accession}-1`,
        testName: "白细胞计数",
        sampleType: "全血",
        canceled: false,
        canCancel: true,
        removeSample: false,
        canRemoveSample: true,
      },
      {
        analysisId: "7102",
        sampleItemId: "6102",
        testId: "WBC",
        accessionNumber: `${accession}-2`,
        testName: "白细胞计数",
        sampleType: "全血",
        canceled: false,
        canCancel: true,
        removeSample: false,
        canRemoveSample: true,
      },
    ],
    possibleTests: [],
    sampleTypes: [{ id: "3", value: "全血" }],
    sampleXML: "",
    initialSampleConditionList: [{ id: "normal", value: "正常" }],
    testSectionList: [{ id: "56", value: "生化" }],
    sampleOrderItems: {
      labNo: accession,
      sampleId: "5101",
      providerFirstName: "明",
      providerLastName: "李",
      providerEmail: "doctor@example.test",
      referringSiteId: "site-1",
      referringSiteName: "本院",
      referringSiteDepartmentId: "dept-1",
      receivedDateForDisplay: "2026/09/28",
      receivedTime: "08:30",
      priority: "ROUTINE",
      priorityList: [{ id: "ROUTINE", value: "常规" }],
      providersList: [{ id: "doctor-1", value: "李明" }],
      referringSiteList: [{ id: "site-1", value: "本院" }],
      programList: [{ id: "program-17", value: "Routine Testing" }],
      paymentOptions: [{ id: "self", value: "自费" }],
      testLocationCodeList: [{ id: "local", value: "本院" }],
      programId: "program-17",
      additionalQuestions: {
        resourceType: "QuestionnaireResponse",
        item: [{ linkId: "q-1", answer: [{ valueBoolean: true }] }],
      },
      modified: false,
      ...overrides.sampleOrderItems,
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "sampleOrderItems"),
    ),
  };
}
function Notifications({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [notificationVisible, setNotificationVisible] = useState(false);
  return (
    <NotificationContext.Provider
      value={{
        notifications,
        notificationVisible,
        setNotificationVisible,
        addNotification: (notification) => {
          api.notification(notification);
          setNotifications((previous) => [...previous, notification]);
        },
        removeNotification: (index) =>
          setNotifications((previous) =>
            previous.filter((_, row) => row !== index),
          ),
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
function LocationControls() {
  const location = useLocation();
  const history = useHistory();
  return (
    <>
      <output data-testid="location">
        {JSON.stringify({
          pathname: location.pathname,
          search: location.search,
          state: location.state,
        })}
      </output>
      <button
        onClick={() =>
          history.push("/ModifyOrder?accessionNumber=HMC26092800002")
        }
      >
        切换另一申请
      </button>
    </>
  );
}
function setup(options = {}) {
  const {
    defer = false,
    search = `?accessionNumber=${accession}`,
    state,
  } = options;
  const response = Object.prototype.hasOwnProperty.call(options, "response")
    ? options.response
    : fixture();
  const callbacks = [];
  api.get.mockImplementation((url, callback) => {
    if (url.startsWith("/rest/SampleEdit?")) {
      callbacks.push({ url, callback });
      if (!defer) callback(response);
    } else if (url.startsWith("/rest/patientByLabNumer"))
      callback({ id: "9200001" });
  });
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/ModifyOrder", search, state }]}
    >
      <IntlProvider locale="zh" messages={messages}>
        <Notifications>
          <Switch>
            <Route path="/ModifyOrder">
              <ModifyOrder />
            </Route>
            <Route path="/order">
              <h1>申请列表已返回</h1>
            </Route>
          </Switch>
          <LocationControls />
        </Notifications>
      </IntlProvider>
    </MemoryRouter>,
  );
  return callbacks;
}
function nextStep() {
  fireEvent.click(document.querySelector('[data-cy="next-button"]'));
}
function saveButton() {
  return document.querySelector('[data-cy="submit-order"]');
}
function save() {
  fireEvent.click(saveButton());
}
async function loaded() {
  await screen.findByTestId("existing-samples");
}
async function editReferringInformation() {
  await loaded();
  nextStep();
  await screen.findByTestId("referring-information");
  fireEvent.change(screen.getByLabelText("申请医生名字"), {
    target: { value: "华" },
  });
  await waitFor(() => expect(saveButton()).not.toBeDisabled());
}
function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockReset();
  api.post.mockReset();
});

describe("ModifyOrder Chinese existing-application workspace", () => {
  test("opens existing tubes directly with a readable Chinese patient summary and two steps", async () => {
    setup();
    await loaded();
    expect(
      screen.getByRole("heading", { name: "修改申请" }),
    ).toBeInTheDocument();
    expect(screen.getByText("张伟")).toBeInTheDocument();
    expect(
      screen.queryByTestId("legacy-patient-header"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("程序选择")).not.toBeInTheDocument();
    expect(screen.queryByText("Routine Testing")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("additional-business-information"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(`${accession}-1`)).toBeInTheDocument();
    expect(screen.getByText(`${accession}-2`)).toBeInTheDocument();
    expect(
      within(document.querySelector(".modify-order-progress")).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
    nextStep();
    expect(
      await screen.findByTestId("referring-information"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("existing-samples")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("additional-business-information"),
    ).toBeInTheDocument();
  });

  test("shows no editable form during loading and opens only after the requested application resolves", async () => {
    const callbacks = setup({ defer: true });
    expect(screen.queryByTestId("existing-samples")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("referring-information"),
    ).not.toBeInTheDocument();
    expect(saveButton()).toBeNull();
    await act(async () => callbacks[0].callback(fixture()));
    await loaded();
  });

  test("retries an unsuccessful GET without editing empty initial data", async () => {
    const callbacks = setup({ defer: true });
    await act(async () => callbacks[0].callback(undefined));
    expect(screen.queryByTestId("existing-samples")).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: /重试|重新加载/ }),
    );
    await waitFor(() => expect(callbacks).toHaveLength(2));
    await act(async () => callbacks.at(-1).callback(fixture()));
    await loaded();
    expect(callbacks).toHaveLength(2);
    expect(api.post).not.toHaveBeenCalled();
  });

  test.each([
    ["not found", fixture({ noSampleFound: true })],
    ["missing lab number", fixture({ sampleOrderItems: { labNo: "" } })],
    ["HTTP error body", { status: 404, error: "Not Found" }],
  ])("does not offer editing for %s", async (_label, response) => {
    setup({ response });
    await screen.findByRole("button", { name: messages["modify.order.retry"] });
    expect(screen.queryByTestId("existing-samples")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("referring-information"),
    ).not.toBeInTheDocument();
    expect(saveButton()).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("returns to the original list state without a dirty confirmation for an unchanged application", async () => {
    const listState = { search: "张伟", page: 3, pageSize: 20 };
    setup({
      state: { listOrigin: { pathname: "/order", state: { listState } } },
    });
    await loaded();
    fireEvent.click(
      screen.getByRole("button", { name: "返回列表", exact: true }),
    );
    expect(
      await screen.findByRole("heading", { name: "申请列表已返回" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("location").textContent).state,
    ).toEqual({ listState });
  });

  test("keeps a changed draft when canceling the discard confirmation and leaves only on explicit discard", async () => {
    setup();
    await editReferringInformation();
    fireEvent.click(
      screen.getByRole("button", { name: "返回列表", exact: true }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: messages["workspace.leave.cancel"],
        exact: true,
      }),
    );
    expect(screen.getByLabelText("申请医生名字")).toHaveValue("华");
    expect(screen.getByTestId("location")).toHaveTextContent("/ModifyOrder");
    fireEvent.click(
      screen.getByRole("button", { name: "返回列表", exact: true }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: messages["workspace.leave.confirm"],
        exact: true,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "申请列表已返回" }),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("locks field changes, repeated submits, step navigation and return while saving", async () => {
    setup();
    await editReferringInformation();
    save();
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("申请医生名字")).toBeDisabled();
    expect(screen.getByLabelText("医生邮箱")).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "返回列表", exact: true }),
    ).toBeDisabled();
    const progressButtons = within(
      document.querySelector(".modify-order-progress"),
    ).getAllByRole("button");
    expect(progressButtons).toHaveLength(2);
    progressButtons.forEach((button) => expect(button).toBeDisabled());
    expect(
      screen.getByRole("button", {
        name: messages["modify.order.back.samples"],
        exact: true,
      }),
    ).toBeDisabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/ModifyOrder");
  });

  test.each([400, 403, 409, 422, 500, undefined])(
    "keeps draft and display lists after save status %s, then allows retry",
    async (status) => {
      setup();
      await editReferringInformation();
      const listSnapshot = screen.getByTestId("display-lists").textContent;
      api.post.mockImplementationOnce((_url, _body, callback) =>
        callback(
          status === undefined
            ? undefined
            : response(status, { message: "English server error" }),
        ),
      );
      save();
      const errorKey =
        status === 403
          ? "modify.order.forbidden"
          : status === 409
            ? "modify.order.conflict"
            : status === 400 || status === 422
              ? "modify.order.invalid"
              : "modify.order.save.failed";
      await screen.findByText(messages[errorKey]);
      await waitFor(() => expect(saveButton()).not.toBeDisabled());
      expect(screen.getByLabelText("申请医生名字")).toHaveValue("华");
      expect(screen.getByTestId("display-lists").textContent).toBe(
        listSnapshot,
      );
      expect(screen.getByTestId("location")).toHaveTextContent("/ModifyOrder");
      expect(screen.queryByTestId("new-order-success")).not.toBeInTheDocument();
      expect(
        screen.queryByText("English server error"),
      ).not.toBeInTheDocument();
      api.post.mockImplementationOnce((_url, _body, callback) =>
        callback(response(200)),
      );
      save();
      await screen.findByRole("heading", {
        name: messages["modify.order.saved"],
        exact: true,
      });
      expect(api.post).toHaveBeenCalledTimes(2);
    },
  );

  test("uses a separate save payload, preserves per-tube identity and existing business answers, and shows modification success", async () => {
    const source = fixture();
    const unchanged = JSON.stringify(source);
    const listState = { search: accession, page: 2 };
    setup({
      response: source,
      state: { listOrigin: { pathname: "/order", state: { listState } } },
    });
    await loaded();
    fireEvent.click(screen.getByLabelText("取消项目 7101"));
    nextStep();
    await waitFor(() => expect(saveButton()).not.toBeDisabled());
    api.post.mockImplementation((_url, _body, callback) =>
      callback(response(200)),
    );
    save();
    await screen.findByRole("heading", {
      name: messages["modify.order.saved"],
      exact: true,
    });
    const [url, raw] = api.post.mock.calls[0];
    expect(url).toBe("/rest/SampleEdit");
    const payload = JSON.parse(raw);
    expect(payload.accessionNumber).toBe(accession);
    expect(payload.sampleOrderItems.sampleId).toBe("5101");
    expect(payload.sampleOrderItems.programId).toBe("program-17");
    expect(payload.sampleOrderItems.additionalQuestions).toEqual(
      source.sampleOrderItems.additionalQuestions,
    );
    expect(payload.existingTests).toEqual([
      { ...source.existingTests[0], canceled: true },
      source.existingTests[1],
    ]);
    expect(JSON.stringify(source)).toBe(unchanged);
    expect(screen.queryByTestId("new-order-success")).not.toBeInTheDocument();
    expect(screen.queryByText(/新增申请|新建申请/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "返回列表", exact: true }).at(-1),
    );
    expect(
      await screen.findByRole("heading", { name: "申请列表已返回" }),
    ).toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("location").textContent).state,
    ).toEqual({ listState });
  });

  test("ignores a late response for the previous route after switching application query parameters", async () => {
    const callbacks = setup({ defer: true });
    fireEvent.click(screen.getByRole("button", { name: "切换另一申请" }));
    await waitFor(() => expect(callbacks).toHaveLength(2));
    await act(async () =>
      callbacks[1].callback(
        fixture({
          accessionNumber: "HMC26092800002",
          patientName: "李, 芳",
          sampleOrderItems: { labNo: "HMC26092800002" },
        }),
      ),
    );
    await loaded();
    expect(screen.getByText("李芳")).toBeInTheDocument();
    await act(async () => callbacks[0].callback(fixture()));
    expect(screen.queryByText("张伟")).not.toBeInTheDocument();
    expect(screen.getByText("李芳")).toBeInTheDocument();
    nextStep();
    expect(screen.getByLabelText("申请医生名字")).toHaveValue("明");
  });

  test("does not send a request when neither an application number nor patient identifier is present", async () => {
    setup({ search: "" });
    await screen.findByRole("button", { name: messages["modify.order.retry"] });
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId("existing-samples")).not.toBeInTheDocument();
    expect(saveButton()).toBeNull();
  });

  test("keeps a server-marked read-only application disabled and never offers save", async () => {
    setup({ response: fixture({ isEditable: false }) });
    await loaded();
    expect(screen.getByLabelText("取消项目 7101")).toBeDisabled();
    nextStep();
    expect(screen.getByLabelText("申请医生名字")).toBeDisabled();
    expect(saveButton()).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "返回列表", exact: true }),
    );
    expect(
      await screen.findByRole("heading", { name: "申请列表已返回" }),
    ).toBeInTheDocument();
  });

  test("reports invalid fields in Chinese and preserves the draft without calling save", async () => {
    setup();
    await loaded();
    nextStep();
    fireEvent.change(screen.getByLabelText("医生邮箱"), {
      target: { value: "invalid-email" },
    });
    await screen.findByText(messages["modify.order.validation.email"]);
    save();
    await screen.findByText(messages["modify.order.invalid"]);
    expect(screen.getByLabelText("医生邮箱")).toHaveValue("invalid-email");
    expect(screen.queryByText("Invalid Email")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(saveButton()).not.toBeDisabled();
  });

  test("cancel uses the same discard confirmation and keeps the original draft on continue editing", async () => {
    setup();
    await editReferringInformation();
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["label.button.cancel"],
        exact: true,
      }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: messages["workspace.leave.cancel"],
        exact: true,
      }),
    );
    expect(screen.getByLabelText("申请医生名字")).toHaveValue("华");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("ignores late POST success from the previous application after a route change", async () => {
    const callbacks = setup({ defer: true });
    await act(async () => callbacks[0].callback(fixture()));
    await editReferringInformation();
    save();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const completePreviousSave = api.post.mock.calls[0][2];
    fireEvent.click(screen.getByRole("button", { name: "切换另一申请" }));
    await waitFor(() => expect(callbacks).toHaveLength(2));
    await act(async () =>
      callbacks[1].callback(
        fixture({
          accessionNumber: "HMC26092800002",
          patientName: "李, 芳",
          sampleOrderItems: { labNo: "HMC26092800002" },
        }),
      ),
    );
    await loaded();
    await act(async () => completePreviousSave(response(200)));
    expect(screen.getByText("李芳")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: messages["modify.order.saved"],
        exact: true,
      }),
    ).not.toBeInTheDocument();
    expect(api.notification).not.toHaveBeenCalled();
    nextStep();
    expect(saveButton()).not.toBeDisabled();
    expect(screen.getByLabelText("申请医生名字")).toHaveValue("明");
  });

  test("shows the existing required-doctor rule in Chinese when a loaded value is null", async () => {
    setup({
      response: fixture({ sampleOrderItems: { providerFirstName: null } }),
    });
    await loaded();
    nextStep();
    await screen.findByText(messages["modify.order.validation.firstName"]);
    expect(
      screen.queryByText(/must be a .*string.*type/),
    ).not.toBeInTheDocument();
    save();
    await screen.findByText(messages["modify.order.invalid"]);
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText("申请医生名字")).toHaveValue("");
  });

  test("preserves the patient-ID-only bookmark and requests the existing writable edit mode", async () => {
    const callbacks = setup({ search: "?patientId=9200001" });
    await loaded();
    const request = new URL(callbacks[0].url, "http://localhost");
    expect(request.pathname).toBe("/rest/SampleEdit");
    expect(request.searchParams.get("patientId")).toBe("9200001");
    expect(request.searchParams.get("accessionNumber")).toBe("");
    expect(request.searchParams.get("type")).toBe("readwrite");
    expect(screen.getByText(accession, { exact: true })).toBeInTheDocument();
    nextStep();
    expect(saveButton()).toBeInTheDocument();
  });

  test("preserves an explicit read-only bookmark and safely encodes the requested application number", async () => {
    const unusualAccession = "HMC 260928&1";
    const callbacks = setup({
      search: `?accessionNumber=${encodeURIComponent(unusualAccession)}&type=readonly`,
      // An old writable session may still produce true; explicit view mode must
      // remain read-only in the browser without changing server authorization.
      response: fixture({ isEditable: true }),
    });
    await loaded();
    const request = new URL(callbacks[0].url, "http://localhost");
    expect(request.searchParams.get("accessionNumber")).toBe(unusualAccession);
    expect(request.searchParams.get("type")).toBe("readonly");
    expect(request.searchParams.has("1")).toBe(false);
    expect(screen.getByLabelText("取消项目 7101")).toBeDisabled();
    nextStep();
    expect(saveButton()).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
});

test.each([
  ["标本状态已变化，请刷新申请后重试。", "标本状态已变化，请刷新申请后重试。"],
  ["Failed to save sample edit", messages["modify.order.invalid"]],
])(
  "shows an understandable save failure for %s without losing the draft",
  async (serverMessage, visibleMessage) => {
    setup();
    await loaded();
    await editReferringInformation();
    api.post.mockImplementationOnce((_url, _body, callback) =>
      callback(response(400, { message: serverMessage })),
    );
    save();
    await screen.findByText(visibleMessage);
    expect(saveButton()).not.toBeDisabled();
    expect(screen.getByLabelText("申请医生名字")).toHaveValue("华");
    expect(screen.queryByText("Failed to save sample edit")).toBeNull();
  },
);

test("read-only readers can expand original questionnaire information without enabling editing", async () => {
  setup({ response: fixture({ isEditable: false }) });
  await loaded();
  nextStep();
  const details = screen.getByRole("button", {
    name: messages["modify.order.additional"],
  });
  expect(details).not.toBeDisabled();
  fireEvent.click(details);
  expect(details).toHaveAttribute("aria-expanded", "true");
  expect(saveButton()).toBeNull();
});
