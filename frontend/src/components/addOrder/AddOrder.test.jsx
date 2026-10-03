import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";

// ---------------------------------------------------------------------------
// OGC-285 M5b — AddOrder mounts ONE order-level LabelsSection (API mode), fed by
// POST /api/orderEntry/labelRequest, and lifts the section's persistPayload onto
// orderFormValues.labelPersistRequest so Index.jsx's save POST carries it.
//
// We mock the server layer (so the aggregation POST returns a canned response
// and the on-mount GETs are inert) and the heavy presentational children that
// are irrelevant to this wiring, then assert on the real rendered output and the
// real setOrderFormValues call.
// ---------------------------------------------------------------------------

const { utilsMock } = vi.hoisted(() => ({
  utilsMock: {
    getFromOpenElisServer: vi.fn(),
    postToOpenElisServerFormData: vi.fn(),
    postToOpenElisServerJsonResponse: vi.fn(),
    deleteFromOpenElisServer: vi.fn(),
    dateProps: new Map(),
    timeProps: new Map(),
  },
}));

vi.mock("../utils/Utils", () => utilsMock);

vi.mock("../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: vi.fn(),
    addNotification: vi.fn(),
  }),
  ConfigurationContext: React.createContext({
    configurationProperties: {
      restrictFreeTextProviderEntry: "false",
      currentDateAsText: "2026/10/03",
      currentTimeAsText: "22:30",
    },
  }),
}));

vi.mock("../common/CustomNotification", () => ({
  NotificationKinds: { success: "success", error: "error", warning: "warning" },
}));

// Heavy / unrelated children — replaced with inert stubs so the render is light
// and deterministic. None participate in the label-aggregation wiring.
vi.mock("../common/AutoComplete", () => ({
  default: (props) => (
    <button
      aria-label={`select-${props.id}`}
      onClick={() => props.onSelect?.("doctor-1")}
    >
      Select
    </button>
  ),
}));
vi.mock("../common/CustomDatePicker", () => ({
  default: (props) => {
    utilsMock.dateProps.set(props.id, props);
    return (
      <input aria-label={props.labelText} value={props.value ?? ""} readOnly />
    );
  },
}));
vi.mock("../common/CustomTimePicker", () => ({
  default: (props) => {
    utilsMock.timeProps.set(props.id, props);
    return (
      <input aria-label={props.labelText} value={props.value ?? ""} readOnly />
    );
  },
}));
vi.mock("../common/CustomLabNumberInput", () => ({ default: () => <div /> }));
vi.mock("./OrderResultReporting", () => ({ default: () => <div /> }));

import AddOrder from "./AddOrder";

// Mirrors the POST /api/orderEntry/labelRequest response shape (snake_case wire
// keys). sample_id_local "0"/"1" are the positional keys AddOrder sends.
const labelRequestFixture = () => ({
  order_columns: [
    { preset_id: 1, name: "Order Label", is_system: true, max: 10 },
  ],
  sample_columns: [
    { preset_id: 17, name: "Specimen Label", is_system: true, max: 5 },
  ],
  order_row: {
    cells: [
      {
        preset_id: 1,
        default: 2,
        max: 10,
        locked: false,
        source: "preset_default",
      },
    ],
  },
  sample_rows: [
    {
      sample_id_local: "0",
      cells: [
        {
          preset_id: 17,
          default: 1,
          max: 5,
          locked: false,
          source: "test",
          source_test_id: 1,
          source_test_name: "CBC",
        },
      ],
    },
    {
      sample_id_local: "1",
      cells: [
        {
          preset_id: 17,
          default: 1,
          max: 5,
          locked: false,
          source: "test",
          source_test_id: 2,
          source_test_name: "ESR",
        },
      ],
    },
  ],
});

// Two samples, each with one test — the filtered list the backend correlates by.
const samplesFixture = () => [
  {
    index: 1,
    sampleTypeId: "3",
    name: "Blood",
    tests: [{ id: "1", name: "CBC" }],
    panels: [],
    referralItems: [],
    sampleXML: {},
  },
  {
    index: 2,
    sampleTypeId: "5",
    name: "Urine",
    tests: [{ id: "2", name: "ESR" }],
    panels: [],
    referralItems: [],
    sampleXML: {},
  },
];

