import React from "react";
import { render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import zhMessages from "../../../languages/zh_CN.json";
import ReferredOutTests from "./ReferredOutTests";
import { getFromOpenElisServer } from "../../utils/Utils";
import { ConfigurationContext } from "../../layout/Layout";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";

vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return { ConfigurationContext: createContext({}) };
});

const actor = {
  authenticated: true,
  userId: "17",
  sessionId: "synthetic-referral-session",
  roles: ["Results"],
  loginLabUnit: "化学组",
  userLabRolesMap: { 化学组: ["Results"] },
};
const json = (value, status = 200) =>
  new Response(value === undefined ? "" : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

vi.mock("../../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../../utils/Utils");
  return {
    ...actualUtils,
    getFromOpenElisServer: vi.fn(),
  };
});

vi.mock("../../common/PageBreadCrumb", () => ({
  default: () => null,
}));

vi.mock("../../patient/SearchPatientForm", () => ({
  default: ({ compactSearch }) => (
    <div
      data-testid="patient-search"
      data-compact-search={String(Boolean(compactSearch))}
    />
  ),
}));

vi.mock("../../common/CustomDatePicker", () => ({
  default: ({ id, labelText, value, onChange }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  ),
}));

vi.mock("../../common/CustomLabNumberInput", () => ({
  default: ({ id, labelText, value, onChange }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        value={value || ""}
        onChange={(event) => onChange(event, event.target.value)}
      />
    </label>
  ),
}));

