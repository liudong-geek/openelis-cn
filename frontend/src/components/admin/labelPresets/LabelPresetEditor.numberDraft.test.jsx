import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { vi } from "vitest";
import LabelPresetEditor from "./LabelPresetEditor";
import messages from "../../../languages/en.json";
import {
  postToOpenElisServerFullResponse,
  putToOpenElisServerFullResponse,
} from "../../utils/Utils";

vi.mock("../../utils/Utils", () => ({
  postToOpenElisServerFullResponse: vi.fn(),
  putToOpenElisServerFullResponse: vi.fn(),
}));

const preset = {
  id: 42,
  name: "Existing label",
  heightMm: 20,
  widthMm: 40,
  barcodeType: "CODE_128",
  printsPerOrder: true,
  printsPerSample: true,
  defaultPerOrder: 0,
  maxPerOrder: 10,
  defaultPerSample: 1,
  maxPerSample: 10,
  isActive: true,
  fields: [],
};

beforeEach(() => vi.clearAllMocks());

function renderEditor() {
  return render(
    <IntlProvider locale="en" messages={messages}>
      <LabelPresetEditor preset={preset} onClose={vi.fn()} />
    </IntlProvider>,
  );
}

test.each([
  ["defaultPerOrder", 0, "2"],
  ["defaultPerSample", 1, "2"],
  ["maxPerOrder", 10, "5"],
  ["maxPerSample", 10, "5"],
  ["preset-widthMm", 40, "76"],
  ["preset-heightMm", 20, "25"],
])(
  "real NumberInput %s keeps a cleared draft empty before replacement",
  async (id, initial, replacement) => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    const input = container.querySelector(`#${id}`);
    expect(input).toHaveValue(initial);
    await user.clear(input);
    expect(input).toHaveValue(null);
    await user.type(input, replacement);
    expect(input).toHaveValue(Number(replacement));
  },
);

test("clearing then typing 2 replaces the default order quantity rather than retaining an extra zero", async () => {
  const user = userEvent.setup();
  const { container } = renderEditor();
  const input = container.querySelector("#defaultPerOrder");
  await user.clear(input);
  await user.type(input, "2");
  expect(input).toHaveValue(2);
  await user.click(screen.getByText(messages["label.button.save"]));
  expect(
    JSON.parse(putToOpenElisServerFullResponse.mock.calls[0][1])
      .defaultPerOrder,
  ).toBe(2);
});

test("empty quantity drafts retain the existing numeric zero save contract", async () => {
  const user = userEvent.setup();
  const { container } = renderEditor();
  for (const id of [
    "defaultPerOrder",
    "maxPerOrder",
    "defaultPerSample",
    "maxPerSample",
  ])
    await user.clear(container.querySelector(`#${id}`));
  await user.click(screen.getByText(messages["label.button.save"]));
  const payload = JSON.parse(putToOpenElisServerFullResponse.mock.calls[0][1]);
  for (const key of [
    "defaultPerOrder",
    "maxPerOrder",
    "defaultPerSample",
    "maxPerSample",
  ])
    expect(payload[key]).toBe(0);
  expect(payload.heightMm).toBe(20);
  expect(payload.widthMm).toBe(40);
});

test.each(["preset-widthMm", "preset-heightMm"])(
  "empty required dimension %s blocks saving",
  async (id) => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    await user.clear(container.querySelector(`#${id}`));
    await user.click(screen.getByText(messages["label.button.save"]));
    expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        messages["admin.labelPresets.validation.dimension.range"],
      ),
    ).toBeInTheDocument();
  },
);

test("dimension bounds and default <= maximum remain enforced", () => {
  const { container } = renderEditor();
  fireEvent.change(container.querySelector("#preset-widthMm"), {
    target: { value: "201" },
  });
  fireEvent.change(container.querySelector("#defaultPerOrder"), {
    target: { value: "11" },
  });
  fireEvent.click(screen.getByText(messages["label.button.save"]));
  expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
  expect(
    screen.getByText(messages["admin.labelPresets.validation.dimension.range"]),
  ).toBeInTheDocument();
  expect(
    screen.getByText(messages["admin.labelPresets.validation.max.lte"]),
  ).toBeInTheDocument();
});

test.each([
  ["defaultPerOrder", "maxPerOrder"],
  ["defaultPerSample", "maxPerSample"],
])(
  "empty %s maximum cannot bypass the existing default/maximum validation",
  async (defaultId, maxId) => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    fireEvent.change(container.querySelector(`#${defaultId}`), {
      target: { value: "2" },
    });
    await user.clear(container.querySelector(`#${maxId}`));
    await user.click(screen.getByText(messages["label.button.save"]));
    expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
    expect(
      screen.getByText(messages["admin.labelPresets.validation.max.lte"]),
    ).toBeInTheDocument();
  },
);

test("real Carbon stepper still increments an empty quantity draft to one", async () => {
  const user = userEvent.setup();
  const { container } = renderEditor();
  const input = container.querySelector("#defaultPerOrder");
  await user.clear(input);
  await user.click(
    within(input.closest(".cds--number")).getByRole("button", {
      name: "Increment number",
    }),
  );
  expect(input).toHaveValue(1);
});

test.each(["create", "edit"])(
  "%s preserves the display name case and trims only outer whitespace",
  async (mode) => {
    const user = userEvent.setup();
    render(
      <IntlProvider locale="en" messages={messages}>
        <LabelPresetEditor
          preset={mode === "edit" ? preset : null}
          onClose={vi.fn()}
        />
      </IntlProvider>,
    );
    const input = screen.getByLabelText(
      messages["admin.labelPresets.field.name"],
    );
    await user.clear(input);
    await user.type(input, "  EDTA 血常规 Label  ");
    await user.click(screen.getByText(messages["label.button.save"]));
    const save =
      mode === "edit"
        ? putToOpenElisServerFullResponse
        : postToOpenElisServerFullResponse;
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(save.mock.calls[0][1]).name).toBe("EDTA 血常规 Label");
  },
);
