import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import enMessages from "../../../languages/en.json";
import zhMessages from "../../../languages/zh.json";
import SampleTypeManagement from "./SampleTypeManagement";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: apiMocks.get,
  postToOpenElisServerJsonResponse: apiMocks.post,
  putToOpenElisServerFullResponse: apiMocks.put,
}));
vi.mock("./sections/AssociatedTestsSection", () => ({
  default: ({ sampleTypeId }) => (
    <p data-testid="association-section">{sampleTypeId}</p>
  ),
}));
vi.mock("./sections/DisplayOrderSection", () => ({
  default: () => <p>Display order fixture</p>,
}));
vi.mock("./sections/TerminologySection", () => ({
  default: () => <p>Terminology fixture</p>,
}));
vi.mock("./sections/DisposalSection", () => ({
  default: () => <p>Disposal fixture</p>,
}));

const detail = Object.freeze({
  id: "5",
  name: "血清",
  description: "Serum-internal",
  domain: "CLINICAL",
  isActive: true,
  testCount: 8,
  abbreviation: "SR",
  sortOrder: 7,
  whonetCode: "SER",
  disposalInstructions: "原处置配置",
  translations: Object.freeze({
    zh: "血清",
    en: "Serum",
    fr: "Sérum",
    ar: "مصل",
  }),
});
const sampleTypes = [
  {
    id: "5",
    name: "血清",
    description: "Serum-internal",
    domain: "CLINICAL",
    isActive: true,
    testCount: 8,
  },
];
const defaultGet = (url, callback) => {
  if (url === "/rest/domains")
    callback([
      { id: "CLINICAL", labelKey: "label.domain.CLINICAL" },
      { id: "ENVIRONMENTAL", labelKey: "label.domain.ENVIRONMENTAL" },
    ]);
  else if (url === "/rest/sample-types")
    callback({ success: true, data: sampleTypes });
  else if (url === "/rest/sample-types/5")
    callback({ success: true, data: detail });
  else callback(undefined);
};
const renderPage = ({
  entry = "/MasterListsPage/SampleTypeManagement",
  locale = "zh-CN",
  messages = zhMessages,
} = {}) => {
  const history = createMemoryHistory({ initialEntries: [entry] });
  return {
    ...render(
      <Router history={history}>
        <IntlProvider locale={locale} messages={messages}>
          <Route
            path={[
              "/MasterListsPage/SampleTypeManagement/:sampleTypeId?/:section?",
              "/admin/SampleTypeManagement/:sampleTypeId?/:section?",
            ]}
            render={() => <SampleTypeManagement />}
          />
          <Route exact path="/elsewhere">
            <p>Elsewhere</p>
          </Route>
        </IntlProvider>
      </Router>,
    ),
    history,
  };
};
const edit = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  return await screen.findByRole("dialog");
};
const newDraft = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "新增标本类型" }));
  const dialog = await screen.findByRole("dialog");
  for (const [label, value] of [
    ["中文显示名称", "血浆"],
    ["内部标识名称", "Plasma-internal"],
    ["英文名称", "Plasma"],
    ["法文名称", "Plasma-fr"],
  ])
    fireEvent.change(within(dialog).getByLabelText(label), {
      target: { value },
    });
  return dialog;
};
const modifyZh = (dialog, value = "新血清") =>
  fireEvent.change(within(dialog).getByLabelText("中文显示名称"), {
    target: { value },
  });
const settle = async (callback, value) => {
  await act(async () => {
    callback(value);
  });
};
const okPut = {
  ok: true,
  status: 200,
  json: async () => ({ success: true, data: detail }),
};

beforeEach(() => {
  vi.resetAllMocks();
  apiMocks.get.mockImplementation(defaultGet);
  apiMocks.put.mockImplementation((_url, _payload, callback) =>
    callback(okPut),
  );
});