const baseOrderFormValues = () => ({
  sampleOrderItems: {
    labNo: "",
    providersList: [],
    paymentOptions: [],
    referringSiteList: [],
    testLocationCodeList: [],
  },
  patientProperties: {},
});

const renderAddOrder = (overrides = {}) => {
  const setOrderFormValues = vi.fn();
  const utils = render(
    <IntlProvider locale="en" messages={messages}>
      <AddOrder
        orderFormValues={baseOrderFormValues()}
        setOrderFormValues={setOrderFormValues}
        samples={samplesFixture()}
        error={() => null}
        isModifyOrder={false}
        changed={{}}
        setChanged={vi.fn()}
        stagedAttachments={[]}
        setStagedAttachments={vi.fn()}
        {...overrides}
      />
    </IntlProvider>,
  );
  return { setOrderFormValues, ...utils };
};

// Resolve every labelRequest POST callback with the fixture; ignore other POSTs.
const wireAggregationResponse = (response) => {
  utilsMock.postToOpenElisServerJsonResponse.mockImplementation(
    (endPoint, _body, callback) => {
      if (endPoint === "/api/orderEntry/labelRequest") {
        callback(response);
      }
    },
  );
};

describe("AddOrder — order-level label aggregation (OGC-285 M5b)", () => {
  beforeEach(() => {
    utilsMock.dateProps.clear();
    utilsMock.timeProps.clear();
    utilsMock.getFromOpenElisServer.mockReset();
    utilsMock.postToOpenElisServerJsonResponse.mockReset();
    utilsMock.getFromOpenElisServer.mockImplementation(() => {});
  });

  test("POSTs the aggregation with positional sample_id_local + deduped numeric test ids", () => {
    wireAggregationResponse(labelRequestFixture());
    renderAddOrder();

    const call = utilsMock.postToOpenElisServerJsonResponse.mock.calls.find(
      (c) => c[0] === "/api/orderEntry/labelRequest",
    );
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1]);
    expect(body.test_ids).toEqual([1, 2]);
    expect(body.samples).toEqual([
      { sample_id_local: "0", sample_type: "3" },
      { sample_id_local: "1", sample_type: "5" },
    ]);
  });

  test("renders the API-mode order-level LabelsSection from the response", () => {
    wireAggregationResponse(labelRequestFixture());
    renderAddOrder();

    // The order-level section heading + both dynamic tables render.
    expect(screen.getByText("LABELS")).toBeInTheDocument();
    expect(screen.getByText("Order Labels")).toBeInTheDocument();
    expect(screen.getByText("Sample Labels")).toBeInTheDocument();

    // Column headers come straight from the aggregation response.
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(2);
    expect(
      within(tables[0]).getByRole("columnheader", { name: "Order Label" }),
    ).toBeInTheDocument();
    expect(
      within(tables[1]).getByRole("columnheader", { name: "Specimen Label" }),
    ).toBeInTheDocument();

    // Sample rows are labelled by the sample type name (our formatter).
    expect(
      within(tables[1]).getByRole("rowheader", { name: "Blood" }),
    ).toBeInTheDocument();
    expect(
      within(tables[1]).getByRole("rowheader", { name: "Urine" }),
    ).toBeInTheDocument();
  });

  test("does not render the section when no sample carries tests", () => {
    wireAggregationResponse(labelRequestFixture());
    renderAddOrder({
      samples: [
        {
          index: 1,
          sampleTypeId: "3",
          name: "Blood",
          tests: [],
          panels: [],
          referralItems: [],
          sampleXML: {},
        },
      ],
    });

    expect(screen.queryByText("LABELS")).not.toBeInTheDocument();
    expect(
      utilsMock.postToOpenElisServerJsonResponse.mock.calls.some(
        (c) => c[0] === "/api/orderEntry/labelRequest",
      ),
    ).toBe(false);
  });

  test("lifts the chosen quantities onto orderFormValues.labelPersistRequest on edit", () => {
    wireAggregationResponse(labelRequestFixture());
    const { setOrderFormValues } = renderAddOrder();

    // Edit a sample-label quantity (Sample 1 / Specimen Label) to 4.
    const tables = screen.getAllByRole("table");
    const sampleInput = within(tables[1]).getByRole("spinbutton", {
      name: /Sample 1 Specimen Label quantity/i,
    });
    fireEvent.change(sampleInput, { target: { value: "4" } });

    // setOrderFormValues was called with a functional updater that injects the
    // persistPayload as the top-level labelPersistRequest.
    const updater = setOrderFormValues.mock.calls
      .map((c) => c[0])
      .reverse()
      .find((arg) => typeof arg === "function");
    expect(updater).toBeTruthy();

    const next = updater(baseOrderFormValues());
    expect(next.labelPersistRequest).toBeTruthy();
    expect(next.labelPersistRequest.order_cells).toEqual([
      { preset_id: 1, qty: 2 },
    ]);
    // The edited sample-0 cell is 4; sample-1 stays at its seeded default 1.
    expect(next.labelPersistRequest.sample_rows).toEqual([
      { sample_id_local: "0", cells: [{ preset_id: 17, qty: 4 }] },
      { sample_id_local: "1", cells: [{ preset_id: 17, qty: 1 }] },
    ]);
  });
});

