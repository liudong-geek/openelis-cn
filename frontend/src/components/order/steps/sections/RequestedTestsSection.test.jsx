import React from "react";
import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import RequestedTestsSection from "./RequestedTestsSection";
import messages from "../../../../languages/en.json";

vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
}));

import { getFromOpenElisServer } from "../../../utils/Utils";

const renderSection = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <RequestedTestsSection
        samples={[
          {
            sampleTypeId: "21",
            tests: [{ id: "11", name: "Glucose" }],
            panels: [],
          },
        ]}
        setSamples={vi.fn()}
        assignTestToSample={vi.fn()}
        removeTestFromSample={vi.fn()}
        sampleTypes={[
          { id: "21", value: "Serum" },
          { id: "22", value: "Plasma" },
        ]}
        isReadOnly={false}
      />
    </IntlProvider>,
  );

describe("RequestedTestsSection tube compatibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not offer arbitrary sample types when the test has no configured mapping", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({
        tests: [{ testId: "11", compatibleSampleTypes: [] }],
      }),
    );

    renderSection();

    expect(
      await screen.findByText("No compatible sample type configured"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tube configuration is incomplete"),
    ).toBeInTheDocument();
    expect(screen.queryByText("+ Serum")).not.toBeInTheDocument();
    expect(screen.queryByText("+ Plasma")).not.toBeInTheDocument();
  });

  it("offers only sample types returned by the configured compatibility API", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({
        tests: [
          {
            testId: "11",
            compatibleSampleTypes: [{ id: "21", name: "Serum" }],
          },
        ],
      }),
    );

    renderSection();

    await waitFor(() =>
      expect(screen.getByText("+ Serum")).toBeInTheDocument(),
    );
    expect(screen.queryByText("+ Plasma")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Tube configuration is incomplete"),
    ).not.toBeInTheDocument();
  });
});
