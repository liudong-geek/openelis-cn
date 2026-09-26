import React from "react";
import { render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../languages/en.json";
import SpecimenLookupPanel from "./SpecimenLookupPanel";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("./api/specimenLookupApi", () => ({ lookupSpecimen: lookup }));

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

const renderPanel = () => {
  const onViewChange = vi.fn();
  const view = render(
    <IntlProvider locale="en" messages={messages}>
      <SpecimenLookupPanel
        active
        canReturn
        originalLabNo="A-100"
        onViewChange={onViewChange}
      />
    </IntlProvider>,
  );
  return { ...view, onViewChange };
};

describe("daily specimen lookup panel", () => {
  beforeEach(() => lookup.mockReset());

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
