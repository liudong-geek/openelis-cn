import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import zhMessages from "../../../languages/zh.json";
import { ConfigurationContext } from "../../layout/Layout";
import { getFromOpenElisServer } from "../../utils/Utils";
import SystemAuditEvents from "./SystemAuditEvents";

vi.mock("@carbon/react", async (importOriginal) => {
  const actual = await importOriginal();
  const ReactModule = await import("react");
  return {
    ...actual,
    DatePicker: ({ children, dateFormat, value, onChange }) =>
      ReactModule.createElement(
        "div",
        {
          "data-testid": "audit-date-picker",
          "data-date-format": dateFormat,
        },
        ReactModule.Children.map(children, (child) =>
          ReactModule.cloneElement(child, {
            value,
            onChange: (event) => onChange([], event.target.value),
          }),
        ),
      ),
    DatePickerInput: ({ id, labelText, placeholder, value, onChange }) =>
      ReactModule.createElement(
        "label",
        { htmlFor: id },
        labelText,
        ReactModule.createElement("input", {
          id,
          placeholder,
          value: value || "",
          onChange,
        }),
      ),
  };
});

vi.mock("../../utils/Utils", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getFromOpenElisServer: vi.fn((url, callback) => {
      if (url === "/rest/systemAuditEvents/entityTypes") {
        callback([
          { id: "1", name: "PATIENT" },
          { id: "2", name: "TEST_SECTION" },
        ]);
      } else if (url === "/rest/users") {
        callback([]);
      } else {
        callback({ events: [], totalItems: 0 });
      }
    }),
  };
});

vi.mock("../../patient/SearchPatientForm", () => ({
  default: () => null,
}));

const renderPage = () =>
  render(
    <ConfigurationContext.Provider
      value={{
        configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" },
      }}
    >
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <SystemAuditEvents />
      </IntlProvider>
    </ConfigurationContext.Provider>,
  );

describe("中国版操作日志查询", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url === "/rest/systemAuditEvents/entityTypes") {
        callback([
          { id: "1", name: "PATIENT" },
          { id: "2", name: "TEST_SECTION" },
        ]);
      } else if (url === "/rest/users") {
        callback([]);
      } else {
        callback({ events: [], totalItems: 0 });
      }
    });
  });

  test("日期按年/月/日显示，并按 ISO 日期调用后台", () => {
    renderPage();

    const datePickers = screen.getAllByTestId("audit-date-picker");
    expect(datePickers).toHaveLength(2);
    datePickers.forEach((picker) =>
      expect(picker).toHaveAttribute("data-date-format", "Y/m/d"),
    );

    const startDate = screen.getByLabelText("开始日期");
    const endDate = screen.getByLabelText("结束日期");
    expect(startDate).toHaveAttribute("placeholder", "年/月/日");
    expect(endDate).toHaveAttribute("placeholder", "年/月/日");

    fireEvent.change(startDate, { target: { value: "2026/08/01" } });
    fireEvent.change(endDate, { target: { value: "2026/08/24" } });
    fireEvent.click(screen.getByRole("button", { name: /搜索/ }));

    const request = getFromOpenElisServer.mock.calls.find(([url]) =>
      url.startsWith("/rest/systemAuditEvents?"),
    );
    expect(request?.[0]).toContain("startDate=2026-08-01");
    expect(request?.[0]).toContain("endDate=2026-08-24");
  });

  test("列表、空态替代内容和分页不回退英文", async () => {
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url === "/rest/systemAuditEvents/entityTypes") {
        callback([{ id: "1", name: "PATIENT" }]);
      } else if (url === "/rest/users") {
        callback([]);
      } else {
        callback({
          events: [
            {
              timestamp: "2026-08-24T08:30:00Z",
              entityType: "PATIENT",
              entityId: "1001",
              action: "INSERT",
              user: "tester",
              changes: { firstName: { old: "旧名", new: "新名" } },
            },
          ],
          totalItems: 26,
        });
      }
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /搜索/ }));

    expect(await screen.findByText("患者档案")).toBeInTheDocument();
    expect(screen.getByText("新增")).toBeInTheDocument();
    expect(screen.getByText("名：旧名 → 新名")).toBeInTheDocument();
    expect(screen.getByText("第 1–25 项，共 26 项")).toBeInTheDocument();
    expect(screen.getByText("每页显示")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeInTheDocument();
  });
});
