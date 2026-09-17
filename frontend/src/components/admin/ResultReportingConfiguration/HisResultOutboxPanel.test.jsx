vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerJsonResponse: vi.fn(),
  putToOpenElisServerFullResponse: vi.fn(),
}));

import React from "react";
import { waitFor } from "@testing-library/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../../languages/en.json";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
  putToOpenElisServerFullResponse,
} from "../../utils/Utils";
import HisResultOutboxPanel from "./HisResultOutboxPanel";

const records = [
  {
    id: 1,
    businessId: "REPORT-001",
    eventType: "REPORT",
    status: "FAILED",
    attemptCount: 1,
    maxAttempts: 3,
    lastError: "endpoint unavailable",
    payloadHash: "1234567890abcdef",
  },
  {
    id: 2,
    businessId: "REPORT-002",
    eventType: "REPORT",
    status: "ACKNOWLEDGED",
    attemptCount: 1,
    maxAttempts: 3,
    responseCode: "AA",
    payloadHash: "abcdef1234567890",
  },
];

const renderPanel = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <HisResultOutboxPanel />
    </IntlProvider>,
  );

describe("HisResultOutboxPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback(records),
    );
  });

  test("shows delivery ledger, retry state, receipt state and payload digest", async () => {
    renderPanel();

    expect(await screen.findByText("REPORT-001")).toBeVisible();
    expect(screen.getByText("REPORT-002")).toBeVisible();
    expect(screen.getByText("endpoint unavailable")).toBeVisible();
    expect(screen.getByText("1234567890ab")).toBeVisible();
    expect(screen.getAllByText("Acknowledged").length).toBeGreaterThan(1);
  });

  test("creates an acknowledged synthetic report without a real HIS connection", async () => {
    postToOpenElisServerJsonResponse.mockImplementation(
      (_url, body, callback) => {
        expect(JSON.parse(body).outcome).toBe("ACKNOWLEDGED");
        callback({ id: 9, status: "ACKNOWLEDGED" });
      },
    );
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Simulate accepted receipt" }),
    );

    await waitFor(() =>
      expect(postToOpenElisServerJsonResponse).toHaveBeenCalledTimes(1),
    );
    expect(getFromOpenElisServer.mock.calls.length).toBeGreaterThan(1);
  });

  test("requeues failed delivery and requires a close reason", async () => {
    putToOpenElisServerFullResponse.mockImplementation(
      (_url, _body, callback) =>
        callback({ ok: true, json: async () => records[0], status: 200 }),
    );
    renderPanel();

    const retryButtons = await screen.findAllByRole("button", {
      name: "Retry",
    });
    fireEvent.click(retryButtons[0]);
    await waitFor(() =>
      expect(putToOpenElisServerFullResponse).toHaveBeenCalledWith(
        "/rest/his-result-outbox/1/retry",
        null,
        expect.any(Function),
      ),
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Close" })[0]).toBeEnabled(),
    );
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[0]);
    const confirm = screen.getByRole("button", { name: "Confirm close" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Close reason"), {
      target: { value: "HIS order cancelled" },
    });
    expect(confirm).toBeEnabled();
  });
});
