import React, { useState } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import PatientSearchSection from "./PatientSearchSection";
import messages from "../../../../languages/zh.json";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServerJsonResponse: api.post,
  resolveApiErrorMessage: () => "模拟错误",
}));
vi.mock("../../../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: () => {},
    addNotification: () => {},
  }),
  ConfigurationContext: React.createContext({
    configurationProperties: {
      USE_NEW_ADDRESS_HIERARCHY: "false",
      PATIENT_GPS_CAPTURE_ENABLED: "false",
      DEFAULT_NATIONALITY: "",
      DEFAULT_DATE_LOCALE: "en-US",
      PHONE_FORMAT: "",
      PATIENT_NATIONAL_ID_REQUIRED: "false",
    },
  }),
}));
vi.mock("../../../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { success: "success", error: "error" },
}));
// Keep the actual patient form, Formik and PatientFormObserver. Only peripheral
// address/photo/document widgets are outside this patient-selection regression.
vi.mock("../../../patient/AddressSearch", () => ({ default: () => null }));
vi.mock(
  "../../../patient/photoManagement/uploadPhoto/PatientImageSelector",
  () => ({ default: () => null }),
);
vi.mock("../../../patient/IdentificationDocuments", () => ({
  default: () => null,
}));
vi.mock("../../../common/CustomDatePicker", () => ({
  default: ({ id, value, onChange }) => (
    <input
      id={id}
      aria-label="模拟出生日期"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const patient = (id, name = `SIM患者${id}`) => ({
  patientID: id,
  patientPK: id,
  guid: `SIM-GUID-${id}`,
  lastName: name,
  firstName: "",
  nationalId: `SIM-PAT-${id}`,
  gender: "M",
});
const order = (person = {}) => ({
  patientProperties: person,
  patientUpdateStatus: person.patientPK ? "UPDATE" : "",
  sampleOrderItems: { labNo: "SIM-ORDER-01", referringSiteId: "SIM-SITE" },
  samples: [{ id: "SIM-SPECIMEN-01" }],
});
let requests;
let currentOrder;
let replaceOrder;
let setReadOnly;
let currentPhoneValidation;
let phoneResponse;

function Harness({ initialOrder = order(), readOnly = false }) {
  const [data, setData] = useState(initialOrder);
  const [locked, setLocked] = useState(readOnly);
  const [phoneValidation, setPhoneValidation] = useState(null);
  currentPhoneValidation = phoneValidation;
  currentOrder = data;
  replaceOrder = setData;
  setReadOnly = setLocked;
  return (
    <PatientSearchSection
      orderData={data}
      setOrderData={setData}
      setPhoneValidation={setPhoneValidation}
      isReadOnly={locked}
    />
  );
}
const mount = (props = {}) =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <Harness {...props} />
      </IntlProvider>
    </MemoryRouter>,
  );
const respond = (request, payload) => act(() => request.callback(payload));
const startSearch = async (user, query = "SIM") => {
  const input = screen.getByRole("textbox", {
    name: messages["patient.quickSearch.label"],
  });
  await user.clear(input);
  await user.type(input, query);
  await user.click(
    screen.getByRole("button", { name: messages["label.button.search"] }),
  );
  return requests[requests.length - 1];
};
const choose = async (user, name) => {
  const row = screen.getByRole("row", { name: new RegExp(name) });
  await user.click(
    within(row).getByRole("button", { name: messages["label.button.select"] }),
  );
  return requests[requests.length - 1];
};

beforeEach(() => {
  requests = [];
  phoneResponse = { status: true, body: "" };
  api.post.mockReset();
  api.get.mockReset().mockImplementation((url, callback, signal) => {
    if (
      url.startsWith("/rest/patient-search-results?") ||
      url.startsWith("/rest/patient-details?")
    ) {
      requests.push({ url, callback, signal });
    } else if (url.includes("PhoneNumberValidationProvider")) {
      callback(phoneResponse);
    } else if (url.includes("ValidationProvider")) {
      callback({ status: true, body: "" });
    } else if (!url.startsWith("/rest/patient-photos/")) {
      callback([]);
    }
  });
});

describe("申请页患者选择：真实表单身份与读取状态", () => {
  it("返回编辑新患者时保留该草稿已知的电话校验错误", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM电话错误");
    phoneResponse = { status: false, body: "SIM电话号码无效" };
    await user.type(document.getElementById("primaryPhone"), "SIM-invalid");
    await user.tab();
    expect(currentPhoneValidation.primaryPhone.status).toBe(false);
    await user.click(
      screen.getByRole("button", { name: messages["patient.search.return"] }),
    );
    await user.click(
      screen.getByRole("button", { name: messages["label.button.edit"] }),
    );
    expect(document.getElementById("primaryPhone")).toHaveValue("SIM-invalid");
    expect(currentPhoneValidation.primaryPhone.status).toBe(false);
    expect(screen.getByText("SIM电话号码无效")).toBeVisible();
  });

  it("更换为另一患者后，旧新建草稿的电话错误不再阻塞申请", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    phoneResponse = { status: false, body: "SIM电话号码无效" };
    await user.type(document.getElementById("primaryPhone"), "SIM-invalid");
    await user.tab();
    expect(currentPhoneValidation.primaryPhone.status).toBe(false);
    await user.click(
      screen.getByRole("button", { name: messages["patient.search.return"] }),
    );
    respond(await startSearch(user), {
      patientSearchResults: [patient("103")],
    });
    respond(await choose(user, "SIM患者103"), patient("103"));
    expect(currentOrder.patientProperties.patientPK).toBe("103");
    expect(currentPhoneValidation.primaryPhone.status).toBe(true);
    expect(currentPhoneValidation.contactPhone.status).toBe(true);
  });
  it("首次保存自动生成申请编号不关闭新患者表单，也不丢输入", async () => {
    const user = userEvent.setup();
    mount({ initialOrder: { ...order(), sampleOrderItems: { labNo: "" } } });
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM待保存");
    act(() =>
      replaceOrder((prev) => ({
        ...prev,
        sampleOrderItems: { ...prev.sampleOrderItems, labNo: "SIM-GENERATED" },
      })),
    );
    expect(document.getElementById("lastName")).toHaveValue("SIM待保存");
    await user.type(document.getElementById("lastName"), "补充");
    expect(currentOrder.patientProperties.lastName).toBe("SIM待保存补充");
  });

  it("返回查询时新患者草稿仍可见，重新编辑保留已填资料", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM未保存患者");
    await user.click(
      screen.getByRole("button", { name: messages["patient.search.return"] }),
    );
    expect(
      screen.getByRole("heading", { name: "SIM未保存患者" }),
    ).toBeVisible();
    expect(
      screen.getByText(messages["order.saveStatus.unsaved"]),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: messages["label.button.edit"] }),
    );
    expect(document.getElementById("lastName")).toHaveValue("SIM未保存患者");
    expect(currentOrder.patientProperties.patientPK || "").toBe("");
    expect(currentOrder.patientProperties.patientUpdateStatus).toBe("ADD");
  });

  it("带新患者草稿查询失败仍保留身份，成功选中另一患者才替换草稿", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM草稿B");
    await user.click(
      screen.getByRole("button", { name: messages["patient.search.return"] }),
    );
    respond(await startSearch(user), undefined);
    expect(screen.getByRole("heading", { name: "SIM草稿B" })).toBeVisible();
    expect(currentOrder.patientProperties.lastName).toBe("SIM草稿B");
    respond(await startSearch(user), {
      patientSearchResults: [patient("103", "SIM患者C")],
    });
    respond(await choose(user, "SIM患者C"), patient("103", "SIM患者C"));
    expect(currentOrder.patientProperties.patientPK).toBe("103");
    expect(screen.getByRole("heading", { name: "SIM患者C" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "SIM草稿B" }),
    ).not.toBeInTheDocument();
    expect(document.getElementById("lastName")).not.toBeInTheDocument();
  });
  it("选中A后新建B，真实表单和Observer不继承A身份，也不写患者接口", async () => {
    const user = userEvent.setup();
    mount({ initialOrder: order(patient("101", "SIM旧患者")) });
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    const name = document.getElementById("lastName");
    expect(name).toHaveValue("");
    expect(name).toBeEnabled();
    expect(
      document.getElementById("patient-edit-toggle"),
    ).not.toBeInTheDocument();
    await user.type(name, "SIM新患者");
    expect(currentOrder.patientProperties.lastName).toBe("SIM新患者");
    expect(currentOrder.patientProperties.patientPK || "").toBe("");
    expect(currentOrder.patientProperties.guid || "").toBe("");
    expect(currentOrder.patientUpdateStatus).toBe("ADD");
    expect(currentOrder.patientProperties.patientUpdateStatus).toBe("ADD");
    expect(currentOrder.sampleOrderItems).toEqual(order().sampleOrderItems);
    expect(currentOrder.samples).toEqual(order().samples);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("合法查询与选择使用内部ID，显示所选患者且保留其他申请信息", async () => {
    const user = userEvent.setup();
    mount();
    const search = await startSearch(user, "SIM 张");
    expect(
      new URLSearchParams(search.url.split("?")[1]).get("quickQuery"),
    ).toBe("SIM 张");
    expect(search.url).toContain("suppressExternalSearch=true");
    respond(search, { patientSearchResults: [patient("101")] });
    const details = await choose(user, "SIM患者101");
    expect(details.url).toBe("/rest/patient-details?patientID=101");
    respond(details, patient("101"));
    expect(screen.getByRole("heading", { name: "SIM患者101" })).toBeVisible();
    expect(currentOrder.patientProperties.patientPK).toBe("101");
    expect(currentOrder.sampleOrderItems).toEqual(order().sampleOrderItems);
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { patientSearchResults: {} }])(
    "查询失败或畸形回执不是没有患者：%j",
    async (payload) => {
      const user = userEvent.setup();
      mount();
      respond(await startSearch(user), payload);
      expect(
        screen.getByText(messages["patient.management.list.error"]),
      ).toBeVisible();
      expect(
        screen.queryByText(messages["patient.search.empty.results"]),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: messages["label.button.search"] }),
      ).toBeEnabled();
      expect(
        screen.getByRole("textbox", {
          name: messages["patient.quickSearch.label"],
        }),
      ).toHaveValue("SIM");
    },
  );

  it("清除查询后迟到的搜索不重新显示患者", async () => {
    const user = userEvent.setup();
    mount();
    const pending = await startSearch(user);
    await user.click(
      screen.getByRole("button", { name: messages["label.button.clear"] }),
    );
    respond(pending, { patientSearchResults: [patient("101")] });
    expect(screen.queryByText("SIM患者101")).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: messages["patient.quickSearch.label"],
      }),
    ).toHaveValue("");
  });

  it("修改查询条件后迟到的旧搜索不覆盖新结果", async () => {
    const user = userEvent.setup();
    mount();
    const old = await startSearch(user, "SIM-A");
    const latest = await startSearch(user, "SIM-B");
    respond(latest, { patientSearchResults: [patient("102")] });
    respond(old, { patientSearchResults: [patient("101")] });
    expect(screen.getByText("SIM患者102")).toBeVisible();
    expect(screen.queryByText("SIM患者101")).not.toBeInTheDocument();
  });

  it.each([undefined, patient("999")])(
    "详情失败或返回别人的ID，不回填申请：%j",
    async (payload) => {
      const user = userEvent.setup();
      mount();
      respond(await startSearch(user), {
        patientSearchResults: [patient("101")],
      });
      respond(await choose(user, "SIM患者101"), payload);
      expect(screen.getByText(messages["patient.fetch.error"])).toBeVisible();
      expect(currentOrder.patientProperties).toEqual({});
      expect(
        screen.getByRole("button", { name: messages["label.button.select"] }),
      ).toBeEnabled();
    },
  );

  it("选择详情在途时点击新患者，旧详情不能覆盖新建草稿", async () => {
    const user = userEvent.setup();
    mount();
    respond(await startSearch(user), {
      patientSearchResults: [patient("101")],
    });
    const pending = await choose(user, "SIM患者101");
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM新建");
    respond(pending, patient("101"));
    expect(document.getElementById("lastName")).toHaveValue("SIM新建");
    expect(currentOrder.patientProperties.patientPK || "").toBe("");
  });

  it("切换申请后旧详情不能改新申请的患者", async () => {
    const user = userEvent.setup();
    mount();
    respond(await startSearch(user), {
      patientSearchResults: [patient("101")],
    });
    const pending = await choose(user, "SIM患者101");
    const next = {
      ...order(patient("102")),
      sampleOrderItems: { labNo: "SIM-ORDER-02" },
    };
    act(() => replaceOrder(next));
    respond(pending, patient("101"));
    expect(currentOrder).toEqual(next);
    expect(screen.getByRole("heading", { name: "SIM患者102" })).toBeVisible();
  });

  it("转为只读后在途详情不回填，现有患者不能清除或改建", async () => {
    const user = userEvent.setup();
    mount();
    respond(await startSearch(user), {
      patientSearchResults: [patient("101")],
    });
    const pending = await choose(user, "SIM患者101");
    act(() => setReadOnly(true));
    respond(pending, patient("101"));
    expect(currentOrder.patientProperties).toEqual({});
    const existing = order(patient("102"));
    act(() => replaceOrder(existing));
    expect(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    ).toBeDisabled();
    const clear = screen.queryByRole("button", {
      name: messages["label.button.clear"],
    });
    if (clear) expect(clear).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: messages["label.button.clear"] }),
    ).not.toBeInTheDocument();
    expect(currentOrder).toEqual(existing);
  });

  it("新建表单打开时外部切换患者，不让旧Observer覆盖新患者", async () => {
    const user = userEvent.setup();
    mount({ initialOrder: order(patient("101")) });
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM草稿");
    const next = order(patient("102"));
    act(() => replaceOrder(next));
    expect(document.getElementById("lastName")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SIM患者102" })).toBeVisible();
    expect(currentOrder).toEqual(next);
  });

  it("新建期间同一路由重置空申请，不能将旧表单写回", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM草稿");
    const next = order();
    act(() => replaceOrder(next));
    expect(document.getElementById("lastName")).not.toBeInTheDocument();
    expect(currentOrder).toEqual(next);
  });

  it("新建期间转只读不继续回填，解除只读也不恢复旧表单Observer", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: messages["new.patient.label"] }),
    );
    await user.type(document.getElementById("lastName"), "SIM草稿");
    const frozen = currentOrder;
    act(() => setReadOnly(true));
    expect(document.getElementById("lastName")).not.toBeInTheDocument();
    expect(currentOrder).toBe(frozen);
    act(() => setReadOnly(false));
    expect(document.getElementById("lastName")).not.toBeInTheDocument();
    expect(currentOrder).toBe(frozen);
  });

  it("清除已选患者只清患者身份，申请和标本不变", async () => {
    const user = userEvent.setup();
    mount({ initialOrder: order(patient("101")) });
    await user.click(
      screen.getByRole("button", { name: messages["label.button.clear"] }),
    );
    expect(
      screen.queryByRole("heading", { name: "SIM患者101" }),
    ).not.toBeInTheDocument();
    expect(currentOrder.patientProperties.patientPK).toBe("");
    expect(currentOrder.patientProperties.guid).toBe("");
    expect(currentOrder.patientUpdateStatus).toBe("");
    expect(currentOrder.patientProperties.patientUpdateStatus).toBe("");
    expect(currentOrder.sampleOrderItems).toEqual(order().sampleOrderItems);
    expect(currentOrder.samples).toEqual(order().samples);
  });

  it("已合并患者不可选择；加载中不重复选择；组件卸载取消请求", async () => {
    const user = userEvent.setup();
    const view = mount();
    respond(await startSearch(user), {
      patientSearchResults: [
        { ...patient("100"), isMerged: true },
        patient("101"),
      ],
    });
    expect(
      within(screen.getByRole("row", { name: /SIM患者100/ })).getByRole(
        "button",
      ),
    ).toBeDisabled();
    const pending = await choose(user, "SIM患者101");
    expect(
      within(screen.getByRole("row", { name: /SIM患者101/ })).getByRole(
        "button",
      ),
    ).toBeDisabled();
    const before = currentOrder;
    view.unmount();
    expect(pending.signal.aborted).toBe(true);
    respond(pending, patient("101"));
    expect(currentOrder).toBe(before);
  });

  it("合法空结果显示无匹配，错误后可以重新查询并选择", async () => {
    const user = userEvent.setup();
    mount();
    respond(await startSearch(user), { patientSearchResults: [] });
    expect(
      screen.getByText(messages["patient.search.empty.results"]),
    ).toBeVisible();
    respond(await startSearch(user), undefined);
    expect(
      screen.getByText(messages["patient.management.list.error"]),
    ).toBeVisible();
    respond(await startSearch(user), {
      patientSearchResults: [patient("101")],
    });
    expect(
      screen.queryByText(messages["patient.management.list.error"]),
    ).not.toBeInTheDocument();
    respond(await choose(user, "SIM患者101"), patient("101"));
    expect(currentOrder.patientProperties.patientPK).toBe("101");
  });
});
