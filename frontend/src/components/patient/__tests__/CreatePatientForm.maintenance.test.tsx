import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/en.json";
import zh from "../../../languages/zh_CN.json";
import { fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";

const testState = vi.hoisted(() => ({
  postResponse: { status: "success", patientId: "42" },
  savedDetails: undefined,
  savedPhoto: "",
  documents: [],
  deferDocumentReads: false,
  documentReadCallbacks: [],
  deferInitialDocumentLoad: false,
  initialDocumentCallback: undefined,
  documentData: "",
  deferPost: false,
  postCallback: undefined,
  notify: vi.fn(),
  lastPostRequest: null,
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerJsonResponse: vi.fn(),
}));

testState.getFromOpenElisServer.mockImplementation((url, callback, signal) => {
  if (typeof callback !== "function") return;
  if (url.startsWith("/rest/patient-photos/")) {
    callback({ data: testState.savedPhoto });
    return;
  }
  if (url.startsWith("/rest/patient-details")) {
    callback(testState.savedDetails);
    return;
  }
  if (url.startsWith("/rest/patient-id-documents/")) {
    if (!url.endsWith("/full") && testState.deferDocumentReads) {
      testState.documentReadCallbacks.push({ callback, signal });
      return;
    }
    callback(
      url.endsWith("/full")
        ? { data: testState.documentData }
        : testState.documents,
    );
    return;
  }
  if (url.startsWith("/rest/PhoneNumberValidationProvider")) {
    callback({ status: true, body: "" });
    return;
  }
  if (url.startsWith("/rest/subjectNumberValidationProvider")) {
    callback({ status: true });
    return;
  }
  callback([]);
});

testState.postToOpenElisServerJsonResponse.mockImplementation(
  (url, body, callback) => {
    testState.lastPostRequest = { url, body };
    testState.postCallback = callback;
    if (!testState.deferPost) callback(testState.postResponse);
  },
);

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: testState.getFromOpenElisServer,
  postToOpenElisServerJsonResponse: testState.postToOpenElisServerJsonResponse,
  resolveApiErrorMessage: vi.fn((intl, response) =>
    response?.errorKey
      ? intl.formatMessage({ id: response.errorKey })
      : "Save failed",
  ),
}));

vi.mock("../../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: () => {},
    addNotification: testState.notify,
  }),
  ConfigurationContext: React.createContext({
    configurationProperties: {
      USE_NEW_ADDRESS_HIERARCHY: "false",
      PATIENT_GPS_CAPTURE_ENABLED: "false",
      DEFAULT_NATIONALITY: "",
      DEFAULT_DATE_LOCALE: "en-US",
      FIRST_NAME_REGEX: "^[A-Za-z\\s'-]+$",
      LAST_NAME_REGEX: "^[A-Za-z\\s'-]+$",
      PATIENT_NATIONAL_ID_REQUIRED: "false",
      PATIENT_ALIAS_ENABLED: "false",
      PHONE_FORMAT: "+261-xx-xxx-xx-xx",
    },
  }),
}));

vi.mock("../../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { success: "success", error: "error" },
}));