describe("SampleTypeManagement basic editor", () => {
  test("renders the Chinese list and English fallback", async () => {
    const first = renderPage();
    expect(await screen.findByText("标本类型管理")).toBeInTheDocument();
    expect(screen.getByText("血清")).toBeInTheDocument();
    expect(screen.getByLabelText("页码，共1页")).toBeInTheDocument();
    first.unmount();
    renderPage({ locale: "en", messages: enMessages });
    expect(
      await screen.findByText("Sample Type Management"),
    ).toBeInTheDocument();
    expect(screen.getByText("Add Sample Type")).toBeInTheDocument();
  });
  test("opens create over the list, preserves legacy new links, and cancels a clean draft", async () => {
    renderPage({
      entry: "/MasterListsPage/SampleTypeManagement/new/basic-info",
    });
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "创建标本类型" }),
    ).toBeDisabled();
    expect(screen.getByText("血清")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  test("filters and offers list load retry", async () => {
    let count = 0;
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types" && ++count === 1
        ? callback(undefined)
        : defaultGet(url, callback),
    );
    renderPage();
    expect(await screen.findByText("无法加载标本类型")).toBeInTheDocument();
    fireEvent.click(screen.getByText("重新加载"));
    await screen.findByText("血清");
    fireEvent.change(screen.getByPlaceholderText("搜索标本类型…"), {
      target: { value: "不存在" },
    });
    expect(
      screen.getByText("没有符合当前筛选条件的标本类型。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("清除筛选条件"));
    expect(screen.getByText("血清")).toBeInTheDocument();
  });
  test("fetches complete details, preserves translation metadata, and stays on the list URL", async () => {
    const { history } = renderPage();
    const dialog = await edit();
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/rest/sample-types/5",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(within(dialog).getByLabelText("简称")).toHaveValue("SR");
    expect(within(dialog).getByLabelText("英文名称")).toHaveValue("Serum");
    expect(within(dialog).getByLabelText("法文名称")).toHaveValue("Sérum");
    expect(within(dialog).getByLabelText("内部标识名称")).toHaveAttribute(
      "readonly",
    );
    expect(history.location.pathname).toBe(
      "/MasterListsPage/SampleTypeManagement",
    );
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await screen.findByText("标本类型已保存。");
    expect(JSON.parse(apiMocks.put.mock.calls[0][1])).toEqual({
      id: "5",
      nameZh: "新血清",
      abbreviation: "SR",
      domain: "CLINICAL",
      isActive: true,
    });
    expect(detail.translations).toEqual({
      zh: "血清",
      en: "Serum",
      fr: "Sérum",
      ar: "مصل",
    });
    expect(detail.sortOrder).toBe(7);
  });
  test("does not present an English fallback as canonical Chinese", async () => {
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types/5"
        ? callback({
            success: true,
            data: {
              ...detail,
              name: "Serum",
              translations: { en: "Serum", fr: "Sérum" },
            },
          })
        : defaultGet(url, callback),
    );
    renderPage();
    const dialog = await edit();
    expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("简称"), {
      target: { value: "S1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await screen.findByText("标本类型已保存。");
    expect(JSON.parse(apiMocks.put.mock.calls[0][1])).not.toHaveProperty(
      "nameZh",
    );
  });
  test("requires complete details before saving and retries a failed or mismatched record", async () => {
    let attempts = 0;
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types/5"
        ? callback(
            ++attempts === 1
              ? { success: true, data: { ...detail, id: "6" } }
              : { success: true, data: detail },
          )
        : defaultGet(url, callback),
    );
    renderPage();
    const dialog = await edit();
    expect(
      within(dialog).getByText("无法加载标本类型完整详情，请重试。"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
    expect(within(dialog).queryByLabelText("简称")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "重新加载" }));
    expect(await within(dialog).findByLabelText("简称")).toHaveValue("SR");
  });
  test("rejects a successful same-ID list projection as incomplete details, then recovers with a full GET", async () => {
    let reads = 0;
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types/5"
        ? callback({
            success: true,
            data: ++reads === 1 ? sampleTypes[0] : detail,
          })
        : defaultGet(url, callback),
    );
    renderPage();
    const dialog = await edit();
    await within(dialog).findByText("无法加载标本类型完整详情，请重试。");
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
    expect(within(dialog).queryByLabelText("简称")).not.toBeInTheDocument();
    expect(apiMocks.put).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "重新加载" }));
    expect(await within(dialog).findByLabelText("简称")).toHaveValue("SR");
  });
  test("ignores a closed modal's late details and a prior ID when the next ID is loaded", async () => {
    const requests = [];
    apiMocks.get.mockImplementation((url, callback) =>
      url.startsWith("/rest/sample-types/")
        ? requests.push({ url, callback })
        : defaultGet(url, callback),
    );
    renderPage();
    let dialog = await edit();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    dialog = await edit();
    await settle(requests[1].callback, { success: true, data: detail });
    await settle(requests[0].callback, {
      success: true,
      data: { ...detail, abbreviation: "OLD" },
    });
    expect(within(dialog).getByLabelText("简称")).toHaveValue("SR");
  });
  test.each([400, 403, 409, 500])(
    "preserves the dirty draft after failed PUT %s and permits retry",
    async (status) => {
      apiMocks.put.mockImplementationOnce((_url, _payload, callback) =>
        callback(status ? { ok: false, status } : undefined),
      );
      renderPage();
      const dialog = await edit();
      modifyZh(dialog);
      fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
      expect(
        await within(dialog).findByText(
          zhMessages["message.sampleType.update.error"],
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue(
        "新血清",
      );
      expect(screen.queryByText("标本类型已保存。")).not.toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
      await screen.findByText("标本类型已保存。");
      expect(apiMocks.put).toHaveBeenCalledTimes(2);
    },
  );
  test.each(["取消", "关闭", "Escape"])(
    "confirms a dirty draft on %s and can continue editing or discard",
    async (trigger) => {
      renderPage();
      const dialog = await edit();
      modifyZh(dialog);
      if (trigger === "Escape")
        fireEvent.keyDown(dialog, {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
        });
      else
        fireEvent.click(within(dialog).getByRole("button", { name: trigger }));
      const confirmation = await screen.findByText("尚有未保存的修改");
      expect(confirmation).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
      expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue(
        "新血清",
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
      fireEvent.click(screen.getByRole("button", { name: "放弃修改并返回" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(apiMocks.put).not.toHaveBeenCalled();
    },
  );
  test("locks repeated save, fields, X/Escape, Cancel, and navigation while submitting", async () => {
    let callback;
    apiMocks.put.mockImplementation((_url, _payload, cb) => {
      callback = cb;
    });
    const { history } = renderPage();
    const dialog = await edit();
    modifyZh(dialog);
    const save = within(dialog).getByRole("button", { name: "保存" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(apiMocks.put).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText("中文显示名称")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
    act(() => history.push("/elsewhere"));
    expect(history.location.pathname).toBe(
      "/MasterListsPage/SampleTypeManagement",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await settle(callback, { ok: false, status: 500 });
    expect(within(dialog).getByLabelText("中文显示名称")).not.toBeDisabled();
  });
  test("preserves page and filters after save and gives complex configuration a restricted return context", async () => {
    const list = Array.from({ length: 24 }, (_, index) => ({
      ...sampleTypes[0],
      id: String(index + 1),
      name: `血清${index + 1}`,
    }));
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types"
        ? callback({ success: true, data: list })
        : url === "/rest/sample-types/11"
          ? callback({
              success: true,
              data: { ...detail, id: "11", name: "血清11" },
            })
          : defaultGet(url, callback),
    );
    const { history } = renderPage({
      entry:
        "/MasterListsPage/SampleTypeManagement?q=血清&domain=CLINICAL&page=2&pageSize=10",
    });
    const row = (await screen.findByText("血清11")).closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog");
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await screen.findByText("标本类型已保存。");
    expect(screen.getByPlaceholderText("搜索标本类型…")).toHaveValue("血清");
    expect(screen.getByLabelText("页码，共3页")).toHaveValue("2");
    expect(screen.getByText("血清11")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByText("血清11").closest("tr")).getByRole("button", {
        name: "关联配置",
      }),
    );
    expect(history.location.pathname).toBe(
      "/MasterListsPage/SampleTypeManagement/11/associated-tests",
    );
    const returnTo = new URLSearchParams(history.location.search).get(
      "returnTo",
    );
    expect(returnTo).toBe(
      "/MasterListsPage/SampleTypeManagement?q=%E8%A1%80%E6%B8%85&domain=CLINICAL&page=2&pageSize=10",
    );
    fireEvent.click(await screen.findByRole("button", { name: "返回列表" }));
    expect(history.location.search).toContain("page=2");
    expect(screen.getByText("血清11")).toBeInTheDocument();
  });
  test("treats a committed write with failed detail/list reload separately and retries GET only", async () => {
    let detailReads = 0;
    let listReads = 0;
    apiMocks.get.mockImplementation((url, callback) => {
      if (url === "/rest/sample-types/5")
        callback(
          ++detailReads === 2 ? undefined : { success: true, data: detail },
        );
      else if (url === "/rest/sample-types")
        callback(
          ++listReads === 2 ? undefined : { success: true, data: sampleTypes },
        );
      else defaultGet(url, callback);
    });
    renderPage();
    const dialog = await edit();
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await within(dialog).findByText(
      "保存已完成，但列表或详情刷新失败。请重新加载，勿重复保存。",
    );
    expect(
      within(dialog).queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
    );
    await within(dialog).findByText(
      "保存已完成，但列表或详情刷新失败。请重新加载，勿重复保存。",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
    );
    await screen.findByText("标本类型已保存。");
    expect(apiMocks.put).toHaveBeenCalledTimes(1);
  });
  test("creates with independent internal/en/fr/zh names, then reads the business ID before success", async () => {
    apiMocks.post.mockImplementation((_url, _payload, callback) =>
      callback({ createdSampleTypeId: "12" }),
    );
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types/12"
        ? callback({ success: true, data: { ...detail, id: "12" } })
        : defaultGet(url, callback),
    );
    renderPage();
    const dialog = await newDraft();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "创建标本类型" }),
    );
    await screen.findByText("标本类型已保存。");
    expect(JSON.parse(apiMocks.post.mock.calls[0][1])).toEqual({
      formName: "sampleTypeCreateForm",
      nameZh: "血浆",
      identifyingName: "Plasma-internal",
      sampleTypeEnglishName: "Plasma",
      sampleTypeFrenchName: "Plasma-fr",
      domain: "CLINICAL",
      active: false,
    });
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/rest/sample-types/12",
      expect.any(Function),
    );
  });
  test("does not call an empty creation response success or allow repeated creation before verification", async () => {
    apiMocks.post.mockImplementation((_url, _payload, callback) =>
      callback(undefined),
    );
    renderPage();
    const dialog = await newDraft();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "创建标本类型" }),
    );
    await within(dialog).findByText(
      "未取得已创建标本类型的编号，不能确认创建结果。请重新加载列表核对，勿重复创建。",
    );
    expect(screen.queryByText("标本类型已保存。")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "创建标本类型" }),
    ).not.toBeInTheDocument();
    expect(apiMocks.post).toHaveBeenCalledTimes(1);
  });
  test.each([false, true])(
    "does not repeat POST when transport failed and server creation was %s",
    async (serverCreated) => {
      let listReads = 0;
      apiMocks.post.mockImplementation((_url, _payload, callback) =>
        callback({ status: 0, error: "Failed to fetch" }),
      );
      apiMocks.get.mockImplementation((url, callback) => {
        if (url === "/rest/sample-types") {
          listReads += 1;
          callback({
            success: true,
            data:
              serverCreated && listReads > 1
                ? [
                    ...sampleTypes,
                    { ...sampleTypes[0], id: "12", name: "血浆" },
                  ]
                : sampleTypes,
          });
        } else defaultGet(url, callback);
      });
      renderPage();
      const dialog = await newDraft();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "创建标本类型" }),
      );
      await within(dialog).findByText(
        "未取得已创建标本类型的编号，不能确认创建结果。请重新加载列表核对，勿重复创建。",
      );
      expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("血浆");
      expect(within(dialog).getByLabelText("中文显示名称")).toBeDisabled();
      expect(
        within(dialog).queryByRole("button", { name: "创建标本类型" }),
      ).not.toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "重新加载" }));
      await act(async () => {});
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(!!screen.queryByText("血浆")).toBe(serverCreated);
      expect(screen.queryByText("标本类型已保存。")).not.toBeInTheDocument();
      expect(apiMocks.post).toHaveBeenCalledTimes(1);
    },
  );
  test.each([
    undefined,
    { status: 0, ok: false },
    { status: 200, ok: true, redirected: true },
  ])(
    "verifies an uncertain PUT against all requested fields before success (%s)",
    async (response) => {
      let putAttempted = false;
      apiMocks.put.mockImplementation((_url, _payload, callback) => {
        putAttempted = true;
        callback(response);
      });
      apiMocks.get.mockImplementation((url, callback) =>
        url === "/rest/sample-types/5"
          ? callback({
              success: true,
              data: putAttempted
                ? {
                    ...detail,
                    abbreviation: "S2",
                    translations: { ...detail.translations, zh: "新血清" },
                  }
                : detail,
            })
          : defaultGet(url, callback),
      );
      renderPage();
      const dialog = await edit();
      modifyZh(dialog);
      fireEvent.change(within(dialog).getByLabelText("简称"), {
        target: { value: "S2" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
      await screen.findByText("标本类型已保存。");
      expect(apiMocks.put).toHaveBeenCalledTimes(1);
      expect(
        apiMocks.get.mock.calls.filter(
          ([url]) => url === "/rest/sample-types/5",
        ),
      ).toHaveLength(2);
    },
  );
  test("retains an unconfirmed PUT draft and permits explicit save only after a different complete record is read", async () => {
    apiMocks.put.mockImplementationOnce((_url, _payload, callback) =>
      callback(undefined),
    );
    renderPage();
    const dialog = await edit();
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await within(dialog).findByText(
      zhMessages["sampleType.basic.update.notConfirmed"],
    );
    expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("新血清");
    expect(
      within(dialog).getByRole("button", { name: "保存" }),
    ).not.toBeDisabled();
    expect(screen.queryByText("标本类型已保存。")).not.toBeInTheDocument();
    expect(apiMocks.put).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await screen.findByText("标本类型已保存。");
    expect(apiMocks.put).toHaveBeenCalledTimes(2);
  });
  test("retries only GET when uncertain PUT verification fails or returns a projection", async () => {
    let reads = 0;
    apiMocks.put.mockImplementation((_url, _payload, callback) =>
      callback(undefined),
    );
    apiMocks.get.mockImplementation((url, callback) => {
      if (url === "/rest/sample-types/5") {
        reads += 1;
        callback(
          reads === 2
            ? undefined
            : {
                success: true,
                data:
                  reads === 3
                    ? sampleTypes[0]
                    : reads > 3
                      ? {
                          ...detail,
                          translations: {
                            ...detail.translations,
                            zh: "新血清",
                          },
                        }
                      : detail,
              },
        );
      } else defaultGet(url, callback);
    });
    renderPage();
    const dialog = await edit();
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await within(dialog).findByText(
      zhMessages["sampleType.basic.update.verificationFailed"],
    );
    expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("新血清");
    expect(within(dialog).getByLabelText("中文显示名称")).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
    );
    await within(dialog).findByText(
      zhMessages["sampleType.basic.update.verificationFailed"],
    );
    expect(apiMocks.put).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
    );
    await screen.findByText("标本类型已保存。");
    expect(apiMocks.put).toHaveBeenCalledTimes(1);
  });
  test("distinguishes a verified uncertain PUT from a later list refresh failure", async () => {
    let attempted = false;
    let listReads = 0;
    apiMocks.put.mockImplementation((_url, _payload, callback) => {
      attempted = true;
      callback(undefined);
    });
    apiMocks.get.mockImplementation((url, callback) => {
      if (url === "/rest/sample-types/5")
        callback({
          success: true,
          data: attempted
            ? {
                ...detail,
                translations: { ...detail.translations, zh: "新血清" },
              }
            : detail,
        });
      else if (url === "/rest/sample-types")
        callback(
          ++listReads === 2 ? undefined : { success: true, data: sampleTypes },
        );
      else defaultGet(url, callback);
    });
    renderPage();
    const dialog = await edit();
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await within(dialog).findByText(
      "保存已完成，但列表或详情刷新失败。请重新加载，勿重复保存。",
    );
    expect(
      within(dialog).queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
    );
    await screen.findByText("标本类型已保存。");
    expect(apiMocks.put).toHaveBeenCalledTimes(1);
  });
  test("rejects incomplete committed creation rereads and never repeats POST", async () => {
    let reads = 0;
    apiMocks.post.mockImplementation((_url, _payload, callback) =>
      callback({ createdSampleTypeId: "12" }),
    );
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types/12"
        ? callback({
            success: true,
            data:
              ++reads === 1
                ? { ...sampleTypes[0], id: "12" }
                : { ...detail, id: "12" },
          })
        : defaultGet(url, callback),
    );
    renderPage();
    const dialog = await newDraft();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "创建标本类型" }),
    );
    await within(dialog).findByText(
      "保存已完成，但列表或详情刷新失败。请重新加载，勿重复保存。",
    );
    expect(
      within(dialog).queryByRole("button", { name: "创建标本类型" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("血浆");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
    );
    await screen.findByText("标本类型已保存。");
    expect(apiMocks.post).toHaveBeenCalledTimes(1);
  });
  test("blocks clearing an existing Chinese name, validates actual internal/abbreviation limits, and does not impose a translation length rule", async () => {
    const first = renderPage();
    let dialog = await edit();
    modifyZh(dialog, "");
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(
      await within(dialog).findByText("请填写中文显示名称。"),
    ).toBeInTheDocument();
    first.unmount();
    renderPage();
    dialog = await newDraft();
    fireEvent.change(within(dialog).getByLabelText("内部标识名称"), {
      target: { value: "x".repeat(41) },
    });
    fireEvent.change(within(dialog).getByLabelText("英文名称"), {
      target: { value: "x".repeat(300) },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "创建标本类型" }),
    );
    expect(
      await within(dialog).findByText("请填写不超过 40 个字符的内部标识名称。"),
    ).toBeInTheDocument();
    expect(apiMocks.post).not.toHaveBeenCalled();
  });
  test.each([400, 403, 409, 500])(
    "preserves a rejected creation draft (%s) for an explicit retry",
    async (status) => {
      apiMocks.post
        .mockImplementationOnce((_url, _payload, callback) =>
          callback({ status, error: "Rejected" }),
        )
        .mockImplementationOnce((_url, _payload, callback) =>
          callback({ createdSampleTypeId: "12" }),
        );
      apiMocks.get.mockImplementation((url, callback) =>
        url === "/rest/sample-types/12"
          ? callback({ success: true, data: { ...detail, id: "12" } })
          : defaultGet(url, callback),
      );
      renderPage();
      const dialog = await newDraft();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "创建标本类型" }),
      );
      await within(dialog).findByText(
        zhMessages["message.sampleType.create.error"],
      );
      expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("血浆");
      expect(within(dialog).getByLabelText("内部标识名称")).toHaveValue(
        "Plasma-internal",
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "创建标本类型" }),
      );
      await screen.findByText("标本类型已保存。");
      expect(apiMocks.post).toHaveBeenCalledTimes(2);
    },
  );
  test("does not repeat creation after a successful ID when rereading fails", async () => {
    let reads = 0;
    apiMocks.post.mockImplementation((_url, _payload, callback) =>
      callback({ createdSampleTypeId: "12" }),
    );
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types/12"
        ? callback(
            ++reads === 1
              ? undefined
              : { success: true, data: { ...detail, id: "12" } },
          )
        : defaultGet(url, callback),
    );
    renderPage();
    const dialog = await newDraft();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "创建标本类型" }),
    );
    await within(dialog).findByText(
      "保存已完成，但列表或详情刷新失败。请重新加载，勿重复保存。",
    );
    expect(
      within(dialog).queryByRole("button", { name: "创建标本类型" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
    );
    await screen.findByText("标本类型已保存。");
    expect(apiMocks.post).toHaveBeenCalledTimes(1);
  });
  test.each(["create", "edit"])(
    "ignores a late %s write callback after unmount",
    async (mode) => {
      let callback;
      const api = mode === "create" ? apiMocks.post : apiMocks.put;
      api.mockImplementation((_url, _payload, cb) => {
        callback = cb;
      });
      const { unmount } = renderPage();
      const dialog = mode === "create" ? await newDraft() : await edit();
      if (mode === "edit") modifyZh(dialog);
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: mode === "create" ? "创建标本类型" : "保存",
        }),
      );
      const getCalls = apiMocks.get.mock.calls.length;
      unmount();
      await settle(
        callback,
        mode === "create" ? { createdSampleTypeId: "12" } : okPut,
      );
      expect(apiMocks.get).toHaveBeenCalledTimes(getCalls);
    },
  );
  test("does not issue refresh requests after unmount while a successful PUT body is pending", async () => {
    let resolveBody;
    apiMocks.put.mockImplementation((_url, _payload, callback) =>
      callback({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve) => {
            resolveBody = resolve;
          }),
      }),
    );
    const { unmount } = renderPage();
    const dialog = await edit();
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await act(async () => {});
    const calls = apiMocks.get.mock.calls.length;
    unmount();
    await act(async () => resolveBody({ success: true }));
    expect(apiMocks.get).toHaveBeenCalledTimes(calls);
  });
  test("confirms unsaved list navigation and follows the original destination only after discard", async () => {
    const { history } = renderPage();
    const dialog = await edit();
    modifyZh(dialog);
    act(() => history.push("/elsewhere"));
    expect(history.location.pathname).toBe(
      "/MasterListsPage/SampleTypeManagement",
    );
    fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
    expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("新血清");
    act(() => history.push("/elsewhere"));
    fireEvent.click(
      await screen.findByRole("button", { name: "放弃修改并返回" }),
    );
    expect(history.location.pathname).toBe("/elsewhere");
    expect(apiMocks.put).not.toHaveBeenCalled();
  });
  test("discards a legacy basic modal draft and retains freshly saved data after success", async () => {
    let saved = false;
    apiMocks.put.mockImplementation((_url, _payload, callback) => {
      saved = true;
      callback(okPut);
    });
    apiMocks.get.mockImplementation((url, callback) =>
      url === "/rest/sample-types/5"
        ? callback({
            success: true,
            data: saved
              ? {
                  ...detail,
                  name: "新血清",
                  translations: { ...detail.translations, zh: "新血清" },
                }
              : detail,
          })
        : defaultGet(url, callback),
    );
    renderPage({ entry: "/MasterListsPage/SampleTypeManagement/5/basic-info" });
    let dialog = await edit();
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃修改并返回" }));
    dialog = await edit();
    expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("血清");
    modifyZh(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await screen.findByText("新血清");
    dialog = await edit();
    expect(within(dialog).getByLabelText("中文显示名称")).toHaveValue("新血清");
  });
  test("supports a full-detail legacy basic link and discards an unsafe return destination", async () => {
    const { history } = renderPage({
      entry:
        "/MasterListsPage/SampleTypeManagement/5/basic-info?returnTo=https%3A%2F%2Fother.example%2F",
    });
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("简称")).toHaveValue("SR");
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回列表" }));
    expect(history.location.pathname).toBe(
      "/MasterListsPage/SampleTypeManagement",
    );
  });
  test("ignores old detail responses across IDs and unmount", async () => {
    const responses = [];
    apiMocks.get.mockImplementation((url, callback) =>
      url.startsWith("/rest/sample-types/")
        ? responses.push(callback)
        : defaultGet(url, callback),
    );
    const { history, unmount } = renderPage({
      entry: "/MasterListsPage/SampleTypeManagement/5/basic-info",
    });
    act(() =>
      history.push("/MasterListsPage/SampleTypeManagement/6/basic-info"),
    );
    await settle(responses[1], {
      success: true,
      data: { ...detail, id: "6", name: "新标本" },
    });
    await settle(responses[0], { success: true, data: detail });
    expect(screen.getByText("新标本")).toBeInTheDocument();
    expect(screen.queryByText("血清")).not.toBeInTheDocument();
    unmount();
    await settle(responses[1], { success: true, data: { ...detail, id: "6" } });
  });
});
