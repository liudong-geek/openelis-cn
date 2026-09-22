import React from "react";
import { render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import HomeDashBoard, { getDashboardLabNumberRoute } from "./Dashboard";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { NotificationContext } from "../layout/Layout";
import messages from "../../languages/en.json";
import { getFromOpenElisServer, Roles } from "../utils/Utils";
import {
  readPendingResultSummary,
  PendingSummaryError,
} from "./pendingResultSummary";

vi.mock("./pendingResultSummary", async () => ({
  ...(await vi.importActual("./pendingResultSummary")),
  readPendingResultSummary: vi.fn(),
}));

const summary = {
  scope: "pending",
  state: "ready",
  analysisCount: 0,
  specimenCount: 0,
  displayRowCount: 0,
  missingSpecimenAnalysisCount: 0,
  generatedAt: "2026-09-23T06:20:00Z",
};

vi.mock("../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../utils/Utils");
  return {
    ...actualUtils,
    getFromOpenElisServer: vi.fn(),
  };
});

const allWorkflowRoles = [
  Roles.RECEPTION,
  Roles.RESULTS,
  Roles.VALIDATION,
  Roles.REPORTS,
];

const renderDashboard = (metricOverrides = {}, roles = allWorkflowRoles) => {
  getFromOpenElisServer.mockImplementation((url, callback) => {
    if (url === "/rest/home-dashboard/metrics") {
      callback({
        ordersInProgress: 0,
        ordersReadyForValidation: 0,
        ordersCompletedToday: 0,
        patiallyCompletedToday: 0,
        orderEnterdByUserToday: 0,
        ordersRejectedToday: 0,
        unPritendResults: 0,
        incomigOrders: 0,
        averageTurnAroudTime: 0,
        delayedTurnAround: 0,
        ...metricOverrides,
      });
      return;
    }

    if (url === "/rest/user-test-sections/ALL") {
      callback([]);
      return;
    }

    callback({ displayItems: [], paging: null });
  });

  const history = createMemoryHistory({ initialEntries: ["/Dashboard"] });
  const view = render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              userId: "17",
              sessionId: "synthetic-session",
              csrf: "synthetic-csrf",
              loginLabUnit: "4",
              roles,
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
            <HomeDashBoard />
          </NotificationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>,
  );
  return { ...view, history };
};

