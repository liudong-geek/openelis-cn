import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider, createIntl } from "react-intl";
import messages from "../../languages/zh.json";
import EditOrderEntryAdditionalQuestions from "./EditOrderEntryAdditionalQuestions";
import { modifyPatientName, modifyProgramName } from "./modifyOrderDisplay";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: mocks.get }));
const form = {
  sampleOrderItems: {
    programId: "1",
    programList: [{ id: "1", value: "Routine Testing" }],
    additionalQuestions: {
      item: [{ linkId: "q1", answer: [{ valueString: "原答案" }] }],
    },
  },
};
const mount = (data = form) =>
  render(
    <IntlProvider locale="zh" messages={messages}>
      <EditOrderEntryAdditionalQuestions orderFormValues={data} />
    </IntlProvider>,
  );
beforeEach(() => {
  mocks.get.mockReset();
});
afterEach(cleanup);
it("shows the routine workflow in Chinese without mounting a selector or changing original data", async () => {
  const baseline = JSON.stringify(form);
  mocks.get.mockImplementation((_, cb) => cb({ item: [] }));
  mount();
  await waitFor(() => expect(screen.getByText("常规临床检验")).toBeTruthy());
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(JSON.stringify(form)).toBe(baseline);
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(screen.getByText("此申请没有附加问卷。")).toBeTruthy();
});
it("preserves custom workflow names rather than inventing translations", () => {
  const intl = createIntl({ locale: "zh", messages });
  expect(modifyProgramName("Hospital program", intl)).toBe("Hospital program");
});
it("renders all original questionnaire answers without editable controls", async () => {
  mocks.get.mockImplementation((_, cb) =>
    cb({ item: [{ linkId: "q1", type: "string" }] }),
  );
  mount();
  await waitFor(() => expect(screen.getByText("原答案")).toBeTruthy());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});
it("reports questionnaire failure without resetting answers", async () => {
  mocks.get.mockImplementation((_, cb) => cb(undefined));
  mount();
  await waitFor(() =>
    expect(screen.getByText("附加问卷暂时无法加载。")).toBeTruthy(),
  );
  expect(
    form.sampleOrderItems.additionalQuestions.item[0].answer[0].valueString,
  ).toBe("原答案");
});
it("ignores a late response from a previous program", async () => {
  let callbacks = [];
  mocks.get.mockImplementation((url, cb) => callbacks.push({ url, cb }));
  const view = mount();
  const changed = {
    sampleOrderItems: { ...form.sampleOrderItems, programId: "2" },
  };
  view.rerender(
    <IntlProvider locale="zh" messages={messages}>
      <EditOrderEntryAdditionalQuestions orderFormValues={changed} />
    </IntlProvider>,
  );
  act(() => callbacks[0].cb({ item: [{ linkId: "q1" }] }));
  expect(screen.queryByText("原答案")).toBeNull();
  act(() => callbacks[1].cb({ item: [] }));
  expect(screen.getByText("此申请没有附加问卷。")).toBeTruthy();
});
it.each([
  ["张, 伟", "zh", "张伟"],
  ["张， 伟", "zh_CN", "张伟"],
  ["Smith, John", "zh", "Smith, John"],
  ["张, 伟", "en", "张, 伟"],
  ["未提供", "zh", "未提供"],
])(
  "formats patient name %s only for Chinese names and locale",
  (name, locale, expected) => {
    expect(modifyPatientName(name, locale)).toBe(expected);
  },
);

it("displays repeated choices and numeric zero without losing the original values", async () => {
  mocks.get.mockImplementation((_, cb) =>
    cb({
      item: [
        { linkId: "q1", text: "多选" },
        { linkId: "q2", text: "次数" },
      ],
    }),
  );
  mount({
    sampleOrderItems: {
      ...form.sampleOrderItems,
      additionalQuestions: {
        item: [
          {
            linkId: "q1",
            answer: [
              { valueCoding: { code: "a", display: "选项甲" } },
              { valueString: "选项乙" },
            ],
          },
          { linkId: "q2", answer: [{ valueInteger: 0 }] },
        ],
      },
    },
  });
  await waitFor(() => expect(screen.getByText("选项甲、选项乙")).toBeTruthy());
  expect(screen.getByText("0")).toBeTruthy();
});

it("displays grouped false and measured zero answers as read-only values", async () => {
  mocks.get.mockImplementation((_, cb) =>
    cb({
      item: [
        {
          linkId: "group",
          text: "问卷分组",
          item: [
            { linkId: "q1", text: "是否" },
            { linkId: "q2", text: "测量" },
          ],
        },
      ],
    }),
  );
  mount({
    sampleOrderItems: {
      ...form.sampleOrderItems,
      additionalQuestions: {
        item: [
          {
            linkId: "group",
            item: [
              { linkId: "q1", answer: [{ valueBoolean: false }] },
              {
                linkId: "q2",
                answer: [{ valueQuantity: { value: 0, unit: "mg" } }],
              },
            ],
          },
        ],
      },
    },
  });
  await waitFor(() => expect(screen.getByText("0 mg")).toBeTruthy());
  expect(screen.getByText(messages["label.no"])).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});
