import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { confirmAlert } from "react-confirm-alert";
import App from "./App";
import { Roles } from "./components/utils/Utils";

// Exercise the real App, SecureRoute, layout and QC list. Only HTTP and the
// browser's access-denied dialog are controlled.
vi.mock("react-confirm-alert", () => ({ confirmAlert: vi.fn() }));

let roles, requests;
const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  roles = [];
  requests = [];
  localStorage.clear();
  localStorage.setItem("locale", "zh");
  vi.mocked(confirmAlert).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, options = {}) => {
      const url = new URL(String(input), window.location.origin);
      requests.push({ path: url.pathname, search: url.search, options });
      if (url.pathname.endsWith("/session")) {
        return json({
          authenticated: true,
          userId: "qc-access-user",
          sessionId: "qc-access-session",
          roles,
          userLabRolesMap: {},
        });
      }
      if (url.pathname.endsWith("/rest/qc/imports")) {
        return json({ rows: [], total: 0 });
      }
      if (url.pathname.endsWith("/rest/menu")) {
        return json([
          {
            menu: {
              elementId: "menu_home",
              displayKey: "banner.menu.home",
              actionURL: "/Dashboard",
              isActive: true,
            },
            childMenus: [],
          },
        ]);
      }
      if (
        url.pathname.endsWith("/rest/supportedlocales/active") ||
        url.pathname.endsWith("/rest/notifications")
      ) {
        return json([]);
      }
      if (url.pathname.endsWith("/rest/notification/pnconfig")) {
        return json({ subscribed: false });
      }
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

const open = (role, path = "/analyzers/qc/imports") => {
  roles = [role];
  window.history.replaceState({}, "", path);
  return render(<App />);
};

test.each([Roles.GLOBAL_ADMIN, Roles.LAB_SUPERVISOR])(
  "%s can directly open the pending QC imports list",
  async (role) => {
    open(role);

    expect(
      await screen.findByText("当前条件下没有质控导入记录。"),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "仪器质控待处理" }),
    ).toBeVisible();
    expect(
      requests.filter(({ path }) => path.endsWith("/rest/qc/imports")),
    ).toEqual([
      expect.objectContaining({ search: "?status=OPEN&limit=20&offset=0" }),
    ]);
    expect(confirmAlert).not.toHaveBeenCalled();
    expect(requests.filter(({ options }) => options.method === "POST")).toEqual(
      [],
    );
  },
);

test.each([Roles.RESULTS, Roles.ANALYSER_IMPORT])(
  "%s cannot open imports or request the protected list",
  async (role) => {
    open(role);
    await waitFor(() => expect(confirmAlert).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("region", { name: "仪器质控待处理" }),
    ).not.toBeInTheDocument();
    expect(requests.filter(({ path }) => path.includes("/rest/qc/"))).toEqual(
      [],
    );
  },
);

test.each([
  "/analyzers/qc/instruments/1",
  "/analyzers/qc/db",
  "/analyzers/qc/charts/1",
  "/analyzers/qc/control-lots",
  "/analyzers/qc/control-lots/new",
  "/analyzers/qc/control-lots/1",
  "/analyzers/qc/rule-config",
])("the import permission does not grant administrators %s", async (path) => {
  open(Roles.GLOBAL_ADMIN, path);
  await waitFor(() => expect(confirmAlert).toHaveBeenCalledOnce());
  expect(requests.filter(({ path }) => path.includes("/rest/qc/"))).toEqual([]);
});
