import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UnifiedResults from "./UnifiedResults";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import messages from "../../../languages/en.json";
import zhMessages from "../../../languages/zh.json";
import {
  readResultWorkbench as getFromOpenElisServer,
  saveResultWorkbench as postToOpenElisServerJsonResponse,
} from "./resultEntryTransport";

vi.mock("./resultEntryTransport", () => ({
  readResultWorkbench: vi.fn(),
  saveResultWorkbench: vi.fn(),
}));
vi.mock("./useResultPresence", () => ({
  useResultPresence: () => ({ presence: {}, unavailable: false }),
}));

const signatureControls = vi.hoisted(() => ({ delayed: false, callbacks: [] }));

vi.mock("../../utils/Utils", async () => ({
  ...(await vi.importActual("../../utils/Utils")),
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerJsonResponse: vi.fn(),
  postToOpenElisServer: vi.fn(),
}));

vi.mock("./usePresence", () => ({
  usePresence: () => ({}),
}));

vi.mock("../../esignature/ESignatureButton", () => ({
  default: ({ onSign, children, disabled }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        signatureControls.callbacks.push(onSign);
        if (!signatureControls.delayed) onSign(null);
      }}
    >
      {children}
    </button>
  ),
  SignatureMeaning: { AUTHORED: "AUTHORED" },
}));

const pendingRow = {
  id: "0",
  analysisId: "42",
  sampleItemId: "201",
  testId: "401",
  analysisLastupdated: "1000",
  resultId: "",
  accessionNumber: "DEV01260000000000003",
  patientInfo: "P1-20260821-NID-0002",
  sampleType: "Whole blood",
  testName: "White blood cell count",
  normalRange: "4.0 - 10.0",
  unitsOfMeasure: "10^9/L",
  analysisStatusId: "4",
  resultType: "N",
  resultValue: "",
  reportable: "Y",
};

const savedReceipt = {
  reflex: [],
  calculated: [],
  analysisStatusId: "15",
  analysisLastupdated: "1755900000000",
};

const renderWorkbench = (
  pendingRows = [pendingRow],
  {
    dateLocale = "en-US",
    intlLocale = "en",
    intlMessages = messages,
    onNotification = vi.fn(),
    labUnitDomain = "CLINICAL",
    initialQuery = "scope=pending",
  } = {},
) => {
  getFromOpenElisServer.mockImplementation((url, callback) => {
    if (url === "/rest/results-entry/lab-units") {
      callback([{ id: "1", value: "Hematology", domain: labUnitDomain }]);
      return;
    }
    if (url === "/rest/analysis-status-types") {
      callback([
        { id: "4", value: "Not started" },
        { id: "15", value: "Technical Acceptance" },
      ]);
      return;
    }
    if (
      url === "/rest/results-entry/pending" ||
      url.startsWith("/rest/LogbookResults?")
    ) {
      const lastSave = postToOpenElisServerJsonResponse.mock.calls.at(-1);
      const submitted = lastSave ? JSON.parse(lastSave[1]).testResult : null;
      const loaded =
        url.startsWith("/rest/LogbookResults?") && submitted
          ? pendingRows.map((row) =>
              row.analysisId !== submitted.analysisId
                ? row
                : {
                    ...row,
                    ...(row.testResultComponentId ===
                    submitted.testResultComponentId
                      ? {
                          ...submitted,
                          resultId: submitted.resultId || "601",
                          rawResultValue: submitted.resultValue,
                        }
                      : {}),
                    analysisLastupdated: savedReceipt.analysisLastupdated,
                    analysisStatusId: savedReceipt.analysisStatusId,
                  },
            )
          : pendingRows;
      callback({ testResult: loaded, total: loaded.length });
    }
  });

  const initialUrl = `/Results?${initialQuery}`;
  window.history.pushState({}, "", initialUrl);
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <IntlProvider locale={intlLocale} messages={intlMessages}>
        <ConfigurationContext.Provider
          value={{
            configurationProperties: { DEFAULT_DATE_LOCALE: dateLocale },
          }}
        >
          <NotificationContext.Provider
            value={{
              notificationVisible: false,
              setNotificationVisible: vi.fn(),
              addNotification: onNotification,
            }}
          >
            <UserSessionDetailsContext.Provider
              value={{
                userSessionDetails: {
                  authenticated: true,
                  userId: "701",
                  sessionId: "SIM-RESULT-SESSION",
                  csrf: "SIM-CSRF",
                  loginName: "SIM-USER",
                  roles: ["Results"],
                },
              }}
            >
              <UnifiedResults />
            </UserSessionDetailsContext.Provider>
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
};

