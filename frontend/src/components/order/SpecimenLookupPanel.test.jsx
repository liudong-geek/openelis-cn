import React from "react";
import { render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import SpecimenLookupPanel from "./SpecimenLookupPanel";

const lookup = vi.hoisted(() => vi.fn());
const postDecision = vi.hoisted(() => vi.fn());
vi.mock("./api/specimenLookupApi", () => ({ lookupSpecimen: lookup }));
vi.mock("./intakeTransport", () => ({ postIntakeDecision: postDecision }));
vi.mock("./RecoveredSpecimenRecollection", () => ({
  default: ({ result }) => (
    <div data-testid="linked-recollection">
      {result.current.specimenDecisions[0].sampleItemId}
    </div>
  ),
}));

const current = {
  sampleId: "30",
  labNo: "A-300",
  patient: { firstName: "Mei", lastName: "Li", birthDate: "1990-01-01" },
  requestedSpecimens: [
    {
      id: "11",
      sampleItemId: "21",
      typeOfSampleId: "7",
      sampleTypeName: "Serum",
      status: "COLLECTED",
    },
    {
      id: "12",
      sampleItemId: "22",
      typeOfSampleId: "7",
      sampleTypeName: "Serum",
      status: "COLLECTED",
    },
  ],
  physicalSpecimens: [
    {
      id: "21",
      requestId: "11",
      sortOrder: "1",
      receivedDate: "2026-09-26T08:00:00Z",
      decisionState: "RECORDED",
      recordedDecision: "ACCEPTED",
    },
    {
      id: "22",
      requestId: "12",
      sortOrder: "2",
      receivedDate: null,
      decisionState: "NOT_RECORDED",
      recordedDecision: null,
    },
  ],
};

const response = {
  version: 1,
  source: "specimen_lookup",
  readOnly: true,
  matchedKind: "specimen",
  selection: { sampleId: "30", requestId: "12", sampleItemId: "22" },
  current,
};

const renderPanel = (session = null) => {
  const onViewChange = vi.fn();
  const view = render(
    <IntlProvider locale="en" messages={messages}>
      <UserSessionDetailsContext.Provider value={session}>
        <SpecimenLookupPanel
          active
          canReturn
          originalLabNo="A-100"
          onViewChange={onViewChange}
        />
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );
  return { ...view, onViewChange };
};

describe("daily specimen lookup panel", () => {
  beforeEach(() => {
    lookup.mockReset();
    postDecision.mockReset();
  });

  test("scanned received tube can reject with a current reason and then exposes only that tube's linked recollection", async () => {
    const reason = {
      namespace: "DICTIONARY:resultRejectionReasons",
      id: "41",
      version: "2026-09-26T01:00:00Z",
      label: "Container unsuitable",
    };
    const digest = "a".repeat(64);
    const ready = {
      ...response,
      current: {
        ...current,
        patientMasked: false,
        patient: { ...current.patient, id: "9" },
        intakeReasons: { schema: 1, state: "READY", items: [reason] },
        physicalSpecimens: [
          current.physicalSpecimens[0],
          {
            ...current.physicalSpecimens[1],
            typeOfSampleId: "7",
            rejected: false,
            voided: false,
            collectionDate: "2026-09-26T05:00:00Z",
            receivedDate: "2026-09-26T05:03:00Z",
            expectedEvidenceDigest: digest,
            operationId: null,
          },
        ],
      },
    };
    let posted;
    lookup.mockImplementation(async () =>
      posted
        ? {
            ...ready,
            current: {
              ...ready.current,
              physicalSpecimens: [
                ready.current.physicalSpecimens[0],
                {
                  ...ready.current.physicalSpecimens[1],
                  rejected: true,
                  decisionState: "RECORDED",
                  recordedDecision: "REJECTED",
                  expectedEvidenceDigest: null,
                  operationId: posted.operationId,
                  recordedReason: reason,
                  recordedEvidenceDigest: digest,
                },
              ],
            },
          }
        : ready,
    );
    postDecision.mockImplementation(async (body) => {
      posted = JSON.parse(body);
      return {
        success: true,
        replayed: false,
        currentAcceptanceVerified: false,
        ...Object.fromEntries(
          [
            "sampleId",
            "labNo",
            "patientId",
            "requestId",
            "sampleItemId",
            "operationId",
          ].map((key) => [key, posted[key]]),
        ),
        recordedDecision: posted.decision,
        reason: posted.reason,
        decidedBy: "7",
        decidedAt: "2026-09-26T05:04:00Z",
      };
    });
    const session = {
      userSessionDetails: {
        authenticated: true,
        csrf: "SIM-CSRF",
        userId: "7",
      },
      getSessionIdentity: () => "SIM-SESSION",
      getSessionCheckGeneration: () => 1,
      isSessionWriteAllowed: () => true,
      sessionPhase: "authenticated",
    };
    const user = userEvent.setup();
    renderPanel(session);
    await user.type(screen.getByRole("searchbox"), "A-300.2");
    await user.click(
      screen.getByRole("button", { name: "Check current status" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Intake decision"),
      "REJECTED",
    );
    await user.selectOptions(screen.getByLabelText("Rejection reason"), "41");
    await user.click(
      screen.getByText("I have checked the patient, order, and tube barcode"),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm rejection of this tube" }),
    );
    await waitFor(() => expect(postDecision).toHaveBeenCalledTimes(1));
    expect(posted).toMatchObject({
      sampleItemId: "22",
      decision: "REJECTED",
      reason,
      expectedEvidenceDigest: digest,
    });
    expect(await screen.findByTestId("linked-recollection")).toHaveTextContent(
      "22",
    );
    expect(
      screen.getByText(/Rejection of tube A-300.2 was verified/),
    ).toBeVisible();
  });

  test("finds the real selected tube and shows distinct next tasks without writing", async () => {
    lookup.mockResolvedValue(response);
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByRole("searchbox"), "A-300.2");
    await user.click(
      screen.getByRole("button", { name: "Check current status" }),
    );

    expect(lookup).toHaveBeenCalledWith("A-300.2", {
      signal: expect.any(AbortSignal),
    });
    expect(await screen.findByText("LiMei")).toBeInTheDocument();
    const first = screen.getByText("A-300.1").closest("tr");
    const second = screen.getByText("A-300.2").closest("tr");
    expect(
      within(first).getByText("Earlier accept decision recorded"),
    ).toBeInTheDocument();
    expect(within(second).getByText("Collected")).toBeInTheDocument();
    expect(
      within(second).getByRole("button", { name: "Selected" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Selected A-300\.2: Confirm physical receipt/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Return to original order A-100 form",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Returning to it will not select the scanned order/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Confirm physical receipt/ }),
    ).not.toBeInTheDocument();
  });

  test.each(["rejected", "voided"])(
    "current %s overrides an earlier accept decision",
    async (flag) => {
      lookup.mockResolvedValue({
        ...response,
        current: {
          ...current,
          physicalSpecimens: current.physicalSpecimens.map((item) =>
            item.id === "21" ? { ...item, [flag]: true } : item,
          ),
        },
      });
      const user = userEvent.setup();
      renderPanel();
      await user.type(screen.getByRole("searchbox"), "A-300.1");
      await user.click(
        screen.getByRole("button", { name: "Check current status" }),
      );

      const first = (await screen.findByText("A-300.1")).closest("tr");
      expect(within(first).getByText("Review required")).toBeInTheDocument();
      expect(
        within(first).queryByText("Earlier accept decision recorded"),
      ).not.toBeInTheDocument();
    },
  );

  test("clears the former patient when the next code is unknown", async () => {
    lookup
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce({ kind: "notFound" });
    const user = userEvent.setup();
    renderPanel();
    const input = screen.getByRole("searchbox");
    await user.type(input, "A-300.2");
    await user.click(
      screen.getByRole("button", { name: "Check current status" }),
    );
    expect(await screen.findByText("LiMei")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "missing");
    await user.click(
      screen.getByRole("button", { name: "Check current status" }),
    );

    expect(
      await screen.findByText(/does not match a current order/),
    ).toBeInTheDocument();
    expect(screen.queryByText("LiMei")).not.toBeInTheDocument();
    expect(
      screen.getByText("No current record was opened for missing."),
    ).toBeInTheDocument();
  });

  test("does not present a masked patient as an unregistered patient", async () => {
    lookup.mockResolvedValue({
      ...response,
      current: { ...current, patientMasked: true },
    });
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByRole("searchbox"), "A-300.2");
    await user.click(
      screen.getByRole("button", { name: "Check current status" }),
    );

    expect(
      await screen.findByText(
        "Your current permissions do not show patient details",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Patient name not recorded"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("LiMei")).not.toBeInTheDocument();
    expect(screen.queryByText("1990-01-01")).not.toBeInTheDocument();
  });

  test("ignores a late response after the operator types another code", async () => {
    let resolveOld;
    lookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const user = userEvent.setup();
    renderPanel();
    const input = screen.getByRole("searchbox");
    await user.type(input, "A-300.2");
    await user.click(
      screen.getByRole("button", { name: "Check current status" }),
    );
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    await user.clear(input);
    await user.type(input, "different");
    resolveOld(response);
    await waitFor(() =>
      expect(screen.queryByText("LiMei")).not.toBeInTheDocument(),
    );
  });
});
