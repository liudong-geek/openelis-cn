import React from "react";
import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import OrderLabelPrintPanel from "./OrderLabelPrintPanel";
import { generateOrderLabels } from "./api/orderLabelApi";

vi.mock("./api/orderLabelApi", () => ({ generateOrderLabels: vi.fn() }));

const props = () => ({
  orderId: "42",
  labNumber: "QA-LABEL-42",
  patientName: "标签测试",
  samples: [
    { sampleItemId: "81", sortOrder: "3", sampleTypeName: "Blood" },
    { sampleItemId: "92", sortOrder: "7", sampleTypeName: "Urine" },
  ],
  disabled: false,
  operation: { isCurrent: () => true, generate: generateOrderLabels },
  onConfirmationChange: vi.fn(),
});
const rendered = (p) => (
  <IntlProvider locale="en" messages={messages}>
    <OrderLabelPrintPanel {...p} />
  </IntlProvider>
);
const result = (items) => ({
  confirmConsumed: vi.fn(),
  items,
  totalGenerated: items.reduce((n, i) => n + i.generatedQuantity, 0),
  pdf: new Blob(["%PDF-synthetic"], { type: "application/pdf" }),
});
const item = (
  type,
  sampleItemId,
  suffix,
  quantity = 1,
  generated = quantity,
) => ({
  type,
  sampleItemId,
  barcode: `QA-LABEL-42${suffix}`,
  requestedQuantity: quantity,
  generatedQuantity: generated,
  reason: generated < quantity ? "PRINT_LIMIT" : null,
});
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:synthetic-label-pdf");
  URL.revokeObjectURL = vi.fn();
});

test("displays actual barcode suffixes, never the database specimen IDs", () => {
  render(rendered(props()));
  expect(screen.getByText("QA-LABEL-42.3")).toBeInTheDocument();
  expect(screen.getByText("QA-LABEL-42.7")).toBeInTheDocument();
  expect(screen.queryByText("81")).not.toBeInTheDocument();
});

test("generation uses each quantity, omits zero rows and does not confirm sticking labels", async () => {
  const p = props();
  const user = userEvent.setup();
  generateOrderLabels.mockResolvedValue(
    result([item("specimen", "81", ".3", 2), item("specimen", "92", ".7")]),
  );
  render(rendered(p));
  await user.clear(
    screen.getByRole("spinbutton", { name: "Copies: Order Label" }),
  );
  await user.type(
    screen.getByRole("spinbutton", { name: "Copies: Order Label" }),
    "0",
  );
  await user.clear(
    screen.getByRole("spinbutton", { name: "Copies: Sample Label 1" }),
  );
  await user.type(
    screen.getByRole("spinbutton", { name: "Copies: Sample Label 1" }),
    "2",
  );
  await user.click(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  await waitFor(() =>
    expect(
      screen.getByText(
        "Generated 3 labels. This does not confirm physical printing.",
      ),
    ).toBeInTheDocument(),
  );
  expect(generateOrderLabels).toHaveBeenCalledWith({
    orderId: "42",
    labNumber: "QA-LABEL-42",
    labels: [
      { type: "specimen", sampleItemId: "81", quantity: 2 },
      { type: "specimen", sampleItemId: "92", quantity: 1 },
    ],
  });
  expect(p.onConfirmationChange).not.toHaveBeenCalledWith(
    expect.objectContaining({ complete: true }),
  );
});

test("partial generation shows the cap and does not mark all rows successful", async () => {
  generateOrderLabels.mockResolvedValue(
    result([
      item("order", null, ""),
      item("specimen", "81", ".3", 1, 0),
      item("specimen", "92", ".7"),
    ]),
  );
  const p = props();
  render(rendered(p));
  await userEvent.click(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  await waitFor(() =>
    expect(
      screen.getByText("0 / 1 generated · limit reached"),
    ).toBeInTheDocument(),
  );
  expect(
    screen.getByText(
      "Some labels were not generated. Check existing labels or contact the label administrator; limits have not been overridden.",
    ),
  ).toBeInTheDocument();
  expect(p.onConfirmationChange).not.toHaveBeenCalledWith(
    expect.objectContaining({ complete: true }),
  );
});

test("existing physical labels may be verified without regenerating, but every specimen is required", async () => {
  const p = props();
  render(rendered(p));
  await userEvent.click(
    screen.getByLabelText("Barcode and label verified: QA-LABEL-42.3"),
  );
  expect(p.onConfirmationChange).not.toHaveBeenCalledWith(
    expect.objectContaining({ complete: true }),
  );
  await userEvent.click(
    screen.getByLabelText("Barcode and label verified: QA-LABEL-42.7"),
  );
  expect(p.onConfirmationChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ complete: true }),
  );
  expect(generateOrderLabels).not.toHaveBeenCalled();
});

