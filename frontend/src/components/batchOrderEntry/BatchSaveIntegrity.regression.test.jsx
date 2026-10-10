import React, { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { BrowserRouter } from "react-router-dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import SampleBatchEntry from "./SampleBatchEntry";
import SampleType from "./SampleType";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../utils/Utils";
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerJsonResponse: vi.fn(),
}));
const validOrder = (method = "On Demand", labNo = "123456") => ({
  method,
  PatientInfoCheck: false,
  currentDate: "10/10/2026",
  currentTime: "10:00",
  patientProperties: {
    nationalId: "SYNTHETIC-BATCH-ONLY",
    gender: "F",
    birthDateForDisplay: "01/02/2000",
    firstName: "Synthetic",
    lastName: "Batch",
    years: "26",
    months: "0",
    days: "0",
  },
  sampleOrderItems: {
    labNo,
    referringSiteId: "279",
    referringSiteName: "Synthetic site",
    providerFirstName: "Synthetic",
    providerLastName: "Requester",
    receivedDateForDisplay: "10/10/2026",
    receivedTime: "10:00",
    referringSiteDepartmentName: "",
  },
  tests: [],
  sampleTypeSelect: "",
  sampleXML:
    "<?xml version='1.0'?><samples><sample sampleID='1' tests='1' date='10/10/2026' time='10:00' panels='7' numOrderLabels='2' numSpecimenLabels='3'/></samples>",
});
const wrap = (child) => (
  <BrowserRouter>
    <IntlProvider locale="en" messages={messages}>
      <ConfigurationContext.Provider
        value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "en-US" } }}
      >
        <NotificationContext.Provider
          value={{
            notificationVisible: false,
            setNotificationVisible: vi.fn(),
            addNotification: vi.fn(),
          }}
        >
          {child}
        </NotificationContext.Provider>
      </ConfigurationContext.Provider>
    </IntlProvider>
  </BrowserRouter>
);
function StatefulBatch({ initial, allowPatientChange = false }) {
  const [form, setForm] = useState(initial);
  return (
    <>
      <SampleBatchEntry orderFormValues={form} setOrderFormValues={setForm} />
      {allowPatientChange && (
        <button
          data-testid="change-batch-patient"
          onClick={() =>
            setForm((current) => ({
              ...current,
              patientProperties: {
                ...current.patientProperties,
                nationalId: "OTHER-SYNTHETIC-PATIENT",
              },
            }))
          }
        >
          Simulate a late patient detail response
        </button>
      )}
    </>
  );
}
let generatorCallbacks, saveCallbacks, receiptCallbacks, consoleError;
beforeEach(() => {
  generatorCallbacks = [];
  saveCallbacks = [];
  receiptCallbacks = [];
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  getFromOpenElisServer.mockReset();
  postToOpenElisServerJsonResponse.mockReset();
  getFromOpenElisServer.mockImplementation((endpoint, callback) => {
    if (endpoint === "/rest/SamplePatientEntry")
      callback({ sampleOrderItems: { referringSiteList: [] } });
    else if (endpoint === "/rest/SampleEntryGenerateScanProvider")
      generatorCallbacks.push(callback);
    else if (endpoint.startsWith("/rest/order/saved?"))
      receiptCallbacks.push(callback);
    else if (endpoint === "/rest/user-sample-types")
      callback([{ id: "1", value: "Serum" }]);
    else if (endpoint.startsWith("/rest/sample-type-tests"))
      callback({
        panels: [{ id: "7", name: "Synthetic panel", testIds: "1" }],
        tests: [
          { id: "1", name: "Panel test" },
          { id: "2", name: "Extra test" },
        ],
      });
    else callback([]);
  });
  postToOpenElisServerJsonResponse.mockImplementation((url, body, callback) =>
    saveCallbacks.push(callback),
  );
});
afterEach(() => {
  consoleError.mockRestore();
});
const bodies = () =>
  postToOpenElisServerJsonResponse.mock.calls.map(([url, body]) => {
    expect(url).toBe("/rest/SamplePatientEntryBatch");
    return JSON.parse(body);
  });

