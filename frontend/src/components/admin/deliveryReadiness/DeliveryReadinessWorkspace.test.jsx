import { describe, expect, test } from "vitest";
import { validateDeliveryConfig } from "./DeliveryReadinessWorkspace";

const valid = {
  his: { endpoint: "https://his.example.org/fhir", timeout: 15 },
  analyzer: { address: "127.0.0.1", port: 5000 },
  print: { reportPaper: "A4", labelSize: "50x30" },
  policy: {
    criticalAckMinutes: 10,
    routineTatMinutes: 480,
    emergencyTatMinutes: 60,
  },
};

describe("delivery readiness validation", () => {
  test("accepts structurally complete staging profiles", () => {
    expect(validateDeliveryConfig(valid)).toEqual({
      his: true,
      analyzer: true,
      print: true,
      policy: true,
    });
  });

  test("rejects unsafe endpoints and invalid analyzer ports", () => {
    expect(
      validateDeliveryConfig({
        ...valid,
        his: { endpoint: "his.local", timeout: 0 },
        analyzer: { address: "", port: 70000 },
      }),
    ).toMatchObject({ his: false, analyzer: false });
  });
});