const makeReferral = (index) => ({
  analysisId: String(index),
  resultDate: `2026-08-${String(index).padStart(2, "0")}`,
  accessionNumber: `LN-${String(index).padStart(3, "0")}`,
  referredSendDate: "2026-08-01",
  referralStatus: "SENT",
  referralStatusDisplay: "SENT",
  patientLastName: `患者${index}`,
  patientFirstName: "测试",
  referringTestName: "血常规",
  referralResultsDisplay: "正常",
  referenceLabDisplay: "中心实验室",
  notes: "",
  disabled: false,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/ReferredOutTests"]}>
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" } }}
        >
          <UserSessionDetailsContext.Provider
            value={{ userSessionDetails: actor }}
          >
            <ReferredOutTests />
          </UserSessionDetailsContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

const configureServer = (referralResponse, { deferOptions = false } = {}) => {
  getFromOpenElisServer.mockImplementation((url, callback) => {
    if (
      !deferOptions &&
      (url === "/rest/test-list" || url.startsWith("/rest/user-test-sections/"))
    )
      callback([]);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      if (String(url).endsWith("/session")) return Promise.resolve(json(actor));
      if (String(url).includes("/rest/ReferredOutTests?"))
        return Promise.resolve(
          json(referralResponse, referralResponse?.status || 200),
        );
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
};

const searchByLabNumber = async (value = "NO-SUCH-REFERRAL") => {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("查询类别"), "LAB_NUMBER");
  await user.type(screen.getByLabelText("实验室编号"), value);
  await user.click(screen.getByRole("button", { name: "搜索" }));
  return user;
};

describe("ReferredOutTests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/ReferredOutTests");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("初始态完整中文化，且查询准备前不渲染空表格和分页", async () => {
    configureServer({ referralDisplayItems: [] }, { deferOptions: true });

    const { container } = renderPage();

    expect(
      await screen.findByRole("heading", { name: "外送检验查询" }),
    ).toBeInTheDocument();
    expect(screen.getByText("发送日期")).toBeInTheDocument();
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText("查询类别"), "PATIENT");
    expect(screen.getByTestId("patient-search")).toHaveAttribute(
      "data-compact-search",
      "true",
    );
    expect(
      screen.getByText("查询条件已变更，请点击搜索。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下一页" }),
    ).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("Sent Date");
    expect(container).not.toHaveTextContent("Total items selected");
  });

  test("按实验室编号查询无结果时显示中文空状态，并隐藏空表和分页", async () => {
    configureServer({ searchFinished: true, referralDisplayItems: [] });
    renderPage();

    await searchByLabNumber("NO SUCH/1");

    expect(await screen.findByText("未找到匹配的外送记录")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下一页" }),
    ).not.toBeInTheDocument();

    const referralCall = fetch.mock.calls.find(
      ([url]) =>
        String(url).includes("/rest/ReferredOutTests?") &&
        new URL(url, "http://openelis.local").searchParams.get("searchType") ===
          "LAB_NUMBER",
    );
    const requestUrl = new URL(referralCall[0], "http://openelis.local");
    expect(requestUrl.searchParams.get("searchType")).toBe("LAB_NUMBER");
    expect(requestUrl.searchParams.get("labNumber")).toBe("NO SUCH/1");
  });

  test("服务端未返回响应体时结束加载并显示中文错误状态", async () => {
    configureServer(undefined);
    renderPage();

    await searchByLabNumber();

    expect(await screen.findByText("外送记录查询失败")).toBeInTheDocument();
    expect(screen.queryByText("正在查询外送记录…")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("权限错误响应不会被误判为无数据", async () => {
    configureServer({ status: 403, message: "Forbidden" });
    renderPage();

    await searchByLabNumber();

    expect(await screen.findByText("外送记录查询失败")).toBeInTheDocument();
    expect(screen.queryByText("未找到匹配的外送记录")).not.toBeInTheDocument();
  });

  test("成功态显示中文列值，跨页选择会累积并生成正确报告参数", async () => {
    configureServer({
      searchFinished: true,
      referralDisplayItems: Array.from({ length: 11 }, (_, index) =>
        makeReferral(index + 1),
      ),
    });
    const reportWindow = { focus: vi.fn(), opener: window };
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => reportWindow);
    renderPage();

    const user = await searchByLabNumber("LAB-2026");

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("LN-001")).toBeInTheDocument();
    expect(screen.getAllByText("已发送").length).toBeGreaterThan(0);
    expect(screen.queryByText("LN-011")).not.toBeInTheDocument();
    expect(screen.getAllByText(/共\s*2\s*页/).length).toBeGreaterThan(0);

    const firstRow = screen.getByRole("row", { name: /LN-001/ });
    await user.click(within(firstRow).getByRole("checkbox"));

    await user.click(screen.getByRole("button", { name: "下一页" }));

    const lastRow = await screen.findByRole("row", { name: /LN-011/ });
    await user.click(within(lastRow).getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "打印选定的患者报告" }),
    );

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
    });
    const reportUrl = new URL(
      openSpy.mock.calls[0][0],
      "http://openelis.local",
    );
    expect(reportUrl.searchParams.get("analysisIds")).toBe("1,11");
    expect(openSpy.mock.calls[0][1]).toBe("_blank");
    expect(reportWindow.opener).toBeNull();
    openSpy.mockRestore();
  });

  test("不可选或缺少分析ID的记录不会进入全选和报告", async () => {
    configureServer({
      searchFinished: true,
      referralDisplayItems: [
        { ...makeReferral(1), disabled: true },
        { ...makeReferral(2), analysisId: null },
        makeReferral(3),
      ],
    });
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => ({ focus: vi.fn(), opener: window }));
    renderPage();

    const user = await searchByLabNumber("LAB-PERMISSION");
    const disabledRow = await screen.findByRole("row", { name: /LN-001/ });
    const missingIdRow = screen.getByRole("row", { name: /LN-002/ });
    expect(within(disabledRow).getByRole("checkbox")).toBeDisabled();
    expect(within(missingIdRow).getByRole("checkbox")).toBeDisabled();

    await user.click(disabledRow);
    expect(
      screen.getByRole("button", { name: "打印选定的患者报告" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "选择全部" }));
    await user.click(
      screen.getByRole("button", { name: "打印选定的患者报告" }),
    );

    const reportUrl = new URL(
      openSpy.mock.calls[0][0],
      "http://openelis.local",
    );
    expect(reportUrl.searchParams.get("analysisIds")).toBe("3");
    openSpy.mockRestore();
  });

  test("报告窗口被拦截时给出明确错误反馈", async () => {
    configureServer({
      searchFinished: true,
      referralDisplayItems: [makeReferral(1)],
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderPage();

    const user = await searchByLabNumber("LAB-POPUP");
    const row = await screen.findByRole("row", { name: /LN-001/ });
    await user.click(within(row).getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "打印选定的患者报告" }),
    );

    expect(
      await screen.findByText("生成报告失败。请重试。"),
    ).toBeInTheDocument();
    openSpy.mockRestore();
  });
});
