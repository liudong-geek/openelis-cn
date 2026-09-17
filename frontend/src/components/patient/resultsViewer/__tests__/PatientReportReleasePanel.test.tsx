import React from "react";
import { waitFor } from "@testing-library/dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import PatientReportReleasePanel from "../PatientReportReleasePanel";
import UserSessionDetailsContext from "../../../../UserSessionDetailsContext";
import en from "../../../../languages/en.json";
import {
  application,
  document as doc,
  release,
  frozen,
  scope,
  rules,
  session,
  clone,
  json,
} from "./reportFixtures";
import type { ReportRelease } from "../patient-report-release-api";

function server() {
  const state = {
    history: [] as ReportRelease[],
    docs: [] as (typeof doc)[],
    snapshot: false,
    unknownIssue: false,
    rejectIssue: false,
    unknownPrint: false,
  };
  const fetcher = vi.fn(
    async (
      input: RequestInfo | URL,
      options?: RequestInit,
    ): Promise<Response> => {
      const path = new URL(String(input), "http://localhost").pathname.replace(
        "/api/OpenELIS-Global",
        "",
      );
      const method = options?.method || "GET";
      if (path.endsWith("/applications"))
        return json(
          new URL(String(input), "http://localhost").searchParams.get(
            "patientId",
          ) === "42"
            ? [application]
            : [],
        );
      if (path.endsWith("/group-rules")) return json(rules);
      if (path.endsWith("/documents") && method === "GET")
        return json(state.docs);
      if (path.endsWith("/documents") && method === "POST") {
        state.docs = [clone(doc)];
        return json(doc);
      }
      if (path.endsWith("/documents/60")) return json(doc);
      if (path.endsWith("/releases") && method === "GET")
        return json(state.history);
      if (path.endsWith("/releases") && method === "POST") {
        const body = JSON.parse(String(options?.body));
        const r = {
          ...clone(release),
          amendmentReason: body.amendmentReason || undefined,
        };
        state.history = [r];
        return json(r);
      }
      const selected = state.history.find((r) =>
        path.includes(`/releases/${r.id}`),
      );
      if (path.endsWith("/freeze")) {
        state.snapshot = true;
        return json(frozen);
      }
      if (path.endsWith("/snapshot"))
        return state.snapshot ? json(frozen) : json({}, 404);
      if (path.endsWith("/issue")) {
        if (state.rejectIssue) return json({}, 409);
        state.history = [
          {
            ...release,
            status: "ISSUED",
            issuedAt: "2026-09-16T10:02:00Z",
            issuedByName: "Reviewer",
            pdfSha256: "b".repeat(64),
            printCount: 0,
          },
        ];
        if (state.unknownIssue) throw new TypeError("connection lost");
        return json(state.history[0]);
      }
      if (path.endsWith("/void")) {
        state.history = [
          {
            ...state.history[0],
            status: "VOIDED",
            voidReason: JSON.parse(String(options?.body)).reason,
          },
        ];
        return json(state.history[0]);
      }
      if (path.endsWith(".pdf") || path.endsWith("/print")) {
        if (path.endsWith("/print")) {
          state.history[0] = {
            ...state.history[0],
            printCount: (state.history[0].printCount || 0) + 1,
          };
          if (state.unknownPrint) throw new TypeError("lost print");
        }
        return new Response("%PDF-1.7 test", {
          headers: { "Content-Type": "application/pdf" },
        });
      }
      if (selected)
        return json({
          release: selected,
          scope,
          canReviewOriginal: selected.status !== "DRAFT",
          canPrintCurrent: selected.status === "ISSUED",
        });
      throw new Error(`Unhandled request ${method} ${path}`);
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return { state, fetcher };
}
function view(patientId = "42", value: any = session) {
  return (
    <IntlProvider locale="en" messages={en}>
      <UserSessionDetailsContext.Provider value={value}>
        <PatientReportReleasePanel patientId={patientId} canManage />
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  );
}
async function chooseApplication() {
  await screen.findByRole("option", { name: application.accessionNumber });
  fireEvent.change(screen.getByLabelText("Application"), {
    target: { value: "51" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Report document")).not.toBeDisabled(),
  );
}
async function chooseDocument() {
  await chooseApplication();
  fireEvent.change(screen.getByLabelText("Report document"), {
    target: { value: "60" },
  });
  await screen.findByText("BG-001 · version 1");
}
async function prepareFrozen() {
  fireEvent.click(
    screen.getByRole("button", { name: "Freeze report content" }),
  );
  await screen.findByText("7.2 mmol/L");
  await waitFor(() =>
    expect(
      screen.getByLabelText(
        "I have checked this frozen report and its patient identity.",
      ),
    ).not.toBeDisabled(),
  );
}
function credentials() {
  fireEvent.click(
    screen.getByLabelText(
      "I have checked this frozen report and its patient identity.",
    ),
  );
  fireEvent.change(
    screen.getByLabelText("Current account password (this operation only)"),
    { target: { value: "secret" } },
  );
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem("CSRF", "token");
  URL.createObjectURL = vi.fn(() => "blob:report");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());
describe("formal report workflow with real transport and server fixtures", () => {
  it("creates application/group document and draft, reviews frozen contents, then issues in one transaction", async () => {
    const { fetcher } = server();
    render(view());
    await chooseApplication();
    fireEvent.change(screen.getByLabelText("Report group"), {
      target: { value: "chemistry" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare group document" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Prepare first draft" }),
    );
    await screen.findByText("BG-001 · version 1");
    await prepareFrozen();
    const issue = screen.getByRole("button", {
      name: "Sign and issue this version",
    });
    expect(issue).toBeDisabled();
    credentials();
    fireEvent.click(issue);
    await screen.findByText(/Issued by Reviewer/);
    expect(screen.queryByText("Patient One")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Current account password (this operation only)"),
    ).toHaveValue("");
    const writes = fetcher.mock.calls.filter(([, o]) => o?.method === "POST");
    expect(writes.map(([u]) => String(u))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/documents$/),
        expect.stringMatching(/\/releases$/),
        expect.stringMatching(/\/freeze$/),
        expect.stringMatching(/\/issue$/),
      ]),
    );
    const issued = writes.find(([u]) => String(u).endsWith("/issue"))!;
    expect(JSON.parse(String(issued[1]?.body))).toEqual({
      snapshotSha256: frozen.snapshotSha256,
      password: "secret",
    });
    expect(
      fetcher.mock.calls.some(([u]) => String(u).includes("esignature")),
    ).toBe(false);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem("secret")).toBeNull();
  });
  it("recovers an unknown issue by GET only and never blindly resubmits", async () => {
    const { state, fetcher } = server();
    state.docs = [doc];
    state.history = [release];
    state.unknownIssue = true;
    const ui = render(view());
    await chooseDocument();
    await prepareFrozen();
    credentials();
    fireEvent.click(
      screen.getByRole("button", { name: "Sign and issue this version" }),
    );
    await screen.findByText("An operation needs verification");
    expect(
      screen.getByRole("button", { name: "Sign and issue this version" }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Current account password (this operation only)"),
    ).toHaveValue("");
    ui.unmount();
    render(view());
    await chooseApplication();
    expect(
      screen.getByRole("button", { name: "Prepare group document" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reload and verify status" }),
    );
    await screen.findByText(
      "The recorded outcome is now visible. Check it before continuing.",
    );
    expect(
      fetcher.mock.calls.filter(([u]) => String(u).endsWith("/issue")),
    ).toHaveLength(1);
    expect(sessionStorage.length).toBe(0);
  });
  it("separates historical originals from current printing and requires void reason", async () => {
    const { state, fetcher } = server();
    state.docs = [doc];
    state.history = [
      { ...release, status: "ISSUED", pdfSha256: "b".repeat(64) },
    ];
    render(view());
    await chooseDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review stored original" }),
    );
    await screen.findByTitle("Stored original — historical review");
    expect(
      fetcher.mock.calls.find(([u]) => String(u).endsWith("/80.pdf"))?.[1]
        ?.method,
    ).toBe("GET");
    expect(
      screen.getByRole("button", { name: /Sign and void this version/ }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Void reason (required)"), {
      target: { value: "Correct patient information" },
    });
    fireEvent.change(
      screen.getByLabelText("Current account password (this operation only)"),
      { target: { value: "secret" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Sign and void this version/ }),
    );
    await screen.findByText("Voided original");
    expect(
      screen.queryByRole("button", { name: "Record current report print" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review stored original" }),
    ).toBeVisible();
  });
  it("requires an amendment reason after a prior issued version", async () => {
    const { state } = server();
    state.docs = [doc];
    state.history = [
      { ...release, status: "SUPERSEDED", pdfSha256: "b".repeat(64) },
    ];
    render(view());
    await chooseDocument();
    expect(
      screen.getByRole("button", { name: "Prepare an amendment" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Amendment reason (required)"), {
      target: { value: "Update reference range" },
    });
    expect(
      screen.getByRole("button", { name: "Prepare an amendment" }),
    ).not.toBeDisabled();
  });
  it("keeps unknown print blocked even if another recorded print appears", async () => {
    const { state, fetcher } = server();
    state.docs = [doc];
    state.history = [
      {
        ...release,
        status: "ISSUED",
        pdfSha256: "b".repeat(64),
        printCount: 0,
      },
    ];
    state.unknownPrint = true;
    render(view());
    await chooseDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Record current report print" }),
    );
    await screen.findByText("An operation needs verification");
    fireEvent.click(
      screen.getByRole("button", { name: "Reload and verify status" }),
    );
    await screen.findByText("Recorded prints: 1");
    expect(
      screen.getByRole("button", { name: "Record current report print" }),
    ).toBeDisabled();
    expect(
      fetcher.mock.calls.filter(([u]) => String(u).endsWith("/print")),
    ).toHaveLength(1);
  });
  it("clears patient contents and object URLs when switching patient", async () => {
    const { state } = server();
    state.docs = [doc];
    state.history = [release];
    const ui = render(view());
    await chooseDocument();
    await prepareFrozen();
    fireEvent.click(
      screen.getByRole("button", { name: "Open frozen preview" }),
    );
    await screen.findByTitle("PREVIEW — not issued");
    ui.rerender(view("43"));
    expect(screen.queryByText("Patient One")).not.toBeInTheDocument();
    expect(screen.queryByTitle("PREVIEW — not issued")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report");
    await screen.findByText("No applications are available to this account.");
  });
  it("blocks stale click and hides PHI after CSRF rotation", async () => {
    const { state, fetcher } = server();
    state.docs = [doc];
    state.history = [release];
    render(view());
    await chooseDocument();
    await prepareFrozen();
    credentials();
    localStorage.setItem("CSRF", "rotated");
    fireEvent.click(
      screen.getByRole("button", { name: "Sign and issue this version" }),
    );
    expect(fetcher.mock.calls.some(([u]) => String(u).endsWith("/issue"))).toBe(
      false,
    );
    fireEvent(window, new Event("storage"));
    await screen.findByText(
      "Session verification is required before accessing formal reports.",
    );
    expect(screen.queryByText("Patient One")).not.toBeInTheDocument();
  });
  it("loses reviewed content after version switching and never authorizes a stale snapshot", async () => {
    const { state } = server();
    state.docs = [doc];
    state.history = [release];
    render(view());
    await chooseDocument();
    await prepareFrozen();
    credentials();
    fireEvent.change(screen.getByLabelText("Report versions"), {
      target: { value: "80" },
    });
    await screen.findByRole("button", { name: "Read frozen content" });
    expect(screen.queryByText("Patient One")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign and issue this version" }),
    ).not.toBeInTheDocument();
  });
  it("does not load reports when the current account lacks Reports permission", async () => {
    const { fetcher } = server();
    render(
      view("42", {
        ...session,
        userSessionDetails: {
          ...session.userSessionDetails,
          roles: ["Results"],
        },
      }),
    );
    expect(
      screen.getByText(
        "Session verification is required before accessing formal reports.",
      ),
    ).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("a source-version conflict clears reviewed content and the password", async () => {
    const { state } = server();
    state.docs = [doc];
    state.history = [release];
    state.rejectIssue = true;
    render(view());
    await chooseDocument();
    await prepareFrozen();
    credentials();
    fireEvent.click(
      screen.getByRole("button", { name: "Sign and issue this version" }),
    );
    await screen.findByText(
      "The request was rejected. Reload and check permissions or changed report state.",
    );
    expect(screen.queryByText("Patient One")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Current account password (this operation only)"),
    ).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });
  it("ignores a late response from the previous patient's application request", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: any) => {
        if (String(u).includes("applications?patientId=42"))
          return new Promise<Response>((r) => {
            resolve = r;
          });
        if (String(u).includes("applications")) return json([]);
        return json(rules);
      }),
    );
    const ui = render(view());
    await waitFor(() => expect(resolve).toBeDefined());
    ui.rerender(view("43"));
    await screen.findByText("No applications are available to this account.");
    await act(async () => {
      resolve(json([application]));
      await Promise.resolve();
    });
    expect(
      screen.queryByRole("option", { name: application.accessionNumber }),
    ).not.toBeInTheDocument();
  });
  it("rejects frozen content from another patient before showing a signing control", async () => {
    const { state, fetcher } = server();
    state.docs = [doc];
    state.history = [release];
    const base = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (u, o) => {
      if (String(u).endsWith("/freeze")) {
        const bad = clone(frozen);
        bad.snapshot.scope.patientId = "43";
        return json(bad);
      }
      return base(u, o);
    });
    render(view());
    await chooseDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Freeze report content" }),
    );
    await screen.findByText(
      "The operation outcome is unknown. Do not submit it again.",
    );
    expect(screen.queryByText("Patient One")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign and issue this version" }),
    ).not.toBeInTheDocument();
  });
});
