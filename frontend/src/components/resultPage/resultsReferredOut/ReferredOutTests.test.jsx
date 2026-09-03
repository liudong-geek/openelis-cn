import React from "react";
import { render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import zhMessages from "../../../languages/zh_CN.json";
import ReferredOutTests from "./ReferredOutTests";
import { getFromOpenElisServer } from "../../utils/Utils";

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
  default: () => <div data-testid="patient-search" />,
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
  analysisId: `A-${index}`,
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
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <ReferredOutTests />
    </IntlProvider>,
  );

const configureServer = (referralResponse) => {
  getFromOpenElisServer.mockImplementation((url, callback) => {
    if (url === "/rest/test-list") {
      callback([]);
      return;
    }
    if (url.startsWith("/rest/user-test-sections/")) {
      callback([]);
      return;
    }
    if (url.startsWith("/rest/ReferredOutTests?")) {
      callback(referralResponse);
    }
  });
};

const searchByLabNumber = async (value = "NO-SUCH-REFERRAL") => {
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "扫描或手动输入" }),
    value,
  );
  await user.click(screen.getByRole("button", { name: "按实验室编号查询" }));
  return user;
};

describe("ReferredOutTests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/ReferredOutTests");
  });

  test("初始态完整中文化，且查询前不渲染空表格和分页", async () => {
    configureServer({ referralDisplayItems: [] });

    const { container } = renderPage();

    expect(
      await screen.findByRole("heading", { name: "外送检验查询" }),
    ).toBeInTheDocument();
    expect(screen.getByText("发送日期")).toBeInTheDocument();
    expect(screen.getByText("请选择一种查询方式")).toBeInTheDocument();
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

    const referralCall = getFromOpenElisServer.mock.calls.find(([url]) =>
      url.startsWith("/rest/ReferredOutTests?"),
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
    expect(reportUrl.searchParams.get("analysisIds")).toBe("A-1,A-11");
    expect(openSpy.mock.calls[0][1]).toBe("_blank");
    expect(reportWindow.opener).toBeNull();
    openSpy.mockRestore();
  });

  test("不可选或缺少分析ID的记录不会进入全选和报告", async () => {
    configureServer({
      searchFinished: true,
      referralDisplayItems: [
        { ...makeReferral(1), disabled: true },
        { ...makeReferral(2), analysisId: "" },
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
    expect(reportUrl.searchParams.get("analysisIds")).toBe("A-3");
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
