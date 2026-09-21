import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/en.json";
import { NotificationContext } from "../../layout/Layout";
import ProgramWorkspace from "./ProgramWorkspace";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerFullResponse: mocks.post,
}));

vi.mock("../../common/PageBreadCrumb", () => ({
  default: function MockBreadcrumb() {
    return <div data-testid="breadcrumb" />;
  },
}));

const notificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};

const renderPage = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <NotificationContext.Provider value={notificationContext}>
        <ProgramWorkspace />
      </NotificationContext.Provider>
    </IntlProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/displayList/PROGRAM") {
      callback([
        { id: "7", value: "Diabetes follow-up" },
        { id: "9", value: "Maternal screening" },
      ]);
    } else if (url === "/rest/displayList/TEST_SECTION_ACTIVE") {
      callback([
        { id: "12", value: "Chemistry" },
        { id: "13", value: "Hematology" },
      ]);
    }
  });
});

test("shows a guided program workspace with visual questions by default", async () => {
  renderPage();

  expect(
    await screen.findByRole("heading", {
      name: "Program and request form configuration",
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Program configuration overview" }),
  ).toHaveTextContent("2");
  expect(screen.getByTestId("program-selector")).toHaveTextContent(
    "New program",
  );
  expect(screen.getByText("No additional questions")).toBeVisible();
  expect(screen.queryByLabelText("Questionnaire JSON")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save program" })).toBeDisabled();
});

test("adds a visual question and keeps save disabled until it is complete", async () => {
  renderPage();
  await screen.findByText("No additional questions");

  fireEvent.click(screen.getByRole("button", { name: "Add first question" }));
  expect(screen.getByTestId("program-question-card")).toBeVisible();
  expect(screen.getByLabelText("Question text")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByText("Questions (1)")).toBeVisible();
});

test("submits program fields with a parsed questionnaire payload", async () => {
  mocks.post.mockImplementation((_url, _body, callback) => {
    callback({
      status: 200,
      json: async () => ({
        program: {
          id: "22",
          programName: "Renal clinic",
          code: "RENAL",
          questionnaireUUID: "",
        },
        testSectionId: "12",
        additionalOrderEntryQuestions: {
          resourceType: "Questionnaire",
          item: [],
        },
      }),
    });
  });
  renderPage();
  await screen.findByText("No additional questions");

  fireEvent.change(screen.getByLabelText("Program Name"), {
    target: { name: "program.programName", value: "Renal clinic" },
  });
  fireEvent.change(screen.getByLabelText("Program Code"), {
    target: { name: "program.code", value: "RENAL" },
  });
  fireEvent.change(screen.getByLabelText("Test Section"), {
    target: { name: "testSectionId", value: "12" },
  });

  const save = screen.getByRole("button", { name: "Save program" });
  expect(save).toBeEnabled();
  fireEvent.click(save);

  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  const [, body] = mocks.post.mock.calls[0];
  const payload = JSON.parse(body);
  expect(payload.program.programName).toBe("Renal clinic");
  expect(payload.program.code).toBe("RENAL");
  expect(payload.testSectionId).toBe("12");
  expect(payload.additionalOrderEntryQuestions).toEqual({
    resourceType: "Questionnaire",
  });
});

test("advanced JSON mode blocks saving malformed questionnaire data", async () => {
  renderPage();
  await screen.findByText("No additional questions");

  fireEvent.click(screen.getByRole("switch", { name: "Editing mode" }));
  const editor = screen.getByLabelText("Questionnaire JSON");
  fireEvent.change(editor, {
    target: { name: "additionalOrderEntryQuestions", value: "{" },
  });

  expect(editor).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Save program" })).toBeDisabled();
});