const savedReceipt = (overrides = {}) => {
  const body = bodies().at(-1);
  return {
    queryVersion: "2",
    orderId: "101",
    labNumber: body.sampleOrderItems.labNo,
    patient: {
      patientId: "11",
      nationalId: body.patientProperties.nationalId,
      firstName: body.patientProperties.firstName,
      lastName: body.patientProperties.lastName,
      gender: body.patientProperties.gender,
      birthDate: "2000-01-02",
    },
    sampleOrderItems: { ...body.sampleOrderItems },
    samples: [
      {
        sampleTypeId: "1",
        collectionDate: "10/10/2026",
        analyses: [{ analysisId: "111", testId: "1", panelId: "7" }],
      },
    ],
    ...overrides,
  };
};

describe("batch clinical save integrity", () => {
  test("keeps the selected panel relation when adding and removing an individual test", async () => {
    const update = vi.fn();
    render(wrap(<SampleType updateFormValues={update} />));
    fireEvent.change(screen.getByLabelText("Sample Type"), {
      target: { value: "1" },
    });
    fireEvent.click(await screen.findByLabelText("Synthetic panel"));
    fireEvent.click(screen.getByLabelText("Extra test"));
    expect(update.mock.calls.at(-1)[0]).toEqual({
      selectedTests: [
        { id: "1", value: "Panel test" },
        { id: "2", value: "Extra test" },
      ],
      selectedPanels: [{ id: "7", name: "Synthetic panel", testIds: "1" }],
      sampleId: "1",
      sampleName: "Serum",
    });
    fireEvent.click(screen.getByLabelText("Extra test"));
    expect(update.mock.calls.at(-1)[0].selectedPanels).toEqual([
      { id: "7", name: "Synthetic panel", testIds: "1" },
    ]);
    expect(update.mock.calls.at(-1)[0].selectedTests).toEqual([
      { id: "1", value: "Panel test" },
    ]);
  });
  test("saves only the returned generated accession once even when an old accession was typed", async () => {
    render(wrap(<StatefulBatch initial={validOrder()} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await waitFor(() => expect(generatorCallbacks).toHaveLength(1));
    const beforeGenerator = bodies();
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "GENERATED-001" }),
    );
    await waitFor(() =>
      expect(
        postToOpenElisServerJsonResponse.mock.calls.length,
      ).toBeGreaterThan(0),
    );
    const afterGenerator = bodies();
    expect(
      beforeGenerator,
      "must never submit stale typed 123456 while generation is pending",
    ).toHaveLength(0);
    expect(afterGenerator.map((body) => body.sampleOrderItems.labNo)).toEqual([
      "GENERATED-001",
    ]);
    expect(afterGenerator[0].sampleXML).toContain("panels='7'");
    expect(afterGenerator[0].sampleXML).toContain("numOrderLabels='2'");
    expect(afterGenerator[0].sampleXML).toContain("numSpecimenLabels='3'");
  });
  test("does not save preprinted accession on render or typing and saves once on the explicit Save action", async () => {
    render(wrap(<StatefulBatch initial={validOrder("Pre-Printed", "")} />));
    fireEvent.change(document.querySelector("#labNo"), {
      target: { value: "PRINTED-001" },
    });
    await act(async () => {});
    const beforeSave = bodies();
    fireEvent.click(screen.getByTestId("generate-barcode-btn-BatchOrderEntry"));
    await waitFor(() =>
      expect(
        postToOpenElisServerJsonResponse.mock.calls.length,
      ).toBeGreaterThan(0),
    );
    expect(beforeSave, "typing is not a save instruction").toHaveLength(0);
    expect(bodies().map((body) => body.sampleOrderItems.labNo)).toEqual([
      "PRINTED-001",
    ]);
  });
  test("keeps Next Label disabled until the clinical save callback succeeds", async () => {
    render(wrap(<StatefulBatch initial={validOrder()} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "GENERATED-002" }),
    );
    await waitFor(() => expect(saveCallbacks.length).toBeGreaterThan(0));
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
    await act(async () =>
      saveCallbacks.at(-1)({ sampleOrderItems: { labNo: "GENERATED-002" } }),
    );
    expect(
      screen.getByTestId("next-button-BatchOrderEntry"),
      "a200 form echo alone is not a save receipt",
    ).toBeDisabled();
    expect(receiptCallbacks).toHaveLength(1);
    await act(async () => receiptCallbacks[0](savedReceipt()));
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeEnabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toHaveTextContent("GENERATED-002");
  });
  test("shows incomplete accession as a field validation error without reporting expected Yup validation as console.error", async () => {
    render(wrap(<StatefulBatch initial={validOrder("On Demand", "")} />));
    await waitFor(() =>
      expect(document.querySelector("#labNo")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(
      screen.getByText("Sample Lab Number is required"),
    ).toBeInTheDocument();
    expect(
      consoleError.mock.calls.filter(
        ([message]) => message === "Validation Errors:",
      ),
    ).toHaveLength(0);
    expect(bodies()).toHaveLength(0);
  });
  test("preserves caller age fields while removing display-only ages from the saved wire payload", async () => {
    const original = validOrder();
    render(wrap(<StatefulBatch initial={original} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "GENERATED-003" }),
    );
    await waitFor(() => expect(bodies().length).toBeGreaterThan(0));
    expect(original.patientProperties).toMatchObject({
      years: "26",
      months: "0",
      days: "0",
    });
    for (const body of bodies()) {
      expect(body.patientProperties).not.toHaveProperty("years");
      expect(body.patientProperties).not.toHaveProperty("months");
      expect(body.patientProperties).not.toHaveProperty("days");
    }
  });
  test("does not print add saved history or enable Next for a200 form echo when the real saved lookup has no order", async () => {
    render(wrap(<StatefulBatch initial={validOrder()} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "GENERATED-004" }),
    );
    await act(async () =>
      saveCallbacks.at(-1)({ sampleOrderItems: { labNo: "GENERATED-004" } }),
    );
    expect(receiptCallbacks).toHaveLength(1);
    expect(getFromOpenElisServer.mock.calls.map(([url]) => url)).toContain(
      "/rest/order/saved?queryVersion=2&labNumber=GENERATED-004",
    );
    await act(async () => receiptCallbacks[0](undefined));
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toBeNull();
    expect(
      [...document.querySelectorAll("h6")].map((node) => node.textContent),
    ).not.toContain("GENERATED-004");
  });
  test("rejects a saved lookup receipt belonging to another accession or patient", async () => {
    render(wrap(<StatefulBatch initial={validOrder()} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "GENERATED-005" }),
    );
    await act(async () =>
      saveCallbacks.at(-1)({ sampleOrderItems: { labNo: "GENERATED-005" } }),
    );
    expect(receiptCallbacks).toHaveLength(1);
    await act(async () =>
      receiptCallbacks[0](savedReceipt({ labNumber: "OTHER-ACCESSION" })),
    );
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toBeNull();
  });
  test("keeps failed clinical save out of history print and Next while allowing an explicit retry", async () => {
    render(wrap(<StatefulBatch initial={validOrder()} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "GENERATED-006" }),
    );
    await act(async () =>
      saveCallbacks.at(-1)({
        statusCode: 400,
        error: "Synthetic rejected save",
      }),
    );
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toBeNull();
    expect(
      [...document.querySelectorAll("h6")].map((node) => node.textContent),
    ).not.toContain("GENERATED-006");
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    expect(generatorCallbacks).toHaveLength(2);
    expect(bodies()).toHaveLength(1);
  });
  test("never saves an obsolete patient snapshot when a late patient selection changes during accession generation", async () => {
    render(wrap(<StatefulBatch initial={validOrder()} allowPatientChange />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    fireEvent.click(screen.getByTestId("change-batch-patient"));
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "GENERATED-007" }),
    );
    expect(bodies()).toHaveLength(0);
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
  });
  test("accepts an actually persisted optional patient whose omitted demographic fields remain null", async () => {
    const initial = validOrder();
    initial.patientProperties = {
      patientPK: "",
      firstName: "",
      lastName: "",
      nationalId: "",
      gender: "",
      birthDateForDisplay: "",
      patientUpdateStatus: "ADD",
    };
    render(wrap(<StatefulBatch initial={initial} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "OPTIONAL-001" }),
    );
    await act(async () =>
      saveCallbacks.at(-1)({ sampleOrderItems: { labNo: "OPTIONAL-001" } }),
    );
    const receipt = savedReceipt();
    receipt.patient = {
      patientId: "11",
      firstName: null,
      lastName: null,
      nationalId: null,
      gender: null,
      birthDate: null,
    };
    await act(async () => receiptCallbacks[0](receipt));
    expect(bodies()).toHaveLength(1);
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeEnabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toHaveTextContent("OPTIONAL-001");
  });
  test("accepts a matching named patient with an omitted optional date of birth", async () => {
    const initial = validOrder();
    initial.patientProperties.birthDateForDisplay = "";
    render(wrap(<StatefulBatch initial={initial} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "OPTIONAL-002" }),
    );
    await act(async () =>
      saveCallbacks.at(-1)({ sampleOrderItems: { labNo: "OPTIONAL-002" } }),
    );
    const receipt = savedReceipt();
    receipt.patient.birthDate = null;
    await act(async () => receiptCallbacks[0](receipt));
    expect(bodies()).toHaveLength(1);
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeEnabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toHaveTextContent("OPTIONAL-002");
  });
  test("Next Label clears the old print receipt while retaining saved history and requiring a new save", async () => {
    render(wrap(<StatefulBatch initial={validOrder()} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "NEXT-001" }),
    );
    await act(async () =>
      saveCallbacks.at(-1)({ sampleOrderItems: { labNo: "NEXT-001" } }),
    );
    await act(async () => receiptCallbacks[0](savedReceipt()));
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeEnabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toHaveTextContent("NEXT-001");
    fireEvent.click(screen.getByTestId("next-button-BatchOrderEntry"));
    expect(
      screen.queryAllByText(messages["barcode.print.dialog.title"]),
    ).toHaveLength(0);
    expect(document.querySelector("#labNo")).toHaveValue("");
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toBeNull();
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
    expect(
      [...document.querySelectorAll("h6")].map((node) =>
        node.textContent.trim(),
      ),
    ).toEqual(["NEXT-001"]);
    expect(bodies()).toHaveLength(1);
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    expect(generatorCallbacks).toHaveLength(2);
    expect(bodies()).toHaveLength(1);
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
  });
  test("optional empty demographics never accept a receipt for a different identified patient", async () => {
    const initial = validOrder();
    initial.patientProperties = {
      patientPK: "",
      firstName: "",
      lastName: "",
      nationalId: "",
      gender: "",
      birthDateForDisplay: "",
      patientUpdateStatus: "ADD",
    };
    render(wrap(<StatefulBatch initial={initial} />));
    fireEvent.click(
      screen.getByTestId("generate-barcode-link-BatchOrderEntry"),
    );
    await act(async () =>
      generatorCallbacks[0]({ status: true, body: "OPTIONAL-003" }),
    );
    await act(async () =>
      saveCallbacks.at(-1)({ sampleOrderItems: { labNo: "OPTIONAL-003" } }),
    );
    const receipt = savedReceipt();
    receipt.patient.firstName = "Different";
    await act(async () => receiptCallbacks[0](receipt));
    expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
    expect(
      document.querySelector(".post-save-dialog__accession-tag"),
    ).toBeNull();
    expect([...document.querySelectorAll("h6")]).toHaveLength(0);
    expect(bodies()).toHaveLength(1);
  });
});
