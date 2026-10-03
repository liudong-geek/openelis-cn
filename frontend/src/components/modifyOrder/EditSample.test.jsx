import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../languages/zh.json";
import EditSample from "./EditSample";

const mocks = vi.hoisted(() => ({ get: vi.fn(), sampleProps: new Map() }));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: mocks.get }));
vi.mock("../addOrder/SampleType", () => ({
  default: (props) => {
    mocks.sampleProps.set(props.sample.index, props);
    return (
      <div data-testid={`added-sample-${props.sample.index}`}>
        <input
          aria-label={`标本类型 ${props.sample.index}`}
          value={props.sample.sampleTypeId}
          onChange={(event) =>
            props.sampleTypeObject({
              sampleTypeId: event.target.value,
              sampleObjectIndex: props.index,
            })
          }
        />
        <button
          onClick={() =>
            props.sampleTypeObject({
              selectedTests: [],
              selectedPanels: [],
              sampleRejected: false,
              requestReferralEnabled: false,
              referralItems: [],
              sampleObjectIndex: props.index,
            })
          }
        >
          清空 {props.sample.index}
        </button>
        <button onClick={() => props.removeSample(props.index)}>
          移除 {props.sample.index}
        </button>
      </div>
    );
  },
}));

const existing = (overrides = {}) => ({
  accessionNumber: "LAB-A",
  analysisId: "101",
  sampleItemId: "201",
  testId: "301",
  sampleType: "全血",
  testName: "同一检验",
  collectionDate: "03/10/2026",
  collectionTime: "09:30",
  canCancel: true,
  canceled: false,
  canRemoveSample: true,
  removeSample: false,
  hasResults: false,
  ...overrides,
});
const possible = (overrides = {}) => ({
  accessionNumber: "待加-A",
  sampleItemId: "201",
  testId: "302",
  testName: "同一待加检验",
  sampleType: "全血",
  add: false,
  ...overrides,
});
const newSample = (index, overrides = {}) => ({
  index,
  sampleTypeId: "401",
  tests: [{ id: "501" }],
  panels: [{ id: "601" }],
  sampleRejected: true,
  requestReferralEnabled: true,
  referralItems: [{ testId: "501" }],
  sampleXML: { collectionDate: "03/10/2026" },
  ...overrides,
});
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const labels = {
  ...messages,
  "header.cancel.test": "取消项目",
  "sample.remove.action": "移除整管",
  "header.assign": "添加项目",
  "header.results.recorded": "已有结果",
  "sample.add.action": "添加标本",
};
const Harness = ({ form, initialSamples = [], disabled = false }) => {
  const [values, setValues] = useState(form);
  const [samples, setSamples] = useState(initialSamples);
  return (
    <IntlProvider locale="zh" messages={labels}>
      <EditSample
        orderFormValues={values}
        setOrderFormValues={setValues}
        samples={samples}
        setSamples={setSamples}
        disabled={disabled}
        error={[]}
      />
      <output data-testid="form-state">{JSON.stringify(values)}</output>
      <output data-testid="sample-state">{JSON.stringify(samples)}</output>
    </IntlProvider>
  );
};
const formState = () =>
  JSON.parse(screen.getByTestId("form-state").textContent);
const sampleState = () =>
  JSON.parse(screen.getByTestId("sample-state").textContent);
const row = (text) => screen.getByText(text).closest("tr");
const checkbox = (text, label) =>
  within(row(text)).getByRole("checkbox", { name: label });
const renderHarness = (form, props = {}) =>
  render(<Harness form={form} {...props} />);

beforeEach(() => {
  mocks.sampleProps.clear();
  mocks.get.mockReset();
  mocks.get.mockImplementation((url, callback) => callback([]));
});

describe("EditSample tube identity and permissions", () => {
  it("cancels only the selected analysis when two tubes carry the same test", () => {
    const original = freeze({
      existingTests: [
        existing(),
        existing({
          accessionNumber: "LAB-B",
          analysisId: "102",
          sampleItemId: "202",
        }),
      ],
      possibleTests: [],
    });
    renderHarness(original);
    fireEvent.click(checkbox("LAB-B", "取消项目"));
    expect(formState().existingTests.map((test) => test.canceled)).toEqual([
      false,
      true,
    ]);
    expect(formState().existingTests.map((test) => test.analysisId)).toEqual([
      "101",
      "102",
    ]);
    expect(original.existingTests[1].canceled).toBe(false);
  });

  it("removes only the selected tube and retains null accession group markers", () => {
    const original = freeze({
      existingTests: [
        existing(),
        existing({
          accessionNumber: null,
          analysisId: "103",
          testId: "303",
          sampleType: null,
          collectionDate: null,
          collectionTime: null,
          canRemoveSample: false,
        }),
        existing({
          accessionNumber: "LAB-B",
          analysisId: "102",
          sampleItemId: "202",
        }),
      ],
      possibleTests: [],
    });
    renderHarness(original);
    fireEvent.click(checkbox("LAB-B", "移除整管"));
    expect(formState().existingTests.map((test) => test.removeSample)).toEqual([
      false,
      false,
      true,
    ]);
    expect(formState().existingTests[1]).toEqual(original.existingTests[1]);
    expect(original.existingTests[1].accessionNumber).toBeNull();
  });

  it("adds only the selected sample-item and test pair", () => {
    const original = freeze({
      existingTests: [],
      possibleTests: [
        possible(),
        possible({ accessionNumber: "待加-B", sampleItemId: "202" }),
      ],
    });
    renderHarness(original);
    fireEvent.click(checkbox("待加-B", "添加项目"));
    expect(formState().possibleTests.map((test) => test.add)).toEqual([
      false,
      true,
    ]);
    expect(formState().possibleTests.map((test) => test.sampleItemId)).toEqual([
      "201",
      "202",
    ]);
  });

  it("respects server flags and keeps result and collection timestamps read-only", () => {
    renderHarness({
      existingTests: [
        existing({
          canCancel: false,
          canRemoveSample: false,
          hasResults: true,
        }),
      ],
      possibleTests: [],
    });
    expect(checkbox("LAB-A", "取消项目")).toBeDisabled();
    expect(checkbox("LAB-A", "移除整管")).toBeDisabled();
    expect(checkbox("LAB-A", "已有结果")).toBeDisabled();
    expect(checkbox("LAB-A", "已有结果")).toBeChecked();
    expect(within(row("LAB-A")).queryByRole("textbox")).toBeNull();
    expect(screen.getByText("03/10/2026")).toBeVisible();
    expect(screen.getByText("09:30")).toBeVisible();
  });

  it("does not infer rights or an identity from testId alone", () => {
    renderHarness({
      existingTests: [
        existing({
          analysisId: undefined,
          canCancel: undefined,
          canRemoveSample: undefined,
        }),
      ],
      possibleTests: [possible({ sampleItemId: undefined })],
    });
    expect(checkbox("LAB-A", "取消项目")).toBeDisabled();
    expect(checkbox("LAB-A", "移除整管")).toBeDisabled();
    expect(checkbox("待加-A", "添加项目")).toBeDisabled();
  });

  it("allows result-bearing cancellation only when the server explicitly allows it", () => {
    renderHarness({
      existingTests: [existing({ hasResults: true, canCancel: true })],
      possibleTests: [],
    });
    fireEvent.click(checkbox("LAB-A", "取消项目"));
    expect(formState().existingTests[0].canceled).toBe(true);
    expect(checkbox("LAB-A", "已有结果")).toBeDisabled();
  });
});