describe("HomeDashBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("CSRF", "synthetic-csrf");
    readPendingResultSummary.mockResolvedValue(summary);
  });

  test("puts pending work and a primary task in the first dashboard view", async () => {
    const user = userEvent.setup();
    const { history } = renderDashboard();

    expect(
      await screen.findByRole("heading", {
        name: "Work requiring attention",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Laboratory workflow")).toBeInTheDocument();

    const newOrderButton = screen.getByRole("button", {
      name: "Create new order",
    });
    await user.click(newOrderButton);

    expect(history.location.pathname).toBe("/order/enter");
  });

  test("pending task opens the page where the work is completed", async () => {
    const user = userEvent.setup();
    const { history } = renderDashboard();

    const validationTask = await screen.findByRole("button", {
      name: /Results awaiting validation/i,
    });
    await user.click(validationTask);

    expect(history.location.pathname).toBe("/validation");
    expect(history.location.search).toBe("?type=routine");
  });

  test("pending result task opens the unified pending workbench", async () => {
    const user = userEvent.setup();
    const { history } = renderDashboard({ ordersInProgress: 1 });

    const resultTask = await screen.findByRole("button", {
      name: /Results awaiting entry/i,
    });
    await user.click(resultTask);

    expect(history.location.pathname).toBe("/Results");
    expect(history.location.search).toBe("?scope=pending");
  });

  test("workflow stages are navigation, not decorative counters", async () => {
    const user = userEvent.setup();
    const { history } = renderDashboard({ orderEnterdByUserToday: 37 });

    const specimenStage = await screen.findByRole("button", {
      name: /Sample.*Collect, receive, and label/i,
    });

    expect(specimenStage).not.toHaveTextContent("37");
    await user.click(specimenStage);

    expect(history.location.pathname).toBe("/order/collect");
  });

  test("only shows actions that the signed-in role can actually open", async () => {
    renderDashboard({}, [Roles.RESULTS]);

    expect(
      await screen.findByRole("button", { name: /Results awaiting entry/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enter results" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create new order" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Results awaiting validation/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reports awaiting printing/i }),
    ).not.toBeInTheDocument();
  });

  test("builds canonical internal routes for order drill-downs", () => {
    expect(getDashboardLabNumberRoute("ORDERS_IN_PROGRESS", "26 001/A")).toBe(
      "/Results?accessionNumber=26%20001%2FA",
    );
    expect(
      getDashboardLabNumberRoute("ORDERS_READY_FOR_VALIDATION", "26 001/A"),
    ).toBe("/validation?type=order&accessionNumber=26%20001%2FA");
    expect(
      getDashboardLabNumberRoute("ORDERS_COMPLETED_TODAY", "26 001/A"),
    ).toBeNull();
  });

  test("report work opens the report centre instead of an incomplete renderer URL", async () => {
    const user = userEvent.setup();
    const { history } = renderDashboard({}, [Roles.REPORTS]);

    const reportTask = await screen.findByRole("button", {
      name: /Reports awaiting printing/i,
    });
    await user.click(reportTask);

    expect(history.location.pathname).toBe("/RoutineReports");
  });

  test("operational metrics retain the detail drill-down", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const completedTile = await screen.findByRole("button", {
      name: /Orders Completed Today/i,
    });

    expect(completedTile).toHaveAttribute("tabindex", "0");
    expect(completedTile).toHaveTextContent("View Details");

    await user.click(completedTile);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Orders Completed Today",
          level: 2,
        }),
      ).toBeInTheDocument();
    });
  });

  test("uses test tasks from the partial summary without adding unlike counters", async () => {
    readPendingResultSummary.mockResolvedValue({
      ...summary,
      state: "partial",
      analysisCount: 7,
      specimenCount: 2,
      displayRowCount: null,
    });
    renderDashboard({ ordersInProgress: 9999, ordersReadyForValidation: 3 });
    const task = await screen.findByRole("button", {
      name: /Results awaiting entry/i,
    });
    await waitFor(() => expect(task).toHaveTextContent("7test tasks"));
    expect(task).toHaveTextContent("Other counts are temporarily unavailable.");
    expect(task).not.toHaveTextContent("9999");
    expect(screen.queryByText("10 pending")).not.toBeInTheDocument();
    expect(readPendingResultSummary).toHaveBeenCalledTimes(1);
  });

  test("only a confirmed zero shows an empty result worklist", async () => {
    renderDashboard({ ordersInProgress: 9999 });
    const task = await screen.findByRole("button", {
      name: /Results awaiting entry/i,
    });
    await waitFor(() =>
      expect(task).toHaveTextContent("No test tasks are awaiting entry."),
    );
    expect(task).toHaveTextContent("0test tasks");
    expect(task).not.toHaveTextContent("9999");
  });

  test("an unavailable count stays unknown while the permitted worklist remains reachable", async () => {
    readPendingResultSummary.mockRejectedValue(
      new PendingSummaryError("unavailable"),
    );
    const user = userEvent.setup();
    const { history } = renderDashboard({ ordersInProgress: 9999 });
    const task = await screen.findByRole("button", {
      name: /Results awaiting entry/i,
    });
    await within(task).findByText(
      "The count is unavailable. You can still open the worklist.",
    );
    expect(task).toHaveTextContent("—test tasks");
    expect(task).not.toHaveTextContent("No test tasks");
    expect(task).not.toHaveTextContent("Last successful count");
    expect(task).not.toHaveTextContent("9999");
    await user.click(task);
    expect(history.location.pathname + history.location.search).toBe(
      "/Results?scope=pending",
    );
  });

  test.each([
    ["forbidden", "You do not have access to this worklist."],
    [
      "unauthenticated",
      "Your session is unavailable. Sign in again to view tasks.",
    ],
  ])("a confirmed %s response disables the result task", async (kind, text) => {
    readPendingResultSummary.mockRejectedValue(new PendingSummaryError(kind));
    const user = userEvent.setup();
    const { history } = renderDashboard();
    const task = await screen.findByRole("button", {
      name: /Results awaiting entry/i,
    });
    await within(task).findByText(text);
    expect(task).toHaveAttribute("aria-disabled", "true");
    expect(task).toHaveTextContent("—test tasks");
    await user.click(task);
    expect(history.location.pathname).toBe("/Dashboard");
  });
});
