import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "../../../languages/en.json";
import MasterDataIdentityManagement from "./MasterDataIdentityManagement";

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: (...args: unknown[]) => getMock(...args),
  putToOpenElisServerFullResponse: (...args: unknown[]) => putMock(...args),
}));

const response = {
  items: [
    {
      entityType: "TEST",
      entityId: "11",
      name: "Glucose",
      nativeCode: "GLU",
      nativeActive: true,
      canonicalCode: null,
      sourceSystem: null,
      validFrom: null,
      validTo: null,
      lastUpdated: null,
      status: "MISSING",
      issues: ["MISSING_CODE"],
    },
  ],
  summary: {
    total: 1,
    registered: 0,
    missingCode: 1,
    inactive: 0,
    notYetValid: 0,
    expired: 0,
  },
  entityTypes: {
    TEST: "Test",
    SAMPLE_TYPE: "Sample type",
    ORGANIZATION: "Organization",
    PROVIDER: "Provider",
  },
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="en" messages={en}>
        <MasterDataIdentityManagement />
      </IntlProvider>
    </MemoryRouter>,
  );

describe("MasterDataIdentityManagement", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    getMock.mockImplementation((_path, callback) => callback(response));
  });

  test("shows coverage and missing-code status for all interface dictionaries", async () => {
    renderPage();

    expect(await screen.findByText("Glucose")).toBeInTheDocument();
    expect(screen.getByText("Code missing")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(2);
    expect(getMock).toHaveBeenCalledWith(
      "/rest/master-data-identities",
      expect.any(Function),
    );
  });

  test("creates a canonical identity from the existing local code", async () => {
    putMock.mockImplementation((_path, _payload, callback) =>
      callback(new Response("{}", { status: 200 })),
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit identity" }),
    );

    expect(screen.getByLabelText("Canonical code")).toHaveValue("GLU");
    fireEvent.change(screen.getByLabelText("Source system"), {
      target: { value: "his" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(putMock).toHaveBeenCalled();
    expect(putMock.mock.calls[0][0]).toBe(
      "/rest/master-data-identities/TEST/11",
    );
    expect(JSON.parse(putMock.mock.calls[0][1])).toMatchObject({
      canonicalCode: "GLU",
      sourceSystem: "HIS",
      expectedLastUpdated: null,
    });
  });
});
