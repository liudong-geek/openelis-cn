import React from "react";
import { act } from "react-dom/test-utils";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { vi } from "vitest";
import LabelPresetEditor from "./LabelPresetEditor";
import messages from "../../../languages/en.json";

// Mock the server utils
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
  putToOpenElisServerFullResponse: vi.fn(),
}));

import {
  postToOpenElisServerFullResponse,
  putToOpenElisServerFullResponse,
} from "../../utils/Utils";

const renderEditor = (preset = null, onClose = vi.fn()) =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <LabelPresetEditor preset={preset} onClose={onClose} />
    </IntlProvider>,
  );

describe("LabelPresetEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Modal lifecycle ──────────────────────────────────────────────────────

  test("renders Add title when no preset provided", () => {
    renderEditor();
    expect(
      screen.getByText(messages["admin.labelPresets.editor.titleAdd"]),
    ).toBeInTheDocument();
  });

  test("renders Edit title when preset provided", () => {
    renderEditor({
      id: 1,
      name: "test preset",
      barcodeType: "CODE_128",
      heightMm: 20,
      widthMm: 40,
      printsPerSample: true,
      printsPerOrder: false,
      defaultPerSample: 1,
      maxPerSample: 5,
      defaultPerOrder: 0,
      maxPerOrder: 10,
      isActive: true,
      isSystem: false,
      fields: [],
    });
    expect(
      screen.getByText(messages["admin.labelPresets.editor.titleEdit"]),
    ).toBeInTheDocument();
  });

  test("calls onClose with false when cancel clicked", () => {
    const onClose = vi.fn();
    renderEditor(null, onClose);
    fireEvent.click(screen.getByText(messages["label.button.cancel"]));
    expect(onClose).toHaveBeenCalledWith(false);
  });

  // ── Form validation ──────────────────────────────────────────────────────

  test("shows validation error for blank name on submit", async () => {
    renderEditor();

    // Clear the name field (it starts empty for Add)
    const nameInput = screen.getByLabelText(
      messages["admin.labelPresets.field.name"],
    );
    fireEvent.change(nameInput, { target: { value: "" } });

    fireEvent.click(screen.getByText(messages["label.button.save"]));

    await waitFor(() => {
      expect(
        screen.getByText(
          messages["admin.labelPresets.validation.name.required"],
        ),
      ).toBeInTheDocument();
    });
  });

  test("shows scope validation when both scope checkboxes unchecked", async () => {
    renderEditor();

    // Uncheck the default printsPerSample checkbox
    const sampleCheckbox = screen.getByLabelText(
      messages["admin.labelPresets.scope.sample"],
    );
    fireEvent.click(sampleCheckbox);

    // Fill in a name and other required fields to isolate scope error
    const nameInput = screen.getByLabelText(
      messages["admin.labelPresets.field.name"],
    );
    fireEvent.change(nameInput, { target: { value: "test preset" } });

    fireEvent.click(screen.getByText(messages["label.button.save"]));

    await waitFor(() => {
      expect(
        screen.getByText(
          messages["admin.labelPresets.validation.scope.required"],
        ),
      ).toBeInTheDocument();
    });
  });

  // ── Submit behavior ──────────────────────────────────────────────────────

  test("calls postToOpenElisServerFullResponse on valid new preset submit", async () => {
    postToOpenElisServerFullResponse.mockImplementation(
      (url, payload, callback) => {
        callback({ status: 201 });
      },
    );

    const onClose = vi.fn();
    renderEditor(null, onClose);

    const nameInput = screen.getByLabelText(
      messages["admin.labelPresets.field.name"],
    );
    fireEvent.change(nameInput, { target: { value: "new preset" } });

    fireEvent.click(screen.getByText(messages["label.button.save"]));

    await waitFor(() => {
      expect(postToOpenElisServerFullResponse).toHaveBeenCalledWith(
        "/api/labelPresets",
        expect.any(String),
        expect.any(Function),
      );
    });
  });

  test("calls putToOpenElisServerFullResponse on valid edit submit", async () => {
    putToOpenElisServerFullResponse.mockImplementation(
      (url, payload, callback) => {
        callback({ status: 200 });
      },
    );

    const onClose = vi.fn();
    renderEditor(
      {
        id: 42,
        name: "existing preset",
        barcodeType: "CODE_128",
        heightMm: 20,
        widthMm: 40,
        printsPerSample: true,
        printsPerOrder: false,
        defaultPerSample: 1,
        maxPerSample: 5,
        defaultPerOrder: 0,
        maxPerOrder: 10,
        isActive: true,
        isSystem: false,
        fields: [],
      },
      onClose,
    );

    fireEvent.change(
      screen.getByLabelText(messages["admin.labelPresets.field.name"]),
      { target: { value: "updated preset" } },
    );
    fireEvent.click(screen.getByText(messages["label.button.save"]));

    await waitFor(() => {
      expect(putToOpenElisServerFullResponse).toHaveBeenCalledWith(
        "/api/labelPresets/42",
        expect.any(String),
        expect.any(Function),
      );
    });
  });

  test("calls onClose with true after successful save", async () => {
    postToOpenElisServerFullResponse.mockImplementation(
      (url, payload, callback) => {
        callback({ status: 201 });
      },
    );

    const onClose = vi.fn();
    renderEditor(null, onClose);

    const nameInput = screen.getByLabelText(
      messages["admin.labelPresets.field.name"],
    );
    fireEvent.change(nameInput, { target: { value: "success preset" } });
    fireEvent.click(screen.getByText(messages["label.button.save"]));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
  });

  // ── Sections rendered ────────────────────────────────────────────────────

  test("renders all four sections", () => {
    renderEditor();
    expect(
      screen.getByText(messages["admin.labelPresets.editor.section.basicInfo"]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        messages["admin.labelPresets.editor.section.dimensions"],
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        messages["admin.labelPresets.editor.section.barcodeSettings"],
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        messages["admin.labelPresets.editor.section.printScope"],
      ),
    ).toBeInTheDocument();
  });

  test("updates the live preview when the preset name changes", () => {
    renderEditor();
    fireEvent.change(
      screen.getByLabelText(messages["admin.labelPresets.field.name"]),
      { target: { value: "Chemistry tube" } },
    );
    expect(screen.getByText("Chemistry tube")).toBeInTheDocument();
  });

  test("asks before discarding unsaved changes", () => {
    const onClose = vi.fn();
    renderEditor(null, onClose);
    fireEvent.change(
      screen.getByLabelText(messages["admin.labelPresets.field.name"]),
      { target: { value: "Unsaved preset" } },
    );
    fireEvent.click(screen.getByText(messages["label.button.cancel"]));
    expect(
      screen.getByText(messages["admin.labelPresets.editor.discardTitle"]),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

test("Escape checks current unsaved edits instead of the opening form state", async () => {
  const onClose = vi.fn();
  renderEditor(null, onClose);
  fireEvent.change(
    screen.getByLabelText(messages["admin.labelPresets.field.name"]),
    { target: { value: "Unsaved label" } },
  );
  fireEvent.keyDown(
    screen.getByLabelText(messages["admin.labelPresets.field.name"]),
    { key: "Escape", code: "Escape", keyCode: 27 },
  );
  expect(
    await screen.findByText(
      messages["admin.labelPresets.editor.discardConfirm"],
    ),
  ).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByTestId("label-preset-editor")).toHaveClass("is-visible");
  const confirmation = screen.getByRole("dialog", {
    name: messages["admin.labelPresets.editor.discardTitle"],
  });
  fireEvent.click(
    within(confirmation).getByRole("button", {
      name: messages["label.button.cancel"],
      exact: true,
    }),
  );
  expect(screen.getByTestId("label-preset-editor")).toHaveClass("is-visible");
  expect(
    screen.getByLabelText(messages["admin.labelPresets.field.name"]),
  ).toHaveValue("Unsaved label");
});

test("pending label save locks fields and Escape; a failed save restores the entered values", () => {
  const onClose = vi.fn();
  renderEditor(null, onClose);
  fireEvent.change(
    screen.getByLabelText(messages["admin.labelPresets.field.name"]),
    { target: { value: "Pending label" } },
  );
  let complete;
  postToOpenElisServerFullResponse.mockImplementation(
    (_url, _body, callback) => {
      complete = callback;
    },
  );
  fireEvent.click(screen.getByText(messages["label.button.save"]));
  fireEvent.keyDown(
    screen.getByLabelText(messages["admin.labelPresets.field.name"]),
    { key: "Escape", code: "Escape", keyCode: 27 },
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(
    screen.queryByText(messages["admin.labelPresets.editor.discardConfirm"]),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId("label-preset-editor")).toHaveClass("is-visible");
  screen
    .getAllByRole("textbox")
    .forEach((field) => expect(field).toBeDisabled());
  screen
    .getAllByRole("spinbutton")
    .forEach((field) => expect(field).toBeDisabled());
  screen
    .getAllByRole("checkbox")
    .forEach((field) => expect(field).toBeDisabled());
  expect(screen.getByRole("combobox")).toBeDisabled();
  act(() => complete({ status: 503 }));
  expect(
    screen.getByLabelText(messages["admin.labelPresets.field.name"]),
  ).toHaveValue("Pending label");
  expect(
    screen.getByLabelText(messages["admin.labelPresets.field.name"]),
  ).toBeEnabled();
  expect(screen.getByRole("combobox")).toBeEnabled();
});
