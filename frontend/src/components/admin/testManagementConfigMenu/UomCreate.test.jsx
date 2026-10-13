import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import UomCreate from "./UomCreate";
import messages from "../../../languages/en.json";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
}));
const list = (extra = []) => ({
  existingUomList: [{ id: "1", value: "mg/L" }, ...extra],
  inactiveUomList: [{ id: "2", value: "mL" }],
  existingEnglishNames: "$mg/L$mL$",
});
const setup = () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const tree = (open) => (
    <IntlProvider locale="en" messages={messages}>
      <UomCreate open={open} onClose={onClose} onSaved={onSaved} />
    </IntlProvider>
  );
  const view = render(tree(true));
  return { onClose, onSaved, setOpen: (open) => view.rerender(tree(open)) };
};
const input = () => screen.getByRole("textbox", { name: messages["uom.new"] });
const save = () => screen.getByRole("button", { name: "Save" });
beforeEach(() => {
  vi.clearAllMocks();
  getFromOpenElisServer.mockImplementation((_url, cb) => cb(list()));
});

test("prevents blank and case-insensitive active/inactive duplicates; sends only the existing English field", async () => {
  const { onSaved } = setup();
  expect(save()).toBeDisabled();
  for (const value of ["   ", " MG/l ", " ML "]) {
    fireEvent.change(input(), { target: { value } });
    expect(save()).toBeDisabled();
  }
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  fireEvent.change(input(), { target: { value: " IU/L " } });
  postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) => {
    getFromOpenElisServer.mockImplementation((_url, read) =>
      read(list([{ id: "3", value: "IU/L" }])),
    );
    cb({ status: 200 });
  });
  fireEvent.click(save());
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(postToOpenElisServerFullResponse).toHaveBeenCalledWith(
    "/rest/UomCreate",
    JSON.stringify({ uomEnglishName: "IU/L" }),
    expect.any(Function),
  );
});

test("keeps draft after an unconfirmed save and retries only the readback", async () => {
  const { onSaved, onClose } = setup();
  let postCallback;
  postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) => {
    postCallback = cb;
  });
  fireEvent.change(input(), { target: { value: "IU/L" } });
  fireEvent.click(save());
  fireEvent.click(save());
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  getFromOpenElisServer.mockImplementation((_url, cb) => cb(undefined));
  act(() => postCallback(undefined));
  expect(input()).toHaveValue("IU/L");
  expect(save()).toBeDisabled();
  expect(onSaved).not.toHaveBeenCalled();
  getFromOpenElisServer.mockImplementation((_url, cb) =>
    cb(list([{ id: "3", value: "IU/L" }])),
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(postToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
});

test("does not report success for a returned form unless the created unit is read back", () => {
  const { onSaved, onClose } = setup();
  postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) =>
    cb({ status: 200 }),
  );
  fireEvent.change(input(), { target: { value: "IU/L" } });
  fireEvent.click(save());
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(input()).toHaveValue("IU/L");
  expect(
    screen.getByText(messages["admin.basicEdit.update.verificationFailed"]),
  ).toBeInTheDocument();
  expect(save()).toBeDisabled();
  expect(input()).toBeDisabled();
});

test("failed reference load blocks save and can be retried", () => {
  getFromOpenElisServer.mockImplementation((_url, cb) => cb(undefined));
  setup();
  expect(input()).toBeDisabled();
  expect(save()).toBeDisabled();
  getFromOpenElisServer.mockImplementation((_url, cb) => cb(list()));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(input()).not.toBeDisabled();
});

test("cancel keeps dirty input until discard is confirmed", () => {
  const { onClose } = setup();
  fireEvent.change(input(), { target: { value: "IU/L" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(input()).toHaveValue("IU/L");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard and return" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([undefined, { status: 408 }, { status: 500 }])(
  "an uncertain POST followed by a valid list without the name allows only another read: %j",
  (response) => {
    const { onSaved } = setup();
    postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) =>
      cb(response),
    );
    fireEvent.change(input(), { target: { value: "IU/L" } });
    fireEvent.click(save());
    expect(save()).toBeDisabled();
    expect(input()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(save()).toBeDisabled();
    expect(postToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  },
);

test.each([400, 403, 422])(
  "a definite HTTP %s rejection permits correction and a later save",
  (status) => {
    setup();
    postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) =>
      cb({ status }),
    );
    fireEvent.change(input(), { target: { value: "IU/L" } });
    fireEvent.click(save());
    expect(input()).not.toBeDisabled();
    expect(save()).not.toBeDisabled();
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(1);
    fireEvent.change(input(), { target: { value: "U/L" } });
    fireEvent.click(save());
    expect(postToOpenElisServerFullResponse).toHaveBeenCalledTimes(2);
  },
);

test("hide and reopen keep the same pending POST, and delayed verification cannot settle a newer draft", () => {
  const { onClose, onSaved, setOpen } = setup();
  let postCallback, readCallback;
  postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) => {
    postCallback = cb;
  });
  fireEvent.change(input(), { target: { value: "IU/L" } });
  fireEvent.click(save());
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  setOpen(false);
  getFromOpenElisServer.mockImplementation((_url, cb) => {
    readCallback = cb;
  });
  act(() => postCallback(undefined));
  setOpen(true);
  expect(input()).toHaveValue("IU/L");
  expect(save()).toBeDisabled();
  act(() => readCallback(list()));
  expect(save()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  setOpen(false);
  setOpen(true);
  expect(input()).toHaveValue("IU/L");
  expect(save()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  const oldReadCallback = readCallback;
  setOpen(false);
  act(() => readCallback(list([{ id: "3", value: "IU/L" }])));
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  getFromOpenElisServer.mockImplementation((_url, cb) =>
    cb(list([{ id: "3", value: "IU/L" }])),
  );
  setOpen(true);
  fireEvent.change(input(), { target: { value: "U/L" } });
  act(() => oldReadCallback(list([{ id: "3", value: "IU/L" }])));
  expect(input()).toHaveValue("U/L");
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(postToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
});
