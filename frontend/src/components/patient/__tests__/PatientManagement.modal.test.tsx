import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/zh_CN.json";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import PatientManagement from "../PatientManagement";
const mocks = vi.hoisted(() => ({
  form: vi.fn(),
  list: vi.fn(),
  caps: true,
  details: vi.fn(),
}));
vi.mock("../../common/PageBreadCrumb", () => ({ default: () => null }));
vi.mock("../../common/ProductPageHeader", () => ({
  default: ({ title, actions }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: (_url, callback) =>
    callback({ canCreate: mocks.caps }),
}));
vi.mock("../usePatientDetails", () => ({
  default: (id) => {
    mocks.details(id);
    return {
      patient: id
        ? {
            patientPK: id,
            lastName: "陈",
            firstName: "晓宁",
            nationalId: "SIM-001",
            canEdit: true,
          }
        : null,
      loading: false,
      error: null,
    };
  },
}));
vi.mock("../CreatePatientForm", () => ({
  default: (props) => {
    mocks.form(props);
    return (
      <div>
        SIM editor
        <button
          onClick={() =>
            props.onFormStateChange({
              dirty: true,
              busy: false,
              unknown: false,
            })
          }
        >
          SIM dirty
        </button>
        <button
          onClick={() =>
            props.onFormStateChange({ dirty: true, busy: true, unknown: false })
          }
        >
          SIM busy
        </button>
        <button onClick={props.onCancel}>SIM cancel</button>
        <button onClick={() => props.onSaveSuccess("42")}>SIM saved</button>
      </div>
    );
  },
}));
vi.mock("../PatientMasterList", () => ({
  default: (props) => {
    mocks.list(props);
    return (
      <div>
        SIM list
        <button
          onClick={() => {
            props.onStateChange({
              query: "SIM",
              page: 3,
              pageSize: 10,
              searchMode: true,
            });
            props.onOpenPatient({ patientPK: "42", firstName: "incomplete" });
          }}
        >
          SIM view
        </button>
        <button onClick={() => props.onOpenResults({ patientPK: "42" })}>
          SIM results
        </button>
        <button onClick={props.onNewPatient}>SIM new</button>
      </div>
    );
  },
}));
vi.mock("../SearchPatientForm", () => ({ default: () => null }));
const mount = (path = "/PatientManagement", actor = "SIM-A") => {
  const history = createMemoryHistory({ initialEntries: [path] });
  const content = (session: Record<string, unknown>) => (
    <UserSessionDetailsContext.Provider value={{ userSessionDetails: session }}>
      <Router history={history}>
        <IntlProvider locale="zh-CN" messages={messages}>
          <Route path="/PatientManagement/:patientId?">
            <PatientManagement />
          </Route>
        </IntlProvider>
      </Router>
    </UserSessionDetailsContext.Provider>
  );
  const view = render(
    content({ authenticated: true, userName: actor, csrf: "token-A" }),
  );
  return {
    history,
    ...view,
    rerenderSession: (session: Record<string, unknown>) =>
      view.rerender(content(session)),
  };
};
beforeEach(() => {
  mocks.form.mockClear();
  mocks.list.mockClear();
  mocks.details.mockClear();
  mocks.caps = true;
});
describe("patient list maintenance modal", () => {
  test("keeps list, route and complete row identity while showing Chinese patient title", () => {
    const { history } = mount();
    fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
    expect(screen.getByText("SIM list")).toBeVisible();
    expect(screen.getByText("SIM editor")).toBeVisible();
    expect(history.location.pathname).toBe("/PatientManagement");
    expect(mocks.details).toHaveBeenLastCalledWith("42");
    expect(screen.getByText("陈晓宁 · SIM-001")).toBeVisible();
    expect(mocks.form.mock.calls.at(-1)[0].selectedPatient.firstName).toBe(
      "晓宁",
    );
  });
  test("dirty close keeps the actual Carbon modal visible until discard is confirmed", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM cancel" }));
    expect(document.querySelector(".patient-create-modal")).toHaveClass(
      "is-visible",
    );
    expect(screen.getByText("SIM editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByText("SIM editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "SIM cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭并放弃草稿" }));
    expect(screen.queryByText("SIM editor")).not.toBeInTheDocument();
    expect(screen.getByText("SIM list")).toBeVisible();
  });
  test("save locks close and successful save refreshes the same filter and page", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM busy" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM cancel" }));
    expect(screen.getByText("SIM editor")).toBeVisible();
    expect(screen.queryByText("关闭患者资料？")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SIM saved" }));
    expect(screen.queryByText("SIM editor")).not.toBeInTheDocument();
    expect(mocks.list.mock.calls.at(-1)[0].initialState).toMatchObject({
      query: "SIM",
      page: 3,
      pageSize: 10,
      searchMode: true,
    });
  });
  test("preserves bookmarked patient URL compatibility inside the list modal", () => {
    const { history } = mount("/PatientManagement/42");
    expect(screen.getByText("SIM list")).toBeVisible();
    expect(screen.getByText("SIM editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "SIM cancel" }));
    expect(history.location.pathname).toBe("/PatientManagement");
  });
  test("results use their independent workspace with the originating list context", () => {
    const { history } = mount();
    fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM results" }));
    expect(history.location.pathname).toBe("/PatientResults/42");
    expect(history.location.state.listOrigin.state.listState.page).toBe(3);
  });
  test("does not open creation when the capability is absent", () => {
    mocks.caps = false;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "SIM new" }));
    expect(screen.queryByText("SIM editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新患者" })).toBeDisabled();
  });
  test("preserves the patient draft on same-account token refresh and isolates account changes", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM dirty" }));
    const oldSaved = mocks.form.mock.calls.at(-1)[0].onSaveSuccess;
    view.rerenderSession({
      authenticated: true,
      userName: "SIM-A",
      csrf: "token-B",
    });
    expect(screen.getByText("SIM editor")).toBeVisible();
    view.rerenderSession({
      authenticated: true,
      userName: "SIM-B",
      csrf: "token-C",
    });
    expect(screen.queryByText("SIM editor")).not.toBeInTheDocument();
    const previousListCalls = mocks.list.mock.calls.length;
    act(() => oldSaved("42"));
    expect(mocks.list.mock.calls.length).toBe(previousListCalls);
  });
});