test("generation failure is explicitly unconfirmed and is never retried automatically", async () => {
  generateOrderLabels.mockRejectedValue({ code: "UNCONFIRMED" });
  render(rendered(props()));
  await userEvent.click(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  await waitFor(() =>
    expect(
      screen.getByText(
        "Generation could not be verified. The server may have counted this request. Check existing labels before generating again.",
      ),
    ).toBeInTheDocument(),
  );
  expect(generateOrderLabels).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "View generated PDF" }),
  ).not.toBeInTheDocument();
});

test("viewing a verified PDF twice does not regenerate or consume another print count", async () => {
  generateOrderLabels.mockResolvedValue(
    result([
      item("order", null, ""),
      item("specimen", "81", ".3"),
      item("specimen", "92", ".7"),
    ]),
  );
  const open = vi.spyOn(window, "open").mockReturnValue({ opener: null });
  const p = props();
  const view = render(rendered(p));
  await userEvent.click(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  const preview = await screen.findByRole("button", {
    name: "View generated PDF",
  });
  await userEvent.click(preview);
  await userEvent.click(preview);
  expect(open).toHaveBeenCalledTimes(2);
  expect(open.mock.calls[0][0]).toBe("blob:synthetic-label-pdf");
  expect(generateOrderLabels).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-label-pdf");
  open.mockRestore();
});

test("a late response after A to B to A cannot revive a stale PDF or row status", async () => {
  let finish;
  generateOrderLabels.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const p = props();
  const view = render(rendered(p));
  await userEvent.click(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  view.rerender(rendered({ ...p, orderId: "43", labNumber: "QA-LABEL-43" }));
  view.rerender(rendered(p));
  finish(
    result([
      item("order", null, ""),
      item("specimen", "81", ".3"),
      item("specimen", "92", ".7"),
    ]),
  );
  await Promise.resolve();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "View generated PDF" }),
  ).not.toBeInTheDocument();
});

test("missing true specimen suffix disables generation and verification rather than guessing", () => {
  const p = props();
  delete p.samples[0].sortOrder;
  render(rendered(p));
  expect(
    screen.getByRole("button", { name: "Generate selected labels" }),
  ).toBeDisabled();
  expect(
    screen.getByText(
      "Some specimen barcodes are missing or duplicated. Reload the request; do not guess a barcode.",
    ),
  ).toBeInTheDocument();
});

test("repeated clicks while generation is pending submit only once", async () => {
  generateOrderLabels.mockImplementation(() => new Promise(() => {}));
  render(rendered(props()));
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  expect(generateOrderLabels).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();
  expect(
    screen.getByLabelText("Barcode and label verified: QA-LABEL-42.3"),
  ).toBeDisabled();
});

test("a different canonical barcode cannot be presented as this specimen's PDF", async () => {
  generateOrderLabels.mockResolvedValue(
    result([
      item("order", null, ""),
      item("specimen", "81", ".4"),
      item("specimen", "92", ".7"),
    ]),
  );
  render(rendered(props()));
  await userEvent.click(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  await screen.findByText(
    "Generation could not be verified. The server may have counted this request. Check existing labels before generating again.",
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test("blocked preview reports the problem without regenerating or confirming labels", async () => {
  generateOrderLabels.mockResolvedValue(
    result([
      item("order", null, ""),
      item("specimen", "81", ".3"),
      item("specimen", "92", ".7"),
    ]),
  );
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const p = props();
  render(rendered(p));
  await userEvent.click(
    screen.getByRole("button", { name: "Generate selected labels" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "View generated PDF" }),
  );
  expect(
    screen.getByText(messages["label.print.error.popupBlocked"]),
  ).toBeInTheDocument();
  expect(generateOrderLabels).toHaveBeenCalledTimes(1);
  expect(p.onConfirmationChange).not.toHaveBeenCalledWith(
    expect.objectContaining({ complete: true }),
  );
  open.mockRestore();
});

test("read-only orders cannot generate or confirm labels", async () => {
  render(rendered({ ...props(), disabled: true }));
  expect(
    screen.getByRole("button", { name: "Generate selected labels" }),
  ).toBeDisabled();
  expect(
    screen.getByLabelText("Barcode and label verified: QA-LABEL-42.3"),
  ).toBeDisabled();
  expect(generateOrderLabels).not.toHaveBeenCalled();
});
