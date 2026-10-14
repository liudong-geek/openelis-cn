import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/zh_CN.json";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import PatientManagement from "../PatientManagement";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
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
    const notification = React.useContext(NotificationContext);
    return (
      <div>
        {notification.notificationVisible &&
          props.showNotifications !== false && <AlertDialog />}
        SIM editor
        <input aria-label="SIM draft" defaultValue="SIM draft" />
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
        <button
          onClick={() => {
            notification.setNotificationVisible(true);
            notification.addNotification({
              title: messages["notification.title"],
              message: messages["success.save.patient"],
              kind: NotificationKinds.success,
            });
            props.onSaveSuccess("42");
          }}
        >
          SIM saved with notification
        </button>
        <button
          onClick={() => {
            notification.setNotificationVisible(true);
            notification.addNotification({
              title: "SIM",
              message: "SIM rejected",
              kind: NotificationKinds.error,
            });
          }}
        >
          SIM rejected notification
        </button>
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
        {props.onOpenResults && (
          <button onClick={() => props.onOpenResults({ patientPK: "42" })}>
            SIM results
          </button>
        )}
        <button onClick={props.onNewPatient}>SIM new</button>
      </div>
    );
  },
}));
vi.mock("../SearchPatientForm", () => ({ default: () => null }));
const patientMenus = (historyFlag = true) => [
  {
    menu: { elementId: "menu_patient", isActive: true },
    childMenus: [
      { menu: { elementId: "menu_patient_add_or_edit", isActive: true } },
      { menu: { elementId: "menu_patienthistory", isActive: historyFlag } },
      { menu: { elementId: "menu_patient_create", isActive: false } },
    ],
  },
];
function NotificationProvider({ children }) {
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [notificationVisible, setNotificationVisible] = React.useState(false);
  return (
    <NotificationContext.Provider
      value={{
        notifications,
        notificationVisible,
        setNotificationVisible,
        addNotification: (body) =>
          setNotifications((current) => [...current, body]),
        removeNotification: (index) =>
          setNotifications((current) =>
            current.filter((_body, position) => position !== index),
          ),
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
const mount = (
  path: string | { pathname: string; state: unknown } = "/PatientManagement",
  actor = "SIM-A",
  initialMenus = patientMenus(),
) => {
  let menus = initialMenus;
  let currentSession: Record<string, unknown>;
  const history = createMemoryHistory({ initialEntries: [path] });
  const content = (session: Record<string, unknown>) => {
    currentSession = session;
    const userId = String(session.userName || actor);
    return (
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            userId,
            sessionId: `${userId}-session`,
            roles: ["Reception"],
            ...session,
          },
        }}
      >
        <NotificationProvider>
          <ConfigurationContext.Provider value={{ navigationMenuItems: menus }}>
            <Router history={history}>
              <IntlProvider locale="zh-CN" messages={messages}>
                <Route path="/PatientManagement/:patientId?">
                  <PatientManagement />
                </Route>
              </IntlProvider>
            </Router>
          </ConfigurationContext.Provider>
        </NotificationProvider>
      </UserSessionDetailsContext.Provider>
    );
  };
  const view = render(
    content({ authenticated: true, userName: actor, csrf: "token-A" }),
  );
  return {
    history,
    ...view,
    rerenderMenus: (next) => {
      menus = next;
      view.rerender(content(currentSession));
    },
    rerenderSession: (session: Record<string, unknown>) =>
      view.rerender(content(session)),
  };
};
beforeEach(() => {
  // JSDOM has no layout; Carbon uses offsetParent to find visible tabbable nodes.
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(
    function () {
      return this.closest(".cds--modal.is-visible") ? this.parentElement : null;
    },
  );
  mocks.form.mockClear();
  mocks.list.mockClear();
  mocks.details.mockClear();
  mocks.caps = true;
});
afterEach(() => vi.restoreAllMocks());

describe("patient list maintenance modal", () => {
  test.each(["SIM new", "SIM view"])(
    "a successful %s save leaves one real status notification visible after the modal closes",
    (launcher) => {
      const { history } = mount();
      fireEvent.click(screen.getByRole("button", { name: launcher }));
      expect(screen.getByText("SIM editor")).toBeVisible();
      fireEvent.click(
        screen.getByRole("button", { name: "SIM saved with notification" }),
      );
      expect(
        document.querySelector(".patient-create-modal"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("SIM list")).toBeVisible();
      expect(history.location.pathname).toBe("/PatientManagement");
      const statuses = screen.getAllByRole("status");
      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toBeVisible();
      expect(statuses[0]).toHaveTextContent(messages["success.save.patient"]);
      expect(statuses[0].closest(".patient-create-modal")).toBeNull();
      expect(mocks.list.mock.calls.at(-1)[0].initialState).toMatchObject({
        managementMode: "list",
      });
    },
  );
  test("reopening the modal preserves the original toast lifetime and cannot replay an expired notice", () => {
    vi.useFakeTimers();
    try {
      mount();
      fireEvent.click(screen.getByRole("button", { name: "SIM new" }));
      fireEvent.click(
        screen.getByRole("button", { name: "SIM saved with notification" }),
      );
      const toast = screen.getByRole("status");
      act(() => vi.advanceTimersByTime(1500));
      fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
      expect(
        document.querySelectorAll(".cds--toast-notification"),
      ).toHaveLength(1);
      expect(document.querySelector(".cds--toast-notification")).toBe(toast);
      act(() => vi.advanceTimersByTime(600));
      expect(
        document.querySelector(".cds--toast-notification"),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "SIM cancel" }));
      expect(
        document.querySelector(".patient-create-modal"),
      ).not.toBeInTheDocument();
      expect(
        document.querySelector(".cds--toast-notification"),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  test("keeps only one real notification while the patient modal remains open", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
    fireEvent.click(
      screen.getByRole("button", { name: "SIM rejected notification" }),
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("SIM rejected");
    expect(statuses[0]).toBeVisible();
    expect(statuses[0].closest(".patient-create-modal")).toBeNull();
  });
  test("keeps the order return context without applying its paging to patients", () => {
    const listOrigin = {
      pathname: "/order",
      state: {
        listState: {
          page: 3,
          pageSize: 100,
          statusFilter: "collection_pending",
        },
      },
    };
    const { history } = mount({
      pathname: "/PatientManagement",
      state: { listOrigin },
    });

    expect(mocks.list.mock.calls.at(-1)[0].initialState).toEqual({
      managementMode: "list",
    });
    expect(history.location.state).toEqual({ listOrigin });
  });

  test("restores patient paging and query only from the patient list origin", () => {
    const listState = {
      query: "陈晓宁",
      page: 3,
      pageSize: 10,
      searchMode: true,
      managementMode: "list",
    };
    mount({
      pathname: "/PatientManagement",
      state: {
        listOrigin: { pathname: "/PatientManagement", state: { listState } },
      },
    });

    expect(mocks.list.mock.calls.at(-1)[0].initialState).toEqual(listState);
  });

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
  test.each(["SIM cancel", "关闭"])(
    "the actual Carbon discard modal takes safe default focus after %s",
    async (launcherName) => {
      const user = userEvent.setup();
      mount();
      await user.click(screen.getByRole("button", { name: "SIM view" }));
      await user.click(screen.getByRole("button", { name: "SIM dirty" }));
      const launcher = screen.getByRole("button", { name: launcherName });
      await user.click(launcher);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "继续编辑" })).toHaveFocus(),
      );
      expect(
        document.activeElement.closest(".patient-maintenance-confirm"),
      ).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "关闭并放弃草稿" }),
      ).not.toHaveFocus();
      await user.click(screen.getByRole("button", { name: "继续编辑" }));
      await waitFor(() => expect(launcher).toHaveFocus());
      expect(document.querySelector(".patient-maintenance-confirm")).toBeNull();
      expect(screen.getByText("SIM editor")).toBeVisible();
    },
  );
  test("Tab and Shift+Tab remain within the actual Carbon discard confirmation", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "SIM view" }));
    await user.click(screen.getByRole("button", { name: "SIM dirty" }));
    await user.click(screen.getByRole("button", { name: "SIM cancel" }));
    const keep = screen.getByRole("button", { name: "继续编辑" });
    const discard = screen.getByRole("button", { name: "关闭并放弃草稿" });
    const confirmation = keep.closest(".patient-maintenance-confirm");
    const close = confirmation.querySelector(".cds--modal-close");
    await waitFor(() => expect(keep).toHaveFocus());
    await user.tab();
    expect(discard).toHaveFocus();
    await user.tab();
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab();
    expect(keep).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    await waitFor(() => expect(discard).toHaveFocus());
    expect(confirmation).toContainElement(document.activeElement);
    expect(document.querySelector(".patient-create-modal")).toHaveClass(
      "is-visible",
    );
  });
  test("Escape dismisses only confirmation, restores its launcher and retains the draft", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "SIM view" }));
    const draft = screen.getByRole("textbox", { name: "SIM draft" });
    await user.clear(draft);
    await user.type(draft, "SIM retained draft");
    await user.click(screen.getByRole("button", { name: "SIM dirty" }));
    const launcher = screen.getByRole("button", { name: "SIM cancel" });
    await user.click(launcher);
    expect(screen.getByText("关闭患者资料？")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(document.querySelector(".patient-maintenance-confirm")).toBeNull(),
    );
    expect(document.querySelector(".patient-create-modal")).toHaveClass(
      "is-visible",
    );
    expect(screen.getByRole("textbox", { name: "SIM draft" })).toBe(draft);
    expect(draft).toHaveValue("SIM retained draft");
    await waitFor(() => expect(launcher).toHaveFocus());
    await user.click(launcher);
    expect(screen.getByText("关闭患者资料？")).toBeVisible();
    expect(draft).toHaveValue("SIM retained draft");
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

