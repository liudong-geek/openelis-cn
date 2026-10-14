import React from "react";
import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import CreatePatientForm from "../CreatePatientForm";
import messages from "../../../languages/zh_CN.json";
import { NotificationContext } from "../../layout/Layout";

// Real form, Formik, validation and Carbon. Network and picker shims expose
// the production value/onChange contracts; they do not implement a reset.
const state = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: state.get,
  postToOpenElisServerJsonResponse: state.post,
  resolveApiErrorMessage: vi.fn(() => "SIM save failed"),
}));
vi.mock("../../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: () => {},
    addNotification: state.notify,
  }),
  ConfigurationContext: React.createContext({
    configurationProperties: {
      USE_NEW_ADDRESS_HIERARCHY: "false",
      PATIENT_GPS_CAPTURE_ENABLED: "false",
      DEFAULT_NATIONALITY: "CHINESE",
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
  AlertDialog: () => <div data-testid="SIM form notification" />,
  NotificationKinds: { success: "success", error: "error" },
}));
vi.mock("../AddressSearch", () => ({ default: () => null }));
vi.mock("../PatientFormObserver", () => ({ default: () => null }));
vi.mock("../photoManagement/uploadPhoto/PatientImageSelector", () => ({
  default: ({ value, onChange }) => (
    <div>
      <output data-testid="SIM photo value">{value || ""}</output>
      <button type="button" onClick={() => onChange("SIM-unsaved-photo")}>
        SIM choose photo
      </button>
    </div>
  ),
}));
vi.mock("../IdentificationDocuments", () => ({
  default: ({ pendingDocuments, onDocumentsChange }) => (
    <div>
      <output data-testid="SIM pending documents">
        {pendingDocuments.length}
      </output>
      <button
        type="button"
        onClick={() =>
          onDocumentsChange([
            {
              category: "NATIONAL_ID",
              data: "data:image/jpeg;base64,U0lN",
              description: "SIM unsaved document",
            },
          ])
        }
      >
        SIM choose document
      </button>
    </div>
  ),
}));
vi.mock("../../common/CustomDatePicker", () => ({
  default: ({ value, onChange, id }) => (
    <input
      id={id}
      aria-label="SIM DOB"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("react-router-dom", () => ({ useHistory: () => ({ push: vi.fn() }) }));

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
// Carbon's danger Button prefixes its accessible name with a severity label.
// Keep the translated action match without assuming that label is absent.
const clearName = new RegExp(`${messages["label.button.clear"]}$`);
const clearButton = () => screen.getByRole("button", { name: clearName });
const fixture = {
  lastName: "Simclear",
  firstName: "Patient",
  subjectNumber: "SIM-CLEAR-001",
  nationalId: "SIM-NATIONAL-CLEAR-001",
  birthDateForDisplay: "01/15/1990",
};
const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  for (const id of ["lastName", "firstName", "subjectNumber", "nationalId"])
    await user.type(input(id), fixture[id]);
  await user.click(input("radio-1"));
  await user.type(
    screen.getByRole("textbox", { name: "SIM DOB" }),
    fixture.birthDateForDisplay,
  );
};
const mount = (props: Record<string, unknown> = {}) => {
  const onCancel = vi.fn();
  const onSaveSuccess = vi.fn();
  const view = render(
    <IntlProvider locale="zh-CN" messages={messages}>
      <CreatePatientForm
        showActionsButton
        selectedPatient={{}}
        onCancel={onCancel}
        onSaveSuccess={onSaveSuccess}
        {...props}
      />
    </IntlProvider>,
  );
  return { ...view, onCancel, onSaveSuccess };
};
beforeEach(() => {
  localStorage.clear();
  state.post
    .mockReset()
    .mockImplementation((_url, _body, callback) =>
      callback({ status: "success", patientId: "SIM-SAVED-42" }),
    );
  state.get.mockReset().mockImplementation((url, callback) => {
    if (typeof callback !== "function") return;
    if (
      url.startsWith("/rest/PhoneNumberValidationProvider") ||
      url.startsWith("/rest/subjectNumberValidationProvider")
    )
      callback({ status: true, body: "" });
    else if (url === "/rest/displayList/PATIENT_HEALTH_REGIONS")
      callback([{ id: "SIM-REGION", value: "SIM region" }]);
    else if (url.startsWith("/rest/health-districts-for-region"))
      callback([{ id: "SIM-DISTRICT", value: "SIM district" }]);
    else callback([]);
  });
  state.notify.mockClear();
});

describe("new patient form inside the list modal", () => {
  test.each([undefined, false])(
    "delegates notification hosting only when showNotifications is %s",
    (showNotifications) => {
      render(
        <NotificationContext.Provider
          value={{
            notificationVisible: true,
            setNotificationVisible: () => {},
            addNotification: state.notify,
          }}
        >
          <IntlProvider locale="zh-CN" messages={messages}>
            <CreatePatientForm
              showActionsButton
              selectedPatient={{}}
              showNotifications={showNotifications}
            />
          </IntlProvider>
        </NotificationContext.Provider>,
      );
      if (showNotifications === false) {
        expect(
          screen.queryByTestId("SIM form notification"),
        ).not.toBeInTheDocument();
      } else {
        expect(screen.getByTestId("SIM form notification")).toBeVisible();
      }
      expect(state.post).not.toHaveBeenCalled();
    },
  );
  test("clears the same mounted draft without POST or cancel and submits the refilled identity", async () => {
    const user = userEvent.setup();
    const { onCancel, onSaveSuccess } = mount();
    const lastName = input("lastName");
    const form = lastName.closest("form");
    await fill(user);
    const clear = clearButton();
    expect(clear).toHaveAttribute("id", "clear");
    expect(clear).toHaveAttribute("type", "button");
    expect(
      screen.getByRole("button", { name: messages["label.button.cancel"] }),
    ).toBeVisible();
    await user.click(clear);
    for (const id of ["lastName", "firstName", "subjectNumber", "nationalId"])
      expect(input(id)).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "SIM DOB" })).toHaveValue("");
    expect(input("radio-1")).not.toBeChecked();
    expect(input("radio-2")).not.toBeChecked();
    expect(input("lastName")).toBe(lastName);
    expect(lastName.closest("form")).toBe(form);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSaveSuccess).not.toHaveBeenCalled();
    expect(state.post).not.toHaveBeenCalled();
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: messages["label.button.save"] }),
    );
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    expect(state.post.mock.calls[0][0]).toBe("/rest/PatientManagement");
    const payload = JSON.parse(state.post.mock.calls[0][1]);
    expect(payload).toMatchObject({
      ...fixture,
      gender: "M",
      nationality: "CHINESE",
      photo: "",
      idDocuments: [],
    });
    for (const key of ["years", "months", "days"])
      expect(payload).not.toHaveProperty(key);
    expect(onSaveSuccess).toHaveBeenCalledWith("SIM-SAVED-42");
    expect(onCancel).not.toHaveBeenCalled();
  });
  test("restores configured defaults and clears age, photo, pending documents and district choices", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(
      screen.getByRole("textbox", { name: "SIM DOB" }),
      fixture.birthDateForDisplay,
    );
    expect(input("years").value).not.toBe("");
    await user.click(screen.getByRole("button", { name: "SIM choose photo" }));
    await user.click(
      screen.getByRole("button", { name: messages["patient.idDoc.title"] }),
    );
    await user.click(
      screen.getByRole("button", { name: "SIM choose document" }),
    );
    expect(screen.getByTestId("SIM photo value")).toHaveTextContent(
      "SIM-unsaved-photo",
    );
    expect(screen.getByTestId("SIM pending documents")).toHaveTextContent("1");
    await user.click(
      screen.getByRole("button", {
        name: messages["patient.label.additionalInfo"],
      }),
    );
    await user.selectOptions(input("nationality"), "AMERICAN");
    await user.selectOptions(input("health_region"), "SIM-REGION");
    await user.selectOptions(input("health_district"), "SIM district");
    expect(input("health_district")).toHaveValue("SIM district");
    await user.click(clearButton());
    for (const id of [
      "years",
      "months",
      "days",
      "health_region",
      "health_district",
    ])
      expect(input(id).value).toBe("");
    expect(input("nationality")).toHaveValue("CHINESE");
    expect(input("health_district").querySelectorAll("option")).toHaveLength(1);
    expect(screen.getByTestId("SIM photo value")).toBeEmptyDOMElement();
    expect(screen.getByTestId("SIM pending documents")).toHaveTextContent("0");
    expect(state.post).not.toHaveBeenCalled();
  });
  test("cannot clear while the parent disables actions", async () => {
    const user = userEvent.setup();
    mount({ disabled: true });
    expect(clearButton()).toBeDisabled();
    await user.click(clearButton());
    expect(state.post).not.toHaveBeenCalled();
  });
  test("cannot clear the draft while save is pending", async () => {
    const user = userEvent.setup();
    state.post.mockImplementation(() => {});
    mount();
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: messages["label.button.save"] }),
    );
    await waitFor(() => expect(state.post).toHaveBeenCalledTimes(1));
    expect(clearButton()).toBeDisabled();
    await user.click(clearButton());
    expect(input("lastName")).toHaveValue(fixture.lastName);
    expect(state.post).toHaveBeenCalledTimes(1);
  });
  test("keeps existing patient maintenance free of the new-draft clear action", async () => {
    const user = userEvent.setup();
    mount({
      maintenanceMode: true,
      maintenanceActorKey: "SIM-ACTOR",
      selectedPatient: {
        patientPK: "SIM-EXISTING-42",
        canEdit: true,
        ...fixture,
        gender: "M",
      },
    });
    expect(
      screen.queryByRole("button", { name: clearName }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: messages["label.button.edit"] }),
    );
    expect(input("lastName")).toHaveValue(fixture.lastName);
    expect(
      screen.queryByRole("button", { name: clearName }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages["label.button.cancel"] }),
    ).toBeVisible();
    expect(state.post).not.toHaveBeenCalled();
  });
});
