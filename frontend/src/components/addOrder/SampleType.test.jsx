import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import messages from "../../languages/zh.json";
import SampleType from "./SampleType";
import AddSample from "./AddSample";
import EditSample from "../modifyOrder/EditSample";

const mocks = vi.hoisted(() => ({ get: vi.fn(), requests: [] }));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: mocks.get }));
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({
      configurationProperties: { AUTOFILL_COLLECTION_DATE: "false" },
    }),
    NotificationContext: createContext({
      setNotificationVisible: vi.fn(),
      addNotification: vi.fn(),
    }),
  };
});
vi.mock("../common/CustomNotification", () => ({
  NotificationKinds: { warning: "warning" },
}));
vi.mock("../common/CustomDatePicker", () => ({
  default: ({ id, value, labelText, onChange }) => (
    <label>
      {labelText}
      <input
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));
vi.mock("../common/CustomTimePicker", () => ({
  default: ({ id, value, labelText, onChange }) => (
    <label>
      {labelText}
      <input
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));
vi.mock("../storage/LocationPicker/LocationPickerInline", () => ({
  default: () => null,
}));
vi.mock("../storage/LocationPicker/useLocationPicker", () => ({
  LEVEL_ORDER: ["room", "device", "shelf", "rack", "box"],
}));
vi.mock("./GpsCoordinatesCapture", () => ({ default: () => null }));
vi.mock("./OrderReferralRequest", () => ({ default: () => null }));

const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const initialSample = (overrides = {}) => ({
  index: 1,
  sampleTypeId: "A",
  tests: [{ id: "1", name: "原项目" }],
  panels: [{ id: "P1", name: "原组合", testIds: "1" }],
  sampleRejected: false,
  requestReferralEnabled: false,
  referralItems: [],
  sampleXML: {
    collectionDate: null,
    collectionTime: "09:20",
    collector: "王医生",
    quantity: "3",
    uom: "ml",
    rejected: false,
    rejectionReason: "",
    collectionMethod: "静脉采血",
    sampleTemperature: "室温",
    specimenOrigin: "本院",
    numOrderLabels: 2,
    numSpecimenLabels: 3,
  },
  ...overrides,
});
const typeData = (id, prefix = id) => ({
  sampleTypeId: id,
  panels: [
    { id: `P-${prefix}`, name: `${prefix}组合`, testIds: `T-${prefix}` },
  ],
  tests: [{ id: `T-${prefix}`, name: `${prefix}项目`, userBenchChoice: true }],
});
const fieldNames = {
  sampleTypeId: "sampleTypeId",
  sampleRejected: "sampleRejected",
  rejectionReason: "rejectionReason",
  selectedTests: "tests",
  selectedPanels: "panels",
  sampleXML: "sampleXML",
  requestReferralEnabled: "requestReferralEnabled",
  referralItems: "referralItems",
};
const Harness = ({ initial, mode = "direct" }) => {
  const [samples, setSamples] = useState([initial]);
  const [form, setForm] = useState({ existingTests: [], possibleTests: [] });
  const update = (object) => {
    const updates = {};
    Object.entries(fieldNames).forEach(([source, target]) => {
      if (Object.prototype.hasOwnProperty.call(object, source))
        updates[target] = object[source];
    });
    setSamples((current) =>
      current.map((sample, index) =>
        index === object.sampleObjectIndex ? { ...sample, ...updates } : sample,
      ),
    );
  };
  return (
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{ userSessionDetails: { firstName: "医生", lastName: "王" } }}
      >
        {mode === "create" ? (
          <AddSample samples={samples} setSamples={setSamples} />
        ) : mode === "modify" ? (
          <EditSample
            samples={samples}
            setSamples={setSamples}
            orderFormValues={form}
            setOrderFormValues={setForm}
          />
        ) : (
          <SampleType
            index={0}
            sample={samples[0]}
            sampleTypeObject={update}
            rejectSampleReasons={[]}
            showLabelControls={false}
          />
        )}
        <output data-testid="sample-state">{JSON.stringify(samples)}</output>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  );
};
const state = () =>
  JSON.parse(screen.getByTestId("sample-state").textContent)[0];
const changeType = (id) =>
  fireEvent.change(document.getElementById("sampleId_0"), {
    target: { value: id },
  });
const requestsFor = (id) =>
  mocks.requests.filter((request) => request.type === id);
const reply = (request, response) => act(() => request.callback(response));

beforeEach(() => {
  mocks.requests.length = 0;
  mocks.get.mockReset();
  mocks.get.mockImplementation((url, callback, signal) => {
    if (url.startsWith("/rest/sample-type-tests?")) {
      mocks.requests.push({
        type: new URLSearchParams(url.split("?")[1]).get("sampleType"),
        callback,
        signal,
        url,
      });
      return;
    }
    if (url === "/rest/user-sample-types")
      callback([
        { id: "A", value: "全血" },
        { id: "B", value: "血清" },
        { id: "A +/中文", value: "其他标本" },
      ]);
    else if (url === "/rest/UomCreate")
      callback({ existingUomList: [{ id: "ml", value: "毫升" }] });
    else callback([]);
  });
});

describe("SampleType selection request boundaries", () => {
  it("keeps the initial selection and collection fields when its choices load", () => {
    const initial = freeze(initialSample());
    render(<Harness initial={initial} />);
    reply(requestsFor("A")[0], {
      sampleTypeId: "A",
      panels: initial.panels,
      tests: initial.tests,
    });
    expect(state().tests).toEqual(initial.tests);
    expect(state().panels).toEqual(initial.panels);
    expect(state().sampleXML).toEqual(initial.sampleXML);
    expect(screen.getByLabelText("原组合")).toBeChecked();
    expect(screen.getByLabelText("原项目")).toBeChecked();
  });

  it("clears panels, tests and old search results when the type changes without changing collection fields", () => {
    const initial = freeze(initialSample());
    render(<Harness initial={initial} mode="modify" />);
    reply(requestsFor("A")[0], {
      sampleTypeId: "A",
      panels: initial.panels,
      tests: initial.tests,
    });
    fireEvent.change(document.getElementById("panels_search_0"), {
      target: { value: "原" },
    });
    fireEvent.change(document.getElementById("tests_search_0"), {
      target: { value: "原" },
    });
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    changeType("B");
    expect(state()).toMatchObject({
      sampleTypeId: "B",
      tests: [],
      panels: [],
      sampleXML: initial.sampleXML,
    });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(document.getElementById("panels_search_0")).toHaveValue("");
    expect(document.getElementById("tests_search_0")).toHaveValue("");
    expect(screen.queryByLabelText("原项目")).not.toBeInTheDocument();
    reply(requestsFor("B")[0], {
      ...typeData("B"),
      tests: [
        { id: "1", name: "B可选项目", userBenchChoice: true },
        ...typeData("B").tests,
      ],
    });
    expect(state().tests).toEqual([]);
    expect(state().panels).toEqual([]);
    expect(screen.getByLabelText("B可选项目")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("B组合"));
    expect(state().panels).toEqual([
      { id: "P-B", name: "B组合", testIds: "T-B" },
    ]);
    expect(state().tests).toEqual([{ id: "T-B", name: "B项目" }]);
    expect(initial.tests).toEqual([{ id: "1", name: "原项目" }]);
    expect(initial.panels).toEqual([
      { id: "P1", name: "原组合", testIds: "1" },
    ]);
    expect(state().sampleXML).toEqual(initial.sampleXML);
  });

  it("ignores an older type response after the current type has loaded", () => {
    render(<Harness initial={initialSample()} />);
    const a = requestsFor("A")[0];
    changeType("B");
    expect(a.signal.aborted).toBe(true);
    reply(requestsFor("B")[0], typeData("B"));
    reply(a, typeData("A", "迟到A"));
    expect(screen.getByLabelText("B项目")).toBeInTheDocument();
    expect(screen.queryByLabelText("迟到A项目")).not.toBeInTheDocument();
    expect(state()).toMatchObject({ sampleTypeId: "B", panels: [], tests: [] });
  });

  it("uses request identity even when the user selects the original type again", () => {
    render(<Harness initial={initialSample()} />);
    const a = requestsFor("A")[0];
    changeType("B");
    const b = requestsFor("B")[0];
    changeType("A");
    const currentA = requestsFor("A")[1];
    reply(currentA, typeData("A", "当前A"));
    reply(a, typeData("A", "旧A"));
    reply(b, typeData("B", "旧B"));
    expect(screen.getByLabelText("当前A项目")).toBeInTheDocument();
    expect(screen.queryByLabelText("旧A项目")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("旧B项目")).not.toBeInTheDocument();
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
  });

  it("keeps an empty type and empty parent selections when its old response arrives", () => {
    render(<Harness initial={initialSample()} />);
    const a = requestsFor("A")[0];
    changeType("");
    reply(a, typeData("A", "迟到"));
    expect(state()).toMatchObject({ sampleTypeId: "", tests: [], panels: [] });
    expect(screen.queryByLabelText("迟到项目")).not.toBeInTheDocument();
    expect(mocks.requests).toHaveLength(1);
  });

  it("aborts its request on unmount and ignores callbacks that still arrive", () => {
    const view = render(<Harness initial={initialSample()} />);
    const request = requestsFor("A")[0];
    view.unmount();
    expect(request.signal.aborted).toBe(true);
    expect(() => reply(request, typeData("A"))).not.toThrow();
    expect(screen.queryByLabelText("A项目")).not.toBeInTheDocument();
  });

  it("keeps the current type usable after an unsuccessful choices request", () => {
    render(<Harness initial={initialSample()} />);
    changeType("B");
    reply(requestsFor("B")[0], undefined);
    expect(state()).toMatchObject({ sampleTypeId: "B", tests: [], panels: [] });
    fireEvent.change(document.getElementById("tests_search_0"), {
      target: { value: "项目" },
    });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    changeType("A +/中文");
    expect(requestsFor("A +/中文")[0].url).toBe(
      "/rest/sample-type-tests?sampleType=A%20%2B%2F%E4%B8%AD%E6%96%87",
    );
    reply(requestsFor("A +/中文")[0], typeData("A +/中文", "重选"));
    fireEvent.click(screen.getByLabelText("重选项目"));
    expect(state().tests).toEqual([{ id: "T-重选", name: "重选项目" }]);
  });

  it("hides label quantities in the actual modification child", () => {
    render(<Harness initial={initialSample()} mode="modify" />);
    expect(screen.queryByTestId("labels-section-root")).not.toBeInTheDocument();
    expect(document.getElementById("quantity")).toHaveValue(3);
  });

  it("retains creation label quantities and accepts empty type, panels and tests without mutating the original sample", () => {
    const initial = freeze(initialSample());
    render(<Harness initial={initial} mode="create" />);
    expect(screen.getByTestId("labels-section-root")).toBeInTheDocument();
    expect(document.getElementById("labels-order")).toHaveValue(2);
    expect(document.getElementById("sample-row-1")).toHaveValue(3);
    changeType("B");
    expect(state()).toMatchObject({
      sampleTypeId: "B",
      tests: [],
      panels: [],
      sampleXML: initial.sampleXML,
    });
    reply(requestsFor("B")[0], typeData("B"));
    fireEvent.click(screen.getByLabelText("B组合"));
    expect(state().tests).toEqual([{ id: "T-B", name: "B项目" }]);
    expect(state().panels).toEqual([
      { id: "P-B", name: "B组合", testIds: "T-B" },
    ]);
    changeType("");
    expect(state()).toMatchObject({
      sampleTypeId: "",
      tests: [],
      panels: [],
      sampleXML: initial.sampleXML,
    });
    expect(initial.sampleTypeId).toBe("A");
    expect(initial.tests).toEqual([{ id: "1", name: "原项目" }]);
    expect(initial.panels).toEqual([
      { id: "P1", name: "原组合", testIds: "1" },
    ]);
  });
});