describe("current history shortcut menu visibility", () => {
  test.each([null, patientMenus(false)])(
    "unknown or OFF history %j withholds results and keeps ordinary maintenance",
    (menus) => {
      mount("/PatientManagement", "SIM-A", menus);
      expect(
        screen.queryByRole("button", { name: "SIM results" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "新患者" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "SIM view" }));
      expect(screen.getByText("SIM editor")).toBeVisible();
    },
  );
  test("results withdrawal blocks an old callback immediately without navigation", () => {
    const view = mount();
    const oldCallback = mocks.list.mock.calls.at(-1)[0].onOpenResults;
    expect(screen.getByRole("button", { name: "SIM results" })).toBeVisible();
    view.rerenderMenus(patientMenus(false));
    expect(
      screen.queryByRole("button", { name: "SIM results" }),
    ).not.toBeInTheDocument();
    act(() => oldCallback({ patientPK: "42" }));
    expect(view.history.location.pathname).toBe("/PatientManagement");
    view.rerenderMenus(patientMenus(true));
    fireEvent.click(screen.getByRole("button", { name: "SIM results" }));
    expect(view.history.location.pathname).toBe("/PatientResults/42");
  });
  test("research-only patient creation OFF does not prevent ordinary new patient modal", () => {
    const view = mount();
    expect(
      patientMenus()[0].childMenus.find(
        (entry) => entry.menu.elementId === "menu_patient_create",
      ).menu.isActive,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "新患者" }));
    expect(screen.getByText("SIM editor")).toBeVisible();
    expect(view.history.location.pathname).toBe("/PatientManagement");
  });
  test("a role withdrawal cannot retain a results shortcut from an old snapshot", () => {
    const view = mount();
    view.rerenderSession({
      authenticated: true,
      userName: "SIM-A",
      csrf: "token-A",
      roles: ["User Account Administrator"],
    });
    expect(
      screen.queryByRole("button", { name: "SIM results" }),
    ).not.toBeInTheDocument();
    expect(view.history.location.pathname).toBe("/PatientManagement");
  });
});