vi.mock("../AddressSearch", () => ({ default: () => null }));
vi.mock("../photoManagement/uploadPhoto/PatientImageSelector", () => ({
  default: () => <div data-testid="patient-image-selector-mock" />,
}));
vi.mock("../IdentificationDocuments", () => ({
  default: ({ onDocumentsChange, onSavedDocumentsLoaded }) => {
    React.useEffect(() => {
      testState.initialDocumentCallback = onSavedDocumentsLoaded;
      if (!testState.deferInitialDocumentLoad)
        onSavedDocumentsLoaded?.([{ id: "existing-doc" }]);
    }, [onSavedDocumentsLoaded]);
    return (
      <div data-testid="identification-documents-mock">
        <button
          type="button"
          onClick={() =>
            onDocumentsChange([
              {
                data: "data:image/jpeg;base64,bmV3LWRvYw==",
                category: "NATIONAL_ID",
                description: "SIM document",
              },
            ])
          }
        >
          SIM pending document
        </button>
      </div>
    );
  },
}));
vi.mock("../PatientFormObserver", () => ({ default: () => null }));
vi.mock("../../common/CustomDatePicker", () => ({
  default: ({ value, onChange, id }) => (
    <input
      id={id || "date-picker-default-id"}
      data-testid="dob-input"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("react-router-dom", () => ({
  useHistory: () => ({ push: vi.fn() }),
}));

import CreatePatientForm from "../CreatePatientForm";

const patient = {
  patientPK: "42",
  canEdit: true,
  firstName: "Old",
  lastName: "Patient",
  gender: "M",
  birthDateForDisplay: "01/15/1990",
  nationalId: "SIM-001",
  patientLastUpdated: "patient-version",
  personLastUpdated: "person-version",
  patientContactLastUpdated: "contact-exact-version",
  patientContactPersonLastUpdated: "contact-person-exact-version",
  guid: "opaque-guid",
  patientContact: {
    id: "12",
    lastupdated: "contact-version",
    person: {
      id: "13",
      lastupdated: "contact-person-version",
      firstName: "Relative",
      lastName: "Patient",
      primaryPhone: "",
      email: "",
    },
  },
};
const saved = vi.fn();
const stateChanged = vi.fn();
const mount = (record = patient, chinese = false, actor = "SIM-A") => {
  const content = (session = "token-A") => (
    <IntlProvider
      locale={chinese ? "zh-CN" : "en"}
      messages={chinese ? zh : messages}
    >
      <CreatePatientForm
        selectedPatient={record}
        maintenanceMode
        maintenanceActorKey={actor}
        maintenanceSessionKey={session}
        showActionsButton
        onSaveSuccess={saved}
        onFormStateChange={stateChanged}
        onCancel={() => {}}
      />
    </IntlProvider>
  );
  const view = render(content());
  return {
    ...view,
    rerenderSession: (session: string) => view.rerender(content(session)),
  };
};
const edit = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(document.getElementById("firstName"), {
    target: { value: "Updated" },
  });
  fireEvent.click(document.getElementById("submit"));
  await waitFor(() =>
    expect(screen.getByText("Save patient changes?")).toBeVisible(),
  );
};
const confirm = async () => {
  const buttons = screen.getAllByRole("button", { name: "Save" });
  fireEvent.click(buttons[buttons.length - 1]);
  await waitFor(() =>
    expect(testState.postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1),
  );
};
beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  saved.mockClear();
  stateChanged.mockClear();
  testState.notify.mockClear();
  testState.postToOpenElisServerJsonResponse.mockClear();
  testState.postResponse = { status: "success", patientId: "42" };
  testState.savedDetails = undefined;
  testState.savedPhoto = "";
  testState.documents = [{ id: "existing-doc" }];
  testState.deferDocumentReads = false;
  testState.documentReadCallbacks = [];
  testState.deferInitialDocumentLoad = false;
  testState.initialDocumentCallback = undefined;
  testState.getFromOpenElisServer.mockClear();
  testState.documentData = "";
  testState.deferPost = false;
  testState.postCallback = undefined;
});
const editWithPendingDocument = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(document.getElementById("firstName"), {
    target: { value: "Updated" },
  });
  fireEvent.click(screen.getByRole("button", { name: "SIM pending document" }));
  fireEvent.click(document.getElementById("submit"));
  await waitFor(() =>
    expect(screen.getByText("Save patient changes?")).toBeVisible(),
  );
};
const clickSaveConfirmation = () => {
  const buttons = screen.getAllByRole("button", { name: "Save" });
  fireEvent.click(buttons[buttons.length - 1]);
};
const documentListReads = () =>
  testState.getFromOpenElisServer.mock.calls.filter(
    ([url]) => url === "/rest/patient-id-documents/42",
  );
afterEach(() => vi.useRealTimers());