describe("EditSample added drafts and submission lock", () => {
  it("starts with no new sample form and creates it only on request", () => {
    renderHarness({ existingTests: [], possibleTests: [] });
    expect(screen.queryByTestId("added-sample-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "添加标本" }));
    expect(screen.getByTestId("added-sample-1")).toBeVisible();
    expect(sampleState()).toHaveLength(1);
  });

  it("removes the requested draft without mutating or replacing the array with removed entries", () => {
    const original = freeze([newSample(1), newSample(2), newSample(3)]);
    renderHarness(
      { existingTests: [], possibleTests: [] },
      { initialSamples: original },
    );
    fireEvent.click(screen.getByRole("button", { name: "移除 2" }));
    expect(sampleState().map((sample) => sample.index)).toEqual([1, 3]);
    expect(original).toHaveLength(3);
    expect(screen.getByTestId("added-sample-3")).toBeVisible();
  });

  it("accepts cleared tests, panels and false toggles without changing another tube", () => {
    const original = freeze([newSample(1), newSample(2)]);
    renderHarness(
      { existingTests: [], possibleTests: [] },
      { initialSamples: original },
    );
    fireEvent.click(screen.getByRole("button", { name: "清空 2" }));
    expect(sampleState()[1]).toMatchObject({
      tests: [],
      panels: [],
      sampleRejected: false,
      requestReferralEnabled: false,
      referralItems: [],
    });
    expect(sampleState()[0]).toEqual(original[0]);
    expect(original[1].tests).toHaveLength(1);
  });

  it("fetches rejection reasons once and does not scroll the editing workspace", () => {
    window.scrollTo.mockClear();
    renderHarness({ existingTests: [], possibleTests: [] });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get.mock.calls[0][0]).toBe(
      "/rest/displayList/REJECTION_REASONS",
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("locks every editable flag and added draft while a save is pending", () => {
    const values = { existingTests: [existing()], possibleTests: [possible()] };
    renderHarness(values, { initialSamples: [newSample(1)], disabled: true });
    for (const [text, label] of [
      ["LAB-A", "取消项目"],
      ["LAB-A", "移除整管"],
      ["待加-A", "添加项目"],
    ])
      expect(checkbox(text, label)).toBeDisabled();
    expect(screen.getByRole("button", { name: "添加标本" })).toBeDisabled();
    expect(screen.getByLabelText("标本类型 1")).toBeDisabled();
    expect(mocks.sampleProps.get(1).disabled).toBe(true);
    mocks.sampleProps
      .get(1)
      .sampleTypeObject({ selectedTests: [], sampleObjectIndex: 0 });
    mocks.sampleProps.get(1).setSample(newSample(1, { sampleTypeId: "999" }));
    mocks.sampleProps.get(1).removeSample(0);
    expect(sampleState()[0].sampleTypeId).toBe("401");
    expect(sampleState()[0].tests).toHaveLength(1);
    expect(formState()).toEqual(values);
  });

  it("unlocks the same draft after a failed submission without losing fields", () => {
    const values = { existingTests: [existing()], possibleTests: [possible()] };
    const view = renderHarness(values, {
      initialSamples: [newSample(1)],
      disabled: true,
    });
    view.rerender(
      <Harness
        form={values}
        initialSamples={[newSample(1)]}
        disabled={false}
      />,
    );
    expect(checkbox("LAB-A", "取消项目")).not.toBeDisabled();
    expect(screen.getByLabelText("标本类型 1")).not.toBeDisabled();
    expect(sampleState()[0].tests).toEqual([{ id: "501" }]);
    expect(sampleState()[0].sampleXML.collectionDate).toBe("03/10/2026");
    fireEvent.click(checkbox("LAB-A", "取消项目"));
    expect(formState().existingTests[0].canceled).toBe(true);
  });
});
