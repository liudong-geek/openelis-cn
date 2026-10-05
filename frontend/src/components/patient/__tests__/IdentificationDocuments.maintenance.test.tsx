import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/en.json";
import IdentificationDocuments from "../IdentificationDocuments";
const api = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  list: [],
  callback: undefined,
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  putToOpenElisServer: api.put,
  deleteFromOpenElisServer: api.remove,
}));
vi.mock("../photoManagement/uploadPhoto/ImagePreviewModal", () => ({
  default: () => null,
}));
const original = {
  id: "7",
  documentLastUpdated: "2026-10-05 09:30:00.123456",
  category: "NATIONAL_ID",
  description: "Original",
  thumbnail: "data:image/jpeg;base64,abc",
};
const saved = vi.fn(),
  state = vi.fn();
const mount = (readOnly = false) => {
  const content = (session = "token-A") => (
    <IntlProvider locale="en" messages={messages}>
      <IdentificationDocuments
        patientId="42"
        onDocumentsChange={() => {}}
        explainImmediateActions
        readOnly={readOnly}
        maintenanceSessionKey={session}
        onImmediateSaveSuccess={saved}
        onOperationStateChange={state}
      />
    </IntlProvider>
  );
  const view = render(content());
  return {
    ...view,
    rerenderSession: (session: string) => view.rerender(content(session)),
  };
};
beforeEach(() => {
  saved.mockClear();
  state.mockClear();
  api.put.mockReset();
  api.remove.mockReset();
  api.get.mockReset();
  api.list = [original];
  api.get.mockImplementation((_url, callback) => callback(api.list));
  api.put.mockImplementation((_url, _body, callback) => {
    api.callback = callback;
  });
  api.remove.mockImplementation((_url, callback) => {
    api.callback = callback;
  });
});
describe("patient maintenance independent documents", () => {
  test("viewing permits reading and offers no document write entry", () => {
    mount(true);
    expect(screen.getByRole("button", { name: "View" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });
  test("edit is explicitly immediate and only completes after matching readback", () => {
    mount();
    expect(screen.getByText(/take effect immediately/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(document.getElementById("edit-doc-description"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][0]).toContain(
      "patientId=42&version=2026-10-05+09%3A30%3A00.123456",
    );
    expect(saved).not.toHaveBeenCalled();
    api.list = [{ ...original, description: "Updated" }];
    act(() => api.callback(200));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector(".id-document-description"),
    ).toHaveTextContent("Updated");
  });
  test("a definitive rejection leaves the edit draft and supports a deliberate retry", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(document.getElementById("edit-doc-description"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => api.callback(403));
    expect(document.getElementById("edit-doc-description")).toHaveValue(
      "Updated",
    );
    expect(document.getElementById("edit-doc-description")).not.toBeDisabled();
    expect(saved).not.toHaveBeenCalled();
  });
  test("HTTP 200 with stale document data cannot complete or cause repeat write", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(document.getElementById("edit-doc-description"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => api.callback(200));
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Recheck document" }).at(-1),
    );
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(document.getElementById("edit-doc-description")).toBeDisabled();
  });
  test("delete requires the stored ID to be absent on readback", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(
      document.querySelector(".cds--modal.is-visible .cds--btn--danger"),
    );
    expect(api.remove).toHaveBeenCalledTimes(1);
    act(() => api.callback(200));
    expect(saved).not.toHaveBeenCalled();
    api.list = [];
    fireEvent.click(
      screen.getAllByRole("button", { name: "Recheck document" }).at(-1),
    );
    expect(saved).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledTimes(1);
  });
  test("token refresh keeps a document draft but ignores the old write receipt", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(document.getElementById("edit-doc-description"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const originalReceipt = api.callback;
    view.rerenderSession("token-B");
    api.list = [{ ...original, description: "Updated" }];
    act(() => originalReceipt(200));
    expect(saved).not.toHaveBeenCalled();
    expect(document.getElementById("edit-doc-description")).toHaveValue(
      "Updated",
    );
    expect(document.getElementById("edit-doc-description")).toBeDisabled();
    expect(api.put).toHaveBeenCalledTimes(1);
  });
  test("late document callbacks after unmount cannot update a new patient", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    view.unmount();
    act(() => api.callback(200));
    expect(saved).not.toHaveBeenCalled();
  });
});
