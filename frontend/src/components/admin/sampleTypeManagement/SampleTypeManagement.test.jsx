import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Route } from "react-router-dom";
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
  putToOpenElisServer: apiMocks.put,
}));

const sampleTypes = [
  {
    id: "5",
    name: "血清",
    description: "用于常规生化检测",
    domain: "CLINICAL",
    isActive: true,
    testCount: 8,
  },
];

const installSuccessfulApi = () => {
  apiMocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/domains") {
      callback([
        { id: "CLINICAL", labelKey: "label.domain.CLINICAL" },
        { id: "ENVIRONMENTAL", labelKey: "label.domain.ENVIRONMENTAL" },
      ]);
    } else if (url === "/rest/sample-types") {
      callback({ success: true, data: sampleTypes });
    } else if (url.includes("AllTestsForSampleTypeProvider")) {
      callback({ tests: [] });
    }
  });
};

const renderPage = ({
  entry = "/MasterListsPage/SampleTypeManagement",
  locale = "zh-CN",
  messages = zhMessages,
} = {}) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <IntlProvider locale={locale} messages={messages}>
        <Route
          path="/MasterListsPage/SampleTypeManagement/:sampleTypeId?/:section?"
          render={() => <SampleTypeManagement />}
        />
      </IntlProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  installSuccessfulApi();
});

describe("SampleTypeManagement", () => {
  test("renders the list and its primary actions in Chinese", async () => {
    renderPage();

    expect(await screen.findByText("标本类型管理")).toBeInTheDocument();
    expect(screen.getByText("新增标本类型")).toBeInTheDocument();
    expect(screen.getByText("血清")).toBeInTheDocument();
    expect(screen.getByLabelText("页码，共1页")).toBeInTheDocument();
    expect(
      screen.queryByText("Sample Type Management"),
    ).not.toBeInTheDocument();
  });

  test("opens the add form and returns to the list", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("新增标本类型"));
    expect(screen.getByText("新增标本类型")).toBeInTheDocument();
    expect(screen.getByText("创建标本类型")).toBeInTheDocument();

    fireEvent.click(screen.getByText("返回列表"));
    expect(await screen.findByText("血清")).toBeInTheDocument();
  });

  test("makes an empty filtered result recoverable", async () => {
    renderPage();
    await screen.findByText("血清");

    fireEvent.change(screen.getByPlaceholderText("搜索标本类型…"), {
      target: { value: "不存在" },
    });

    expect(
      screen.getByText("没有符合当前筛选条件的标本类型。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("清除筛选条件"));
    expect(await screen.findByText("血清")).toBeInTheDocument();
  });

  test("offers retry after a loading failure and recovers", async () => {
    let sampleTypeRequests = 0;
    apiMocks.get.mockImplementation((url, callback) => {
      if (url === "/rest/domains") {
        callback([{ id: "CLINICAL", labelKey: "label.domain.CLINICAL" }]);
      } else if (url === "/rest/sample-types") {
        sampleTypeRequests += 1;
        callback(
          sampleTypeRequests === 1
            ? undefined
            : { success: true, data: sampleTypes },
        );
      }
    });

    renderPage();
    expect(await screen.findByText("无法加载标本类型")).toBeInTheDocument();

    fireEvent.click(screen.getByText("重新加载"));
    expect(await screen.findByText("血清")).toBeInTheDocument();
    expect(sampleTypeRequests).toBe(2);
  });

  test("shows a recoverable not-found state for an invalid editor link", async () => {
    renderPage({
      entry: "/MasterListsPage/SampleTypeManagement/missing/basic-info",
    });

    expect(await screen.findByText("未找到标本类型")).toBeInTheDocument();
    expect(screen.getByText("返回列表")).toBeInTheDocument();
    expect(screen.queryByText("正在加载标本类型…")).not.toBeInTheDocument();
  });

  test("retains English fallback coverage", async () => {
    renderPage({ locale: "en", messages: enMessages });
    expect(
      await screen.findByText("Sample Type Management"),
    ).toBeInTheDocument();
    expect(screen.getByText("Add Sample Type")).toBeInTheDocument();
  });
});
