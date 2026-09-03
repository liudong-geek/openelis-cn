import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import zhMessages from "../languages/zh.json";
import enMessages from "../languages/en.json";
import UserSessionDetailsContext from "../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "./layout/Layout";
import ColdStorageReports from "./coldStorage/Reports";
import CreateDistribution from "./eqa/EQADistribution/CreateDistribution";
import ControlLotSetup from "./qc/controlLots/ControlLotSetup";
import ReportNonConformingEvent from "./nonconform/common/ReportNonConformingEvent";
import InlineNceForm from "./nonconform/common/InlineNceForm";
import ShipmentDashboard from "./shipment/ShipmentDashboard";
import ShipmentReport from "./shipment/ShipmentReport";
import InventoryReports from "./inventory/InventoryReports";
import LotEntryModal from "./inventory/LotEntryModal";

vi.mock("@carbon/react", async (importOriginal) => {
  const actual = await importOriginal();
  const ReactModule = await import("react");

  return {
    ...actual,
    DatePicker: ({ children, dateFormat, datePickerType, maxDate, value }) =>
      ReactModule.createElement(
        "div",
        {
          "data-testid": "locale-date-picker",
          "data-date-format": dateFormat,
          "data-picker-type": datePickerType,
          "data-max-date": maxDate,
          "data-value": value,
        },
        children,
      ),
    DatePickerInput: ({ id, labelText, placeholder }) =>
      ReactModule.createElement(
        "label",
        { htmlFor: id },
        labelText,
        ReactModule.createElement("input", { id, placeholder }),
      ),
  };
});

vi.mock("./utils/Utils", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getFromOpenElisServer: vi.fn((_url, callback) => callback?.([])),
    postToOpenElisServerFullResponse: vi.fn(),
    postToOpenElisServerJsonResponse: vi.fn(),
    postToOpenElisServerFormData: vi.fn(),
  };
});

vi.mock("./coldStorage/api", () => ({
  fetchReportExcursions: vi.fn().mockResolvedValue([]),
  fetchAuditTrail: vi.fn().mockResolvedValue([]),
  downloadReportDirect: vi.fn(),
}));

vi.mock("./inventory/InventoryService", () => ({
  InventoryItemAPI: { getAll: vi.fn().mockResolvedValue([]) },
  InventoryLotAPI: {},
  InventoryManagementAPI: { receive: vi.fn() },
  StorageLocationAPI: { getAll: vi.fn().mockResolvedValue([]) },
  ReportsAPI: { generate: vi.fn() },
}));

vi.mock("./inventory/StorageLocationModal", () => ({
  default: () => null,
}));

vi.mock("./qc/controlLots/StatisticsConfigSection", () => ({
  default: () => null,
}));

const notificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};

const renderPage = (
  component,
  {
    dateLocale = "zh-CN",
    intlLocale = "zh-CN",
    messages = zhMessages,
    withConfigurationProvider = true,
  } = {},
) => {
  const content = withConfigurationProvider ? (
    <ConfigurationContext.Provider
      value={{
        configurationProperties: { DEFAULT_DATE_LOCALE: dateLocale },
      }}
    >
      {component}
    </ConfigurationContext.Provider>
  ) : (
    component
  );

  return render(
    <MemoryRouter>
      <IntlProvider locale={intlLocale} messages={messages} onError={() => {}}>
        <NotificationContext.Provider value={notificationContext}>
          <UserSessionDetailsContext.Provider
            value={{ userSessionDetails: { authenticated: false } }}
          >
            {content}
          </UserSessionDetailsContext.Provider>
        </NotificationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
};

const expectChineseDateInputs = (inputIds) => {
  inputIds.forEach((id) => {
    expect(document.getElementById(id)).toHaveAttribute(
      "placeholder",
      "年/月/日",
    );
  });
  const datePickers = screen.getAllByTestId("locale-date-picker");
  expect(datePickers.length).toBeGreaterThan(0);
  datePickers.forEach((datePicker) => {
    expect(datePicker).toHaveAttribute("data-date-format", "Y/m/d");
  });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("中国交付次级页面日期控件", () => {
  test("冷藏监控报表使用年/月/日", () => {
    renderPage(<ColdStorageReports devices={[]} />);
    expectChineseDateInputs(["reports-start-date", "reports-end-date"]);
  });

  test("室间质评发放页使用年/月/日，并在缺少配置上下文时安全回退中文格式", () => {
    renderPage(<CreateDistribution />, { withConfigurationProvider: false });
    expectChineseDateInputs(["distribution-deadline"]);
  });

  test("质控批号设置页使用年/月/日", () => {
    renderPage(<ControlLotSetup />);
    expectChineseDateInputs(["expiration-date"]);
  });

  test("不符合项主表单与内嵌表单都使用年/月/日", () => {
    renderPage(<ReportNonConformingEvent />);
    expectChineseDateInputs(["date-of-event"]);
    expect(screen.getByTestId("locale-date-picker")).toHaveAttribute(
      "data-max-date",
      expect.stringMatching(/^\d{4}\/\d{2}\/\d{2}$/),
    );

    cleanup();
    renderPage(<InlineNceForm resultRow={null} onClose={vi.fn()} />);
    expectChineseDateInputs(["inline-nce-date"]);
  });

  test("标本转运看板与转运报表都使用年/月/日", () => {
    renderPage(<ShipmentDashboard />);
    expectChineseDateInputs(["date-from", "date-to"]);

    cleanup();
    renderPage(<ShipmentReport />);
    expectChineseDateInputs(["report-date-from", "report-date-to"]);
  });

  test("试剂耗材报表与批号录入都使用年/月/日", () => {
    renderPage(<InventoryReports />);
    expectChineseDateInputs(["startDate", "endDate"]);

    cleanup();
    renderPage(<LotEntryModal open onClose={vi.fn()} onSave={vi.fn()} />);
    expectChineseDateInputs(["expirationDate", "receiptDate"]);
  });

  test.each([
    ["en-US", "mm/dd/yyyy", "m/d/Y"],
    ["fr-FR", "dd/mm/yyyy", "d/m/Y"],
  ])("室间质评页保留 %s 日期兼容", (dateLocale, placeholder, format) => {
    renderPage(<CreateDistribution />, {
      dateLocale,
      intlLocale: "en",
      messages: enMessages,
    });

    expect(document.getElementById("distribution-deadline")).toHaveAttribute(
      "placeholder",
      placeholder,
    );
    expect(screen.getByTestId("locale-date-picker")).toHaveAttribute(
      "data-date-format",
      format,
    );
  });
});
