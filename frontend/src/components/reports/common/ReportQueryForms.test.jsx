import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import zhMessages from "../../../languages/zh.json";
import { ConfigurationContext } from "../../layout/Layout";
import ReportByID from "./ReportByID";
import ReportByLabNo from "./ReportByLabNo";
import PatientStatusReport from "./PatientStatusReport";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: apiMocks.get,
}));

vi.mock("../../common/CustomLabNumberInput", () => ({
  default: ({ id, name, value, labelText, onChange, invalid, invalidText }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        name={`display_${name ?? id}`}
        value={value || ""}
        onChange={(event) => onChange(event, event.target.value)}
      />
      {invalid && <span>{invalidText}</span>}
    </label>
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

vi.mock("../../patient/SearchPatientForm", () => ({
  default: ({ getSelectedPatient }) => (
    <button
      type="button"
      onClick={() =>
        getSelectedPatient({
          patientPK: "42",
          patientID: "OE-42",
          nationalId: "N-42",
          firstName: "测试",
          lastName: "患者",
        })
      }
    >
      选择测试患者
    </button>
  ),
}));

const renderWithIntl = (ui, { withConfiguration = false } = {}) => {
  const content = withConfiguration ? (
    <ConfigurationContext.Provider
      value={{
        configurationProperties: {
          restrictFreeTextRefSiteEntry: "false",
          DEFAULT_DATE_LOCALE: "fr-FR",
        },
      }}
    >
      {ui}
    </ConfigurationContext.Provider>
  ) : (
    ui
  );

  return render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      {content}
    </IntlProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.get.mockImplementation((url, callback) => {
    callback(
      url.includes("departments-for-site")
        ? []
        : [{ id: "7", value: "测试机构" }],
    );
  });
  vi.spyOn(window, "open").mockReturnValue({ opener: window });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("report query forms", () => {
  const selectTestSite = () => {
    fireEvent.change(screen.getByRole("textbox", { name: /送检机构/ }), {
      target: { value: "测试" },
    });
    fireEvent.click(screen.getByText("测试机构"));
  };

  test("ReportByID localizes required validation and safely encodes the identifier", () => {
    renderWithIntl(
      <ReportByID report="patientSpecialReport" id="reports.button" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));
    expect(
      screen.getByText("请输入身份证件号码或患者唯一编号。"),
    ).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByRole("textbox", { name: /身份证件号码或患者唯一编号/ }),
      {
        target: { value: "病人 A&B/01" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.get("patientNumberDirect")).toBe(
      "病人 A&B/01",
    );
    expect(openedUrl.searchParams.get("report")).toBe("patientSpecialReport");
  });

  test("ReportByID preserves an alphanumeric national ID with hyphens", () => {
    renderWithIntl(
      <ReportByID report="patientSpecialReport" id="reports.button" />,
    );

    const input = screen.getByRole("textbox", {
      name: /身份证件号码或患者唯一编号/,
    });
    fireEvent.change(input, { target: { value: "CN-AZ-001X" } });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.get("patientNumberDirect")).toBe(
      "CN-AZ-001X",
    );
    expect(input).toHaveValue("CN-AZ-001X");
  });

  test("ReportByID shows a visible popup-blocked error without clearing criteria", () => {
    window.open.mockReturnValue(null);
    renderWithIntl(
      <ReportByID report="patientCollection" id="reports.button" />,
    );

    const input = screen.getByRole("textbox", {
      name: /身份证件号码或患者唯一编号/,
    });
    fireEvent.change(input, { target: { value: "N-100" } });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    expect(
      screen.getByText(
        "报告窗口被浏览器拦截，请允许此网站打开弹出式窗口后重试。",
      ),
    ).toBeInTheDocument();
    expect(input).toHaveValue("N-100");
  });

  test("ReportByLabNo handles the ALPHANUM display field name and normalizes a single number", () => {
    renderWithIntl(<ReportByLabNo report="patientARV1" id="reports.button" />);

    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));
    expect(
      screen.getAllByText("请至少输入一个实验室编号。").length,
    ).toBeGreaterThan(0);
    expect(window.open).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: /^起始实验室编号/ }), {
      target: { value: "LAB A&1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.get("accessionDirect")).toBe("LAB A&1");
    expect(openedUrl.searchParams.get("highAccessionDirect")).toBe("LAB A&1");
  });

  test("PatientStatusReport makes the active query method explicit and sends only it", () => {
    renderWithIntl(
      <PatientStatusReport report="patientEID1" id="reports.button" />,
      { withConfiguration: true },
    );

    expect(screen.getByText("请选择一种报告查询方式")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("按实验室编号查询"));
    fireEvent.change(screen.getByLabelText("起始实验室编号"), {
      target: { value: "LAB/2026 A&B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.get("accessionDirect")).toBe("LAB/2026 A&B");
    expect(openedUrl.searchParams.has("selPatient")).toBe(false);
    expect(openedUrl.searchParams.has("referringSiteId")).toBe(false);
    expect(openedUrl.searchParams.has("lowerDateRange")).toBe(false);
  });

  test("PatientStatusReport localizes date type and validates the date range", () => {
    renderWithIntl(
      <PatientStatusReport
        report="patientCILNSP_vreduit"
        id="reports.button"
      />,
      { withConfiguration: true },
    );

    fireEvent.click(screen.getByLabelText("按送检机构和日期查询"));
    expect(screen.getByText("日期类型")).toBeInTheDocument();
    expect(screen.getByText("结果日期")).toBeInTheDocument();

    selectTestSite();

    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));
    expect(screen.getByText("此报告类型需要日期范围")).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  test("PatientStatusReport requires a selected site and clears a stale selection when edited", () => {
    renderWithIntl(
      <PatientStatusReport
        report="patientCILNSP_vreduit"
        id="reports.button"
      />,
      { withConfiguration: true },
    );

    fireEvent.click(screen.getByLabelText("按送检机构和日期查询"));
    fireEvent.change(screen.getByRole("textbox", { name: /送检机构/ }), {
      target: { value: "手工输入机构" },
    });
    expect(
      screen.getByText("未找到匹配的送检机构，请调整关键词。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));
    expect(
      screen.getByText("请从建议列表中选择有效的送检机构。"),
    ).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();

    selectTestSite();
    fireEvent.change(screen.getByRole("textbox", { name: /送检机构/ }), {
      target: { value: "修改后的机构文字" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));
    expect(
      screen.getByText("请从建议列表中选择有效的送检机构。"),
    ).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  test("PatientStatusReport compares cross-month dates and encodes slashes once", () => {
    renderWithIntl(
      <PatientStatusReport
        report="patientCILNSP_vreduit"
        id="reports.button"
      />,
      { withConfiguration: true },
    );

    fireEvent.click(screen.getByLabelText("按送检机构和日期查询"));
    selectTestSite();
    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: "31/01/2026" },
    });
    fireEvent.change(screen.getByLabelText("结束日期"), {
      target: { value: "01/02/2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    const reportUrl = window.open.mock.calls[0][0];
    expect(reportUrl).toContain("lowerDateRange=31%2F01%2F2026");
    expect(reportUrl).not.toContain("%252F");
    const openedUrl = new URL(reportUrl, "http://local");
    expect(openedUrl.searchParams.get("lowerDateRange")).toBe("31/01/2026");
    expect(openedUrl.searchParams.get("upperDateRange")).toBe("01/02/2026");
    expect(openedUrl.searchParams.get("referringSiteId")).toBe("7");
  });

  test("PatientStatusReport confirms the chosen patient before opening", () => {
    renderWithIntl(
      <PatientStatusReport report="patientEID1" id="reports.button" />,
      { withConfiguration: true },
    );

    fireEvent.click(screen.getByText("选择测试患者"));
    expect(screen.getByText("已选择患者")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.get("selPatient")).toBe("42");
    expect(openedUrl.searchParams.has("accessionDirect")).toBe(false);
  });
});
