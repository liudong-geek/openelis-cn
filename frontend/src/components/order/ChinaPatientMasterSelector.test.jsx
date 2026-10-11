import React, { useState } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import PatientSearchSection from "./steps/sections/PatientSearchSection";
import messages from "../../languages/zh.json";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: api.get }));
vi.mock("../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: () => {},
    addNotification: () => {},
  }),
  ConfigurationContext: React.createContext({ configurationProperties: {} }),
}));
vi.mock("../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { success: "success", error: "error" },
}));
// This contract covers the real quick selector and real SearchPatientForm
// modal. New-patient Formik fields have their own identity/lifecycle suite.
vi.mock("../patient/CreatePatientForm", () => ({ default: () => null }));

test("快捷患者查询使用同一分页查询，患者选择弹窗保留当前申请路由和草稿", async () => {
  const requests = [];
  api.get.mockReset().mockImplementation((url, callback, signal) => {
    requests.push({ url, callback, signal });
  });
  const user = userEvent.setup();
  const history = createMemoryHistory({
    initialEntries: ["/order/enter?draft=SIM-ORDER"],
  });
  const draft = {
    patientProperties: {},
    sampleOrderItems: { labNo: "SIM-ORDER", referringSiteId: "SIM-SITE" },
    samples: [{ id: "SIM-SPECIMEN", sampleTypeId: "2", tests: ["11"] }],
  };
  let currentOrder;
  function Harness() {
    const [data, setData] = useState(draft);
    currentOrder = data;
    return (
      <PatientSearchSection
        orderData={data}
        setOrderData={setData}
        isReadOnly={false}
      />
    );
  }
  render(
    <Router history={history}>
      <IntlProvider locale="zh" messages={messages}>
        <Harness />
      </IntlProvider>
    </Router>,
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await user.type(
    screen.getByRole("textbox", {
      name: messages["patient.quickSearch.label"],
    }),
    "  SIM患者  ",
  );
  await user.click(
    screen.getByRole("button", { name: messages["label.button.search"] }),
  );
  const firstQuery = new URLSearchParams(requests[0].url.split("?")[1]);
  expect(requests[0].url.split("?")[0]).toBe("/rest/patient-search-results");
  expect(firstQuery.get("quickQuery")).toBe("SIM患者");
  expect(firstQuery.get("suppressExternalSearch")).toBe("true");
  act(() =>
    requests[0].callback({
      queryId: "SIM-PATIENT-MASTER",
      totalItems: 3,
      patientSearchResults: [
        { patientID: "101", lastName: "SIM患者甲" },
        { patientID: "102", lastName: "SIM患者乙" },
      ],
      paging: { currentPage: "1", totalPages: "2" },
    }),
  );
  await user.click(
    screen.getByRole("button", { name: messages["pagination.next"] }),
  );
  const nextQuery = new URLSearchParams(requests[1].url.split("?")[1]);
  expect(nextQuery.get("quickQuery")).toBe("SIM患者");
  expect(nextQuery.get("queryId")).toBe("SIM-PATIENT-MASTER");
  expect(nextQuery.get("page")).toBe("2");
  act(() =>
    requests[1].callback({
      queryId: "SIM-PATIENT-MASTER",
      totalItems: 3,
      patientSearchResults: [{ patientID: "103", lastName: "SIM患者丙" }],
      paging: { currentPage: "2", totalPages: "2" },
    }),
  );
  expect(screen.getByRole("row", { name: /SIM患者丙/ })).toBeVisible();
  await user.click(
    screen.getByRole("button", {
      name: messages["order.entry.patient.picker.open"],
    }),
  );
  expect(history.location.pathname).toBe("/order/enter");
  expect(history.location.search).toBe("?draft=SIM-ORDER");
  const dialog = screen.getByRole("dialog", {
    name: messages["order.entry.patient.picker.title"],
  });
  expect(dialog).toBeVisible();
  expect(
    within(dialog).getByRole("textbox", {
      name: messages["patient.quickSearch.label"],
    }),
  ).toBeVisible();
  expect(currentOrder).toBe(draft);
  await user.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.cancel"],
    }),
  );
  expect(
    screen.queryByRole("dialog", {
      name: messages["order.entry.patient.picker.title"],
    }),
  ).not.toBeInTheDocument();
  expect(history.location.pathname).toBe("/order/enter");
  expect(history.location.search).toBe("?draft=SIM-ORDER");
  expect(currentOrder).toBe(draft);
});
