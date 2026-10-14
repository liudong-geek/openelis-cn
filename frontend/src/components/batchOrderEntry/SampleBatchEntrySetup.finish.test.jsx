import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import SampleBatchEntrySetup from "./SampleBatchEntrySetup";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
  postToOpenElisServerJsonResponse,
} from "../utils/Utils";

vi.mock("../utils/Utils", async (importOriginal) => ({
  ...(await importOriginal()),
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
  postToOpenElisServerJsonResponse: vi.fn(),
}));

let generator, save, readback, submitted;

beforeEach(() => {
  window.scrollTo = vi.fn();
  generator = save = readback = submitted = undefined;
  getFromOpenElisServer.mockReset();
  postToOpenElisServerFullResponse.mockReset();
  postToOpenElisServerJsonResponse.mockReset();
  getFromOpenElisServer.mockImplementation((endpoint, callback) => {
    if (endpoint === "/rest/SamplePatientEntry") {
      callback({
        sampleOrderItems: {
          referringSiteList: [{ id: "279", value: "279 - Synthetic site" }],
        },
      });
    } else if (endpoint === "/rest/user-sample-types") {
      callback([{ id: "1", value: "Serum" }]);
    } else if (endpoint.startsWith("/rest/sample-type-tests")) {
      callback({
        panels: [],
        tests: [{ id: "1", name: "Synthetic batch test" }],
      });
    } else if (endpoint === "/rest/SampleEntryGenerateScanProvider") {
      generator = callback;
    } else if (endpoint.startsWith("/rest/order/saved?")) {
      readback = callback;
    } else {
      callback([]);
    }
  });
  postToOpenElisServerFullResponse.mockImplementation(
    async (url, body, callback) => {
      expect(url).toBe("/rest/SampleBatchEntry");
      callback({ status: 200 });
      return { status: 200 };
    },
  );
  postToOpenElisServerJsonResponse.mockImplementation((url, body, callback) => {
    expect(url).toBe("/rest/SamplePatientEntryBatch");
    submitted = JSON.parse(body);
    save = callback;
  });
});

const mount = () => {
  const history = createMemoryHistory({
    initialEntries: ["/SampleBatchEntrySetup"],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <ConfigurationContext.Provider
          value={{
            configurationProperties: {
              DEFAULT_DATE_LOCALE: "en-US",
              currentDateAsText: "10/15/2026",
              currentTimeAsText: "10:00",
            },
          }}
        >
          <NotificationContext.Provider
            value={{
              notificationVisible: false,
              setNotificationVisible: vi.fn(),
              addNotification: vi.fn(),
            }}
          >
            <SampleBatchEntrySetup />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    </Router>,
  );
  return history;
};

const enterBatch = async () => {
  fireEvent.change(screen.getByLabelText("Sample Type"), {
    target: { value: "1" },
  });
  fireEvent.click(await screen.findByLabelText("Synthetic batch test"));
  fireEvent.change(document.querySelector("#method-dropdown"), {
    target: { value: "On Demand" },
  });
  fireEvent.change(document.querySelector("#siteName"), {
    target: { value: "Synthetic" },
  });
  fireEvent.click(screen.getByText("279 - Synthetic site"));
  const next = screen.getByTestId("next-button-BatchOrderEntry");
  expect(next).toBeEnabled();
  fireEvent.click(next);
  await screen.findByTestId("generate-barcode-link-BatchOrderEntry");
};

const acknowledgeSave = async () => {
  fireEvent.click(screen.getByTestId("generate-barcode-link-BatchOrderEntry"));
  await act(async () => generator({ status: true, body: "GENERATED-101" }));
  expect(postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
  await act(async () => save({ sampleOrderItems: { labNo: "GENERATED-101" } }));
  await act(async () =>
    readback({
      queryVersion: "2",
      orderId: "101",
      labNumber: "GENERATED-101",
      patient: {
        patientId: "11",
        firstName: "",
        lastName: "",
        nationalId: "",
        gender: "",
      },
      sampleOrderItems: { ...submitted.sampleOrderItems },
      samples: [
        {
          sampleTypeId: "1",
          collectionDate: "10/15/2026",
          analyses: [{ analysisId: "111", testId: "1", panelId: null }],
        },
      ],
    }),
  );
  expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeEnabled();
};

test("finishing a verified batch resets the real parent on its unchanged route without another save", async () => {
  const history = mount();
  await enterBatch();
  await acknowledgeSave();
  fireEvent.click(document.querySelector("[data-cy='finishButton']"));
  expect(history.location.pathname).toBe("/SampleBatchEntrySetup");
  await waitFor(() =>
    expect(document.querySelector(".batch-order-setup")).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("heading", { name: messages["order.entry.setup"] }),
  ).toBeVisible();
  expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
  expect(document.querySelector("#method-dropdown")).toHaveValue("");
  expect(document.querySelector("#selectSampleType")).toHaveValue("");
  expect(document.querySelector("#siteName")).toHaveValue("");
  expect(
    document.querySelector(
      "[data-testid='generate-barcode-link-BatchOrderEntry']",
    ),
  ).not.toBeInTheDocument();
  expect(postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
});

test("Finish cannot discard an in-flight generated or saving label", async () => {
  mount();
  await enterBatch();
  fireEvent.click(screen.getByTestId("generate-barcode-link-BatchOrderEntry"));
  expect(document.querySelector("[data-cy='finishButton']")).toBeDisabled();
  await act(async () => generator({ status: true, body: "GENERATED-102" }));
  expect(document.querySelector("[data-cy='finishButton']")).toBeDisabled();
  fireEvent.click(document.querySelector("[data-cy='finishButton']"));
  expect(document.querySelector(".batch-order-setup")).not.toBeInTheDocument();
  expect(postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
});

test("Finish keeps an unknown save locked and never replays its clinical request", async () => {
  mount();
  await enterBatch();
  fireEvent.click(screen.getByTestId("generate-barcode-link-BatchOrderEntry"));
  await act(async () => generator({ status: true, body: "GENERATED-103" }));
  await act(async () => save({ sampleOrderItems: { labNo: "GENERATED-103" } }));
  await act(async () => readback({}));
  expect(document.querySelector("[data-cy='finishButton']")).toBeDisabled();
  fireEvent.click(document.querySelector("[data-cy='finishButton']"));
  expect(document.querySelector(".batch-order-setup")).not.toBeInTheDocument();
  expect(screen.getByTestId("next-button-BatchOrderEntry")).toBeDisabled();
  expect(postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1);
});