describe("UnifiedResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("CSRF", "SIM-CSRF");
    signatureControls.delayed = false;
    signatureControls.callbacks = [];
  });

  test("testClinicalSubject_ShowsSeparateAccessionAndServerProvidedNameWithoutRawSummary", async () => {
    const patientName = "测试姓, 测试名";
    const patientInfo = "PRIVATE-ID, F, 1990/01/01";
    renderWorkbench([{ ...pendingRow, patientName, patientInfo }], {
      initialQuery: "testSectionId=1",
    });
    const row = (await screen.findByText(pendingRow.testName)).closest("tr");
    const subject = within(row).getAllByRole("cell")[0];
    expect(within(subject).getByText(pendingRow.accessionNumber)).toHaveClass(
      "results-workbench__accession",
    );
    expect(within(subject).getByText(patientName)).toHaveClass(
      "results-workbench__patient-name",
    );
    expect(subject).not.toHaveTextContent(patientInfo);
    expect(subject).not.toHaveTextContent("1990/01/01");
    expect(subject).not.toHaveTextContent("PRIVATE-ID");
  });

  test.each([
    ["zh-CN", "部署, 验收甲", "部署验收甲"],
    ["zh-CN", "部署，验收甲", "部署验收甲"],
    ["zh", "  部署  ,  验收甲  ", "部署验收甲"],
    ["zh-TW", "陳, 小明", "陳小明"],
    ["zh-CN", "部署验收甲", "部署验收甲"],
    ["zh-CN", "Smith, Alice", "Smith, Alice"],
    ["zh-CN", "张, Alice", "张, Alice"],
    ["zh-CN", "Smith, 小明", "Smith, 小明"],
    ["zh-CN", "张, 小, 明", "张, 小, 明"],
    ["zh-CN", "张，小，明", "张，小，明"],
    ["zh-CN", "阿·布, 小明", "阿·布, 小明"],
    ["zh-CN", "张 小, 明", "张 小, 明"],
    ["en-US", "部署, 验收甲", "部署, 验收甲"],
  ])(
    "testPatientNameDisplay_OnlyJoinsUnambiguousTwoPartHanNamesInChineseLocale: %s %s",
    async (intlLocale, patientName, expected) => {
      renderWorkbench(
        [
          {
            ...pendingRow,
            patientName,
            patientInfo: "PRIVATE-RAW-SUMMARY",
          },
        ],
        {
          intlLocale,
          intlMessages: intlLocale.startsWith("zh") ? zhMessages : messages,
          initialQuery: "testSectionId=1",
        },
      );
      const row = (await screen.findByText(pendingRow.testName)).closest("tr");
      const subject = within(row).getAllByRole("cell")[0];
      expect(within(subject).getByText(expected)).toHaveClass(
        "results-workbench__patient-name",
      );
      expect(subject).not.toHaveTextContent("PRIVATE-RAW-SUMMARY");
    },
  );

  test("testSameOrderMultipleSpecimens_DisplayTheirPersistedBarcodesWithoutRebuildingThem", async () => {
    const barcodes = ["EXTERNAL-TUBE-A/009", "EXTERNAL-TUBE-B/004"];
    renderWorkbench(
      barcodes.map((sampleItemExternalId, index) => ({
        ...pendingRow,
        analysisId: String(42 + index),
        testName: `同类标本检验 ${index + 1}`,
        patientName: "模拟患者",
        sampleItemExternalId,
        sampleItemId: String(800 + index),
        sequenceNumber: String(index + 1),
      })),
      { intlLocale: "zh-CN", intlMessages: zhMessages },
    );
    const table = await screen.findByRole("table");
    for (const barcode of barcodes) {
      const barcodeValue = within(table).getByText(barcode);
      const subject = barcodeValue.closest("td");
      expect(barcodeValue).toHaveClass("results-workbench__barcode-value");
      expect(within(subject).getByText("条码")).toBeVisible();
      expect(
        within(subject).getByText(pendingRow.accessionNumber),
      ).toBeVisible();
      expect(within(subject).getByText("模拟患者")).toBeVisible();
      expect(subject).not.toHaveTextContent(`${pendingRow.accessionNumber}.1`);
      expect(subject).not.toHaveTextContent(`${pendingRow.accessionNumber}.2`);
    }
  });

  test.each([undefined, null, "", "  "])(
    "testMissingSpecimenBarcode_DoesNotSubstituteInternalOrPatientIdentifiers: %s",
    async (sampleItemExternalId) => {
      renderWorkbench([
        {
          ...pendingRow,
          patientInfo: "PRIVATE-PATIENT-INFO",
          patientName: "",
          sampleItemExternalId,
          sampleItemId: "PRIVATE-INTERNAL-SAMPLE-ID",
          patientId: "PRIVATE-INTERNAL-PATIENT-ID",
          sequenceNumber: "17",
        },
      ]);
      const row = within(screen.getByRole("table"))
        .getByText(pendingRow.testName)
        .closest("tr");
      const subject = within(row).getAllByRole("cell")[0];
      expect(
        subject.querySelector(".results-workbench__specimen-barcode"),
      ).not.toBeInTheDocument();
      expect(subject).not.toHaveTextContent("PRIVATE");
      expect(subject).not.toHaveTextContent(`${pendingRow.accessionNumber}.17`);
      expect(subject).not.toHaveTextContent(`${pendingRow.accessionNumber}-17`);
    },
  );

  test("testMultipleComponentsOfOneSpecimen_KeepTheSamePersistedBarcode", async () => {
    const barcode = "EXTERNAL-ONE-SPECIMEN";
    renderWorkbench(
      ["component-a", "component-b"].map((testResultComponentId) => ({
        ...pendingRow,
        testResultComponentId,
        testName: `分量 ${testResultComponentId}`,
        sampleItemExternalId: barcode,
      })),
    );
    const table = await screen.findByRole("table");
    const barcodeValues = within(table).getAllByText(barcode);
    expect(barcodeValues).toHaveLength(2);
    barcodeValues.forEach((value) => {
      expect(value.textContent).toBe(barcode);
      expect(value).toHaveClass("results-workbench__barcode-value");
    });
  });

  test.each([undefined, "", " "])(
    "testMissingOrDepersonalizedName_DoesNotRecoverIdentityFromRawSummary: %s",
    async (patientName) => {
      renderWorkbench([
        {
          ...pendingRow,
          patientName,
          patientInfo: "PRIVATE-DEPERSONALIZED-ID",
        },
      ]);
      const row = (await screen.findByText(pendingRow.testName)).closest("tr");
      const subject = within(row).getAllByRole("cell")[0];
      expect(
        within(subject).getByText(pendingRow.accessionNumber),
      ).toBeVisible();
      expect(within(subject).getByText("—")).toBeVisible();
      expect(subject).not.toHaveTextContent("PRIVATE-DEPERSONALIZED-ID");
      expect(subject).not.toHaveTextContent(/missing|缺失|不完整/i);
    },
  );

  test.each(["---", "  ---  "])(
    "testPermissionMaskedSummary_DoesNotRevealNameStillPresentInResponse: %s",
    async (patientInfo) => {
      renderWorkbench(
        [{ ...pendingRow, patientName: "部署, 验收甲", patientInfo }],
        {
          initialQuery: "testSectionId=1",
          intlLocale: "zh-CN",
          intlMessages: zhMessages,
        },
      );
      const row = (await screen.findByText(pendingRow.testName)).closest("tr");
      const subject = within(row).getAllByRole("cell")[0];
      expect(
        within(subject).getByText(pendingRow.accessionNumber),
      ).toBeVisible();
      expect(within(subject).getByText("—")).toBeVisible();
      expect(subject).not.toHaveTextContent("部署, 验收甲");
      expect(subject).not.toHaveTextContent("部署验收甲");
      expect(subject).not.toHaveTextContent("---");
    },
  );

  test.each(["ENVIRONMENTAL", "VECTOR"])(
    "testNonClinicalSubject_ShowsSampleContextWithoutPatientFieldsOrPlaceholder: %s",
    async (labUnitDomain) => {
      renderWorkbench(
        [
          {
            ...pendingRow,
            patientName: "不应显示的姓名",
            patientInfo: "PRIVATE-PATIENT-INFO",
            sampleType: "模拟非临床标本",
            sampleItemExternalId: "NON-CLINICAL-EXTERNAL-TUBE",
          },
        ],
        { labUnitDomain, initialQuery: "testSectionId=1" },
      );
      const row = (await screen.findByText(pendingRow.testName)).closest("tr");
      const subject = within(row).getAllByRole("cell")[0];
      expect(
        within(subject).getByText(pendingRow.accessionNumber),
      ).toBeVisible();
      expect(within(subject).getByText("模拟非临床标本")).toBeVisible();
      expect(
        within(subject).getByText("NON-CLINICAL-EXTERNAL-TUBE"),
      ).toBeVisible();
      expect(subject).not.toHaveTextContent("不应显示的姓名");
      expect(subject).not.toHaveTextContent("PRIVATE-PATIENT-INFO");
      expect(within(subject).queryByText("—")).not.toBeInTheDocument();
      expect(
        subject.querySelector(".results-workbench__patient-name"),
      ).not.toBeInTheDocument();
    },
  );

  test("testSixColumnStructure_KeepsColumnAndCellOrderAndEditableResult", async () => {
    renderWorkbench();
    const table = await screen.findByRole("table");
    const columnNames = [
      "subject",
      "test",
      "range",
      "result",
      "status",
      "actions",
    ];
    expect(table).toHaveClass("results-workbench__table");
    expect(
      Array.from(
        table.querySelectorAll("colgroup > col"),
        (col) => col.className,
      ),
    ).toEqual(columnNames.map((name) => `results-workbench__column--${name}`));
    const row = within(table).getByText(pendingRow.testName).closest("tr");
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(6);
    cells.forEach((cell, index) =>
      expect(cell).toHaveClass(
        `results-workbench__cell--${columnNames[index]}`,
      ),
    );
    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    const resultInput = within(cells[3]).getByRole("spinbutton");
    expect(resultInput).toBeEnabled();
    await userEvent.type(resultInput, "7.2");
    expect(
      within(cells[5]).getByRole("button", { name: "Save" }),
    ).toBeEnabled();
  });

  test("loads the dashboard pending queue without requiring a manual search", async () => {
    renderWorkbench();

    expect(
      await screen.findByRole("heading", {
        name: "Result entry workbench",
      }),
    ).toBeInTheDocument();
    expect(
      within(await screen.findByRole("table")).getByText(
        /DEV01260000000000003/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("White blood cell count")).toBeInTheDocument();
    expect(
      document.querySelector("#unifiedResultValue-42-primary"),
    ).toBeEnabled();
    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      "/rest/results-entry/pending",
      expect.any(Function),
      expect.objectContaining({
        sessionKey: expect.any(String),
        signal: expect.any(AbortSignal),
        current: expect.any(Function),
      }),
    );
  });

  test("shows an actionable localized empty state", async () => {
    renderWorkbench([]);

    expect(
      await screen.findByText("No results are waiting for entry"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("There are no records to display"),
    ).not.toBeInTheDocument();
  });

  test("uses the configured Chinese date order in the result filter", async () => {
    renderWorkbench([pendingRow], {
      dateLocale: "zh-CN",
      intlLocale: "zh-CN",
      intlMessages: zhMessages,
    });

    expect(document.getElementById("unifiedResultsDate")).toHaveAttribute(
      "placeholder",
      "年/月/日",
    );
    expect(
      document
        .getElementById("unifiedResultsDate")
        .closest(".oe-custom-date-picker"),
    ).toBeInTheDocument();
  });

  test("shows the new workflow status immediately after a result is saved", async () => {
    postToOpenElisServerJsonResponse.mockImplementation(
      (_url, _body, callback) =>
        callback({
          status: 200,
          reflex: [],
          calculated: [],
          analysisStatusId: "15",
          analysisLastupdated: "1755900000000",
        }),
    );

    renderWorkbench();

    await screen.findByText("White blood cell count");
    const input = document.querySelector("#unifiedResultValue-42-primary");
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "7.2" } });
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(await screen.findByText("Pending review")).toBeInTheDocument();
    expect(screen.queryByText("Not started")).not.toBeInTheDocument();
  });
});