describe("patient maintenance modal form", () => {
  test("pending uploads wait for a separate authoritative baseline before any patient write", async () => {
    testState.deferPost = true;
    testState.deferInitialDocumentLoad = true;
    testState.deferDocumentReads = true;
    mount();
    await editWithPendingDocument();
    clickSaveConfirmation();
    await waitFor(() =>
      expect(testState.documentReadCallbacks).toHaveLength(1),
    );
    expect(documentListReads()[0]).toEqual([
      "/rest/patient-id-documents/42",
      expect.any(Function),
      expect.any(AbortSignal),
    ]);
    expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
    expect(document.getElementById("submit")).toBeDisabled();
    act(() =>
      testState.documentReadCallbacks[0].callback([{ id: "existing-doc" }]),
    );
    await waitFor(() =>
      expect(testState.postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(JSON.parse(testState.lastPostRequest.body).idDocuments).toEqual([
      {
        data: "data:image/jpeg;base64,bmV3LWRvYw==",
        category: "NATIONAL_ID",
        description: "SIM document",
      },
    ]);
    expect(window.sessionStorage.length).toBe(1);
    // A duplicated preflight callback must never send the patient twice.
    act(() => testState.documentReadCallbacks[0].callback([]));
    expect(testState.postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
  });

  test("submission retains its old-ID snapshot when an initial document load arrives after POST", async () => {
    testState.deferPost = true;
    testState.deferInitialDocumentLoad = true;
    mount();
    await editWithPendingDocument();
    const baseline = testState.documents;
    await confirm();
    testState.savedDetails = JSON.parse(testState.lastPostRequest.body);
    const newDocument = {
      id: "new-doc",
      category: "NATIONAL_ID",
      description: "SIM document",
    };
    baseline.push(newDocument);
    testState.documents = [newDocument];
    testState.documentData = "data:image/jpeg;base64,bmV3LWRvYw==";
    act(() => testState.initialDocumentCallback?.(baseline));
    act(() => testState.postCallback({ status: "success", patientId: "42" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("42"));
    expect(documentListReads()).toHaveLength(2);
    expect(testState.getFromOpenElisServer).toHaveBeenCalledWith(
      "/rest/patient-id-documents/42/new-doc/full",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(window.sessionStorage.length).toBe(0);
  });

  test("numeric old IDs remain excluded on a later read-only document recheck", async () => {
    testState.deferPost = true;
    testState.documents = [{ id: 21 }];
    mount();
    await editWithPendingDocument();
    await confirm();
    testState.savedDetails = JSON.parse(testState.lastPostRequest.body);
    testState.documents = [
      { id: "21", category: "NATIONAL_ID", description: "SIM document" },
    ];
    testState.documentData = "data:image/jpeg;base64,bmV3LWRvYw==";
    act(() => testState.postCallback({ status: "success", patientId: "42" }));
    expect(saved).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(1);
    expect(
      testState.getFromOpenElisServer.mock.calls.some(
        ([url]) => url === "/rest/patient-id-documents/42/21/full",
      ),
    ).toBe(false);
    testState.documents = [
      { id: 22, category: "NATIONAL_ID", description: "SIM document" },
    ];
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved patient" }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledWith("42"));
    expect(testState.getFromOpenElisServer).toHaveBeenCalledWith(
      "/rest/patient-id-documents/42/22/full",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(testState.postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.length).toBe(0);
  });

  test.each([
    undefined,
    { error: "Unavailable" },
    [null],
    [{}],
    [{ id: "" }],
    [{ id: {} }],
    [{ id: true }],
    [{ id: "existing-doc", error: "Unavailable" }],
    [{ id: "existing-doc" }, { id: "existing-doc" }],
  ])(
    "an invalid document baseline leaves an editable draft without POST or marker %j",
    async (baseline) => {
      testState.documents = baseline;
      mount();
      await editWithPendingDocument();
      clickSaveConfirmation();
      await waitFor(() =>
        expect(
          screen.getByText(
            /existing identification documents could not be loaded/i,
          ),
        ).toBeVisible(),
      );
      expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
      expect(window.sessionStorage.length).toBe(0);
      expect(document.getElementById("firstName")).toHaveValue("Updated");
      expect(document.getElementById("firstName")).not.toBeDisabled();
      expect(document.getElementById("submit")).not.toBeDisabled();
      expect(saved).not.toHaveBeenCalled();
    },
  );

  test("a failed baseline can be retried using a valid empty document list", async () => {
    testState.documents = undefined;
    testState.deferPost = true;
    mount();
    await editWithPendingDocument();
    clickSaveConfirmation();
    await waitFor(() =>
      expect(
        screen.getByText(
          /existing identification documents could not be loaded/i,
        ),
      ).toBeVisible(),
    );
    expect(window.sessionStorage.length).toBe(0);
    testState.documents = [];
    fireEvent.click(document.getElementById("submit"));
    await waitFor(() =>
      expect(screen.getByText("Save patient changes?")).toBeVisible(),
    );
    await confirm();
    testState.savedDetails = JSON.parse(testState.lastPostRequest.body);
    testState.documents = [
      { id: "new-doc", category: "NATIONAL_ID", description: "SIM document" },
    ];
    testState.documentData = "data:image/jpeg;base64,bmV3LWRvYw==";
    act(() => testState.postCallback({ status: "success", patientId: "42" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("42"));
    expect(window.sessionStorage.length).toBe(0);
  });

  test("a document-baseline timeout aborts the read and does not create unknown-write state", async () => {
    testState.deferDocumentReads = true;
    mount();
    await editWithPendingDocument();
    vi.useFakeTimers();
    clickSaveConfirmation();
    expect(testState.documentReadCallbacks).toHaveLength(1);
    act(() => vi.advanceTimersByTime(30000));
    expect(
      screen.getByText(
        /existing identification documents could not be loaded/i,
      ),
    ).toBeVisible();
    expect(testState.documentReadCallbacks[0].signal.aborted).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.getElementById("submit")).not.toBeDisabled();
    act(() => testState.documentReadCallbacks[0].callback([]));
    expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });

  test("a token refresh cancels preflight without locking the draft and a fresh save rereads the baseline", async () => {
    testState.deferPost = true;
    testState.deferDocumentReads = true;
    const view = mount();
    await editWithPendingDocument();
    clickSaveConfirmation();
    await waitFor(() =>
      expect(testState.documentReadCallbacks).toHaveLength(1),
    );
    view.rerenderSession("token-B");
    expect(testState.documentReadCallbacks[0].signal.aborted).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.getElementById("firstName")).toHaveValue("Updated");
    expect(document.getElementById("submit")).not.toBeDisabled();
    act(() => testState.documentReadCallbacks[0].callback([]));
    expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
    testState.deferDocumentReads = false;
    fireEvent.click(document.getElementById("submit"));
    await waitFor(() =>
      expect(screen.getByText("Save patient changes?")).toBeVisible(),
    );
    await confirm();
    expect(documentListReads()).toHaveLength(2);
    expect(window.sessionStorage.length).toBe(1);
  });

  test("a baseline callback from a closed patient cannot write after another account and patient open", async () => {
    testState.deferDocumentReads = true;
    const view = mount();
    await editWithPendingDocument();
    clickSaveConfirmation();
    await waitFor(() =>
      expect(testState.documentReadCallbacks).toHaveLength(1),
    );
    const previousRead = testState.documentReadCallbacks[0];
    view.unmount();
    mount({ ...patient, patientPK: "43", firstName: "Other" }, false, "SIM-B");
    expect(previousRead.signal.aborted).toBe(true);
    act(() => previousRead.callback([]));
    expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
    expect(document.getElementById("firstName")).toHaveValue("Other");
    expect(screen.getByRole("button", { name: "Edit" })).not.toBeDisabled();
  });

  test("saving ordinary patient changes does not wait for a delayed initial document load", async () => {
    testState.deferPost = true;
    testState.deferInitialDocumentLoad = true;
    testState.deferDocumentReads = true;
    mount();
    await edit();
    await confirm();
    expect(documentListReads()).toHaveLength(0);
    expect(window.sessionStorage.length).toBe(1);
    expect(JSON.parse(testState.lastPostRequest.body).idDocuments).toEqual([]);
  });

  test("unknown submission remains blocked after reopening and read-only recheck", async () => {
    testState.postResponse = { statusCode: 500, error: "Integration failed" };
    const view = mount();
    await edit();
    await confirm();
    expect(
      [...Array(window.sessionStorage.length)].map((_, index) =>
        window.sessionStorage.getItem(window.sessionStorage.key(index)),
      ),
    ).toEqual(["pending"]);
    view.unmount();
    mount();
    expect(
      screen.getByText(/previous patient save is still unverified/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(document.getElementById("firstName")).toBeDisabled();
    testState.savedDetails = { ...patient, firstName: "Updated" };
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved patient" }),
    );
    await waitFor(() =>
      expect(document.getElementById("firstName")).toHaveValue("Updated"),
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(window.sessionStorage.length).toBe(1);
    expect(testState.postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  });
  test("failed marker persistence refuses the POST and keeps the draft", async () => {
    mount();
    await edit();
    vi.spyOn(
      Object.getPrototypeOf(window.sessionStorage),
      "setItem",
    ).mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const buttons = screen.getAllByRole("button", { name: "Save" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(screen.getByText(/cannot persist or clear/i)).toBeVisible(),
    );
    expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
    expect(document.getElementById("firstName")).toHaveValue("Updated");
    expect(document.getElementById("submit")).toBeDisabled();
  });
  test("marker cleanup failure cannot unlock a definitive rejection", async () => {
    testState.deferPost = true;
    const view = mount();
    await edit();
    await confirm();
    vi.spyOn(
      Object.getPrototypeOf(window.sessionStorage),
      "removeItem",
    ).mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    act(() =>
      testState.postCallback({
        statusCode: 409,
        errorKey: "patient.maintenance.conflict",
      }),
    );
    expect(screen.getByText(/cannot persist or clear/i)).toBeVisible();
    expect(document.getElementById("submit")).toBeDisabled();
    view.unmount();
    vi.restoreAllMocks();
    mount();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });
  test("stable account keys keep unknown state separate for another account", async () => {
    testState.postResponse = { statusCode: 500 };
    const view = mount();
    await edit();
    await confirm();
    view.unmount();
    mount(patient, false, "SIM-B");
    expect(screen.getByRole("button", { name: "Edit" })).not.toBeDisabled();
    expect(window.sessionStorage.length).toBe(1);
  });
  test("same-account token refresh preserves the draft and ignores a late POST callback", async () => {
    testState.deferPost = true;
    const view = mount();
    await edit();
    await confirm();
    testState.savedDetails = JSON.parse(testState.lastPostRequest.body);
    view.rerenderSession("token-B");
    expect(document.getElementById("firstName")).toHaveValue("Updated");
    expect(document.getElementById("submit")).toBeDisabled();
    act(() => testState.postCallback({ status: "success", patientId: "42" }));
    expect(saved).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(1);
    view.unmount();
    mount();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });

  test("reads without writes and gates editing on the current capability", () => {
    mount({ ...patient, canEdit: false });
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(document.getElementById("firstName")).toBeDisabled();
    expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
  });
  test("save confirmation can be cancelled without submitting or losing the draft", async () => {
    mount();
    await edit();
    expect(testState.postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
    const cancels = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(cancels[cancels.length - 1]);
    expect(document.getElementById("firstName")).toHaveValue("Updated");
    expect(document.getElementById("firstName")).not.toBeDisabled();
  });
  test("success needs matching full readback and retains every identity and version", async () => {
    testState.deferPost = true;
    mount();
    await edit();
    await confirm();
    const payload = JSON.parse(testState.lastPostRequest.body);
    expect(payload).toMatchObject({
      patientPK: "42",
      guid: "opaque-guid",
      patientLastUpdated: "patient-version",
      personLastUpdated: "person-version",
      patientContactLastUpdated: "contact-exact-version",
      patientContactPersonLastUpdated: "contact-person-exact-version",
      patientContact: {
        id: "12",
        lastupdated: "contact-version",
        person: { id: "13", lastupdated: "contact-person-version" },
      },
    });
    expect(document.getElementById("firstName")).toBeDisabled();
    expect(saved).not.toHaveBeenCalled();
    testState.savedDetails = {
      ...payload,
      patientLastUpdated: "new-patient-version",
      personLastUpdated: "new-person-version",
    };
    act(() => testState.postCallback({ status: "success", patientId: "42" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("42"));
    expect(window.sessionStorage.length).toBe(0);
    expect(testState.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "success" }),
    );
  });
  test.each([
    {},
    { status: "success", patientId: "43" },
    { status: 0, error: "Network unavailable" },
    { statusCode: 500, error: "Integration failed" },
  ])(
    "unknown result keeps draft and prevents repeat submit %j",
    async (response) => {
      testState.postResponse = response;
      mount();
      await edit();
      await confirm();
      expect(
        screen.getByText(/save result could not be verified/i),
      ).toBeVisible();
      expect(document.getElementById("firstName")).toHaveValue("Updated");
      expect(document.getElementById("submit")).toBeDisabled();
      fireEvent.click(document.getElementById("submit"));
      expect(testState.postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(
        1,
      );
      expect(saved).not.toHaveBeenCalled();
    },
  );
  test("a definitive rejection keeps an editable draft and displays the server message key", async () => {
    testState.postResponse = {
      statusCode: 409,
      errorKey: "patient.maintenance.conflict",
      error: "Conflict",
    };
    mount();
    await edit();
    await confirm();
    expect(window.sessionStorage.length).toBe(0);
    expect(screen.getByText(/patient record changed/i)).toBeVisible();
    expect(document.getElementById("firstName")).toHaveValue("Updated");
    expect(document.getElementById("firstName")).not.toBeDisabled();
    expect(saved).not.toHaveBeenCalled();
  });
  test("a failed save followed by matching core data does not claim integration success", async () => {
    testState.postResponse = { statusCode: 500, error: "Integration failed" };
    mount();
    await edit();
    await confirm();
    testState.savedDetails = JSON.parse(testState.lastPostRequest.body);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved patient" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/original save failed/i)).toBeVisible(),
    );
    expect(saved).not.toHaveBeenCalled();
    expect(testState.postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
  });
  test("matching success with wrong core data remains unknown", async () => {
    testState.savedDetails = { ...patient, firstName: "Other" };
    mount();
    await edit();
    await confirm();
    expect(saved).not.toHaveBeenCalled();
    expect(document.getElementById("submit")).toBeDisabled();
  });
  test("a late write callback after the form unmounts cannot notify or close another patient", async () => {
    testState.deferPost = true;
    const view = mount();
    await edit();
    await confirm();
    view.unmount();
    act(() => testState.postCallback({ status: "success", patientId: "42" }));
    expect(saved).not.toHaveBeenCalled();
    expect(testState.notify).not.toHaveBeenCalled();
  });
  test.each(["new-doc", "existing-doc"])(
    "verifies newly created document content and refuses an old ID %s",
    async (documentId) => {
      testState.deferPost = true;
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.change(document.getElementById("firstName"), {
        target: { value: "Updated" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "SIM pending document" }),
      );
      fireEvent.click(document.getElementById("submit"));
      await waitFor(() =>
        expect(screen.getByText("Save patient changes?")).toBeVisible(),
      );
      await confirm();
      testState.savedDetails = JSON.parse(testState.lastPostRequest.body);
      testState.documents = [
        {
          id: documentId,
          category: "NATIONAL_ID",
          description: "SIM document",
        },
      ];
      testState.documentData = "data:image/jpeg;base64,bmV3LWRvYw==";
      act(() => testState.postCallback({ status: "success", patientId: "42" }));
      if (documentId === "new-doc")
        await waitFor(() => expect(saved).toHaveBeenCalledWith("42"));
      else {
        expect(saved).not.toHaveBeenCalled();
        expect(document.getElementById("submit")).toBeDisabled();
      }
    },
  );
  test("metadata alone cannot confirm newly saved document content", async () => {
    testState.deferPost = true;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(document.getElementById("firstName"), {
      target: { value: "Updated" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "SIM pending document" }),
    );
    fireEvent.click(document.getElementById("submit"));
    await waitFor(() =>
      expect(screen.getByText("Save patient changes?")).toBeVisible(),
    );
    await confirm();
    testState.savedDetails = JSON.parse(testState.lastPostRequest.body);
    testState.documents = [
      { id: "new-doc", category: "NATIONAL_ID", description: "SIM document" },
    ];
    testState.documentData = "data:image/jpeg;base64,wrong-content";
    act(() => testState.postCallback({ status: "success", patientId: "42" }));
    expect(saved).not.toHaveBeenCalled();
    expect(document.getElementById("submit")).toBeDisabled();
  });
});