describe("AddOrder existing-application initialization", () => {
  beforeEach(() => {
    utilsMock.dateProps.clear();
    utilsMock.timeProps.clear();
    utilsMock.getFromOpenElisServer.mockReset();
    utilsMock.postToOpenElisServerJsonResponse.mockReset();
    utilsMock.getFromOpenElisServer.mockImplementation(() => {});
  });

  const existingForm = (dates = {}) => ({
    ...baseOrderFormValues(),
    accessionNumber: "HMC26092800001",
    sampleOrderItems: {
      ...baseOrderFormValues().sampleOrderItems,
      labNo: "HMC26092800001",
      requestDate: "2026/09/28",
      receivedDateForDisplay: "2026/09/29",
      receivedTime: "08:30",
      nextVisitDate: "2026/10/08",
      ...dates,
    },
  });

  test("keeps persisted dates and time when mounting and remounting the real modification form", () => {
    const form = existingForm();
    const snapshot = JSON.stringify(form);
    for (let mountNumber = 0; mountNumber < 2; mountNumber++) {
      const view = renderAddOrder({
        orderFormValues: form,
        isModifyOrder: true,
        samples: [],
      });
      expect(view.setOrderFormValues).not.toHaveBeenCalled();
      expect(utilsMock.dateProps.get("order_requestDate").value).toBe(
        "2026/09/28",
      );
      expect(utilsMock.dateProps.get("order_receivedDate").value).toBe(
        "2026/09/29",
      );
      expect(utilsMock.dateProps.get("order_nextVisitDate").value).toBe(
        "2026/10/08",
      );
      expect(utilsMock.timeProps.get("order_receivedTime").value).toBe("08:30");
      expect(utilsMock.dateProps.get("order_requestDate").autofillDate).toBe(
        false,
      );
      expect(utilsMock.dateProps.get("order_receivedDate").autofillDate).toBe(
        false,
      );
      view.unmount();
    }
    expect(JSON.stringify(form)).toBe(snapshot);
  });

  test.each([
    ["", ""],
    [null, null],
  ])(
    "does not replace empty legacy dates %s or time %s with today's defaults",
    (date, time) => {
      const form = existingForm({
        requestDate: date,
        receivedDateForDisplay: date,
        receivedTime: time,
        nextVisitDate: date,
      });
      const view = renderAddOrder({
        orderFormValues: form,
        isModifyOrder: true,
        samples: [],
      });
      expect(view.setOrderFormValues).not.toHaveBeenCalled();
      expect(utilsMock.dateProps.get("order_requestDate").value).toBe("");
      expect(utilsMock.dateProps.get("order_receivedDate").value).toBe("");
      expect(utilsMock.timeProps.get("order_receivedTime").value).toBe("");
      expect(form.sampleOrderItems.requestDate).toBe(date);
      expect(form.sampleOrderItems.receivedTime).toBe(time);
    },
  );

  test("retains date and time initialization for the new-application path", () => {
    const { setOrderFormValues } = renderAddOrder({ samples: [] });
    const initialization = setOrderFormValues.mock.calls
      .map(([value]) => value)
      .find(
        (value) =>
          typeof value === "object" &&
          value.sampleOrderItems?.requestDate === "2026/10/03",
      );
    expect(initialization.sampleOrderItems).toMatchObject({
      requestDate: "2026/10/03",
      receivedDateForDisplay: "2026/10/03",
      nextVisitDate: "2026/10/03",
      receivedTime: "22:30",
    });
    expect(utilsMock.dateProps.get("order_requestDate").autofillDate).toBe(
      true,
    );
    expect(utilsMock.dateProps.get("order_receivedDate").autofillDate).toBe(
      true,
    );
  });

  test("omits the empty result-notification section when editing without added tubes", () => {
    renderAddOrder({
      orderFormValues: existingForm(),
      isModifyOrder: true,
      samples: [],
    });
    expect(
      screen.queryByText(messages["order.result.reporting.heading"]),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("LABELS")).not.toBeInTheDocument();
    expect(utilsMock.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
  });
});

describe("AddOrder late asynchronous field responses", () => {
  beforeEach(() => {
    utilsMock.dateProps.clear();
    utilsMock.timeProps.clear();
    utilsMock.getFromOpenElisServer.mockReset();
    utilsMock.postToOpenElisServerJsonResponse.mockReset();
    utilsMock.getFromOpenElisServer.mockImplementation(() => {});
  });

  const form = () => ({
    ...baseOrderFormValues(),
    accessionNumber: "HMC26092800001",
    existingTests: [
      {
        analysisId: "101",
        sampleItemId: "201",
        testId: "301",
        canceled: false,
      },
    ],
    sampleOrderItems: {
      ...baseOrderFormValues().sampleOrderItems,
      labNo: "HMC26092800001",
      requestDate: "2026/09/28",
      receivedDateForDisplay: "2026/09/29",
      receivedTime: "08:30",
      nextVisitDate: "2026/10/08",
      priority: "ROUTINE",
      providerFirstName: "原",
      providerLastName: "医生",
      referringSiteName: "本院",
      referringSiteId: "site-1",
    },
  });
  const practitioner = () => ({
    id: "practitioner-1",
    person: {
      id: "person-1",
      firstName: "明",
      lastName: "李",
      workPhone: "01012345678",
      email: "doctor@example.test",
      fax: "",
    },
  });
  const findCallback = (path) =>
    utilsMock.getFromOpenElisServer.mock.calls.find(([url]) =>
      url.startsWith(path),
    )[1];
  const chooseProvider = () =>
    fireEvent.click(screen.getByRole("button", { name: "select-requesterId" }));
  const generateNumber = () =>
    fireEvent.click(document.querySelector('[data-cy="generate-labNumber"]'));

  test("merges a doctor lookup into the latest draft without reverting tube flags or unrelated fields", () => {
    const original = form();
    const { setOrderFormValues } = renderAddOrder({
      orderFormValues: original,
      isModifyOrder: true,
      samples: [],
    });
    chooseProvider();
    const callback = findCallback("/rest/practitioner?");
    callback(practitioner());
    const updater = setOrderFormValues.mock.calls.at(-1)[0];
    expect(typeof updater).toBe("function");
    const latest = {
      ...original,
      existingTests: [{ ...original.existingTests[0], canceled: true }],
      newAccessionNumber: "HMC26092899999",
      sampleOrderItems: {
        ...original.sampleOrderItems,
        priority: "STAT",
        receivedTime: "10:45",
      },
    };
    const updated = updater(latest);
    expect(updated.existingTests[0].canceled).toBe(true);
    expect(updated.newAccessionNumber).toBe("HMC26092899999");
    expect(updated.sampleOrderItems).toMatchObject({
      priority: "STAT",
      receivedTime: "10:45",
      providerFirstName: "明",
      providerLastName: "李",
      providerId: "practitioner-1",
      providerPersonId: "person-1",
      referringSiteId: "site-1",
      referringSiteName: "",
    });
    expect(original.existingTests[0].canceled).toBe(false);
  });

  test("ignores a doctor lookup that completes after changing steps or leaving the component", () => {
    const view = renderAddOrder({
      orderFormValues: form(),
      isModifyOrder: true,
      samples: [],
    });
    chooseProvider();
    const callback = findCallback("/rest/practitioner?");
    const callsBeforeUnmount = view.setOrderFormValues.mock.calls.length;
    view.unmount();
    callback(practitioner());
    expect(view.setOrderFormValues).toHaveBeenCalledTimes(callsBeforeUnmount);
  });

  test.each([undefined, {}, { error: "unavailable" }])(
    "does not replace a draft for unusable doctor response %j",
    (response) => {
      const view = renderAddOrder({
        orderFormValues: form(),
        isModifyOrder: true,
        samples: [],
      });
      chooseProvider();
      const callback = findCallback("/rest/practitioner?");
      const callsBeforeResponse = view.setOrderFormValues.mock.calls.length;
      expect(() => callback(response)).not.toThrow();
      expect(view.setOrderFormValues).toHaveBeenCalledTimes(
        callsBeforeResponse,
      );
    },
  );

  test.each([true, false])(
    "merges a generated number into the latest draft in modification mode=%s",
    (isModifyOrder) => {
      const original = form();
      const view = renderAddOrder({
        orderFormValues: original,
        isModifyOrder,
        samples: [],
      });
      generateNumber();
      findCallback("/rest/SampleEntryGenerateScanProvider")({
        status: true,
        body: "HMC26100300010",
      });
      const updater = view.setOrderFormValues.mock.calls.at(-1)[0];
      expect(typeof updater).toBe("function");
      const latest = {
        ...original,
        existingTests: [{ ...original.existingTests[0], canceled: true }],
        sampleOrderItems: {
          ...original.sampleOrderItems,
          providerEmail: "latest@example.test",
          receivedTime: "11:30",
        },
      };
      const updated = updater(latest);
      expect(updated.existingTests[0].canceled).toBe(true);
      expect(updated.sampleOrderItems.providerEmail).toBe(
        "latest@example.test",
      );
      expect(updated.sampleOrderItems.receivedTime).toBe("11:30");
      if (isModifyOrder) {
        expect(updated.newAccessionNumber).toBe("HMC26100300010");
        expect(updated.sampleOrderItems.labNo).toBe(
          original.sampleOrderItems.labNo,
        );
      } else {
        expect(updated.sampleOrderItems.labNo).toBe("HMC26100300010");
        expect(updated.newAccessionNumber).toBeUndefined();
      }
    },
  );

  test("ignores a generated number arriving after unmount", () => {
    const view = renderAddOrder({
      orderFormValues: form(),
      isModifyOrder: true,
      samples: [],
    });
    generateNumber();
    const callback = findCallback("/rest/SampleEntryGenerateScanProvider");
    const callsBeforeUnmount = view.setOrderFormValues.mock.calls.length;
    view.unmount();
    callback({ status: true, body: "HMC26100300010" });
    expect(view.setOrderFormValues).toHaveBeenCalledTimes(callsBeforeUnmount);
  });

  test.each([undefined, { status: false, body: "unavailable" }])(
    "leaves the draft alone for unsuccessful generation %j",
    (response) => {
      const view = renderAddOrder({
        orderFormValues: form(),
        isModifyOrder: true,
        samples: [],
      });
      generateNumber();
      const callback = findCallback("/rest/SampleEntryGenerateScanProvider");
      const callsBeforeResponse = view.setOrderFormValues.mock.calls.length;
      expect(() => callback(response)).not.toThrow();
      expect(view.setOrderFormValues).toHaveBeenCalledTimes(
        callsBeforeResponse,
      );
    },
  );
});
