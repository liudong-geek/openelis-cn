import React from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { webcrypto } from "node:crypto";
import { createEntrySubmissionSim } from "./testUtils/entrySubmissionSim";
vi.mock("../layout/Layout", () => ({
  ConfigurationContext: React.createContext({}),
}));
import { OrderProvider, useOrderContext } from "./OrderContext";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";

let context;
function Probe() {
  context = useOrderContext();
  return <output aria-label="保存状态">{context.saveStatus}</output>;
}
function View({ child = 0 }) {
  return (
    <MemoryRouter initialEntries={["/order/enter"]}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            authenticated: true,
            userId: "91",
            sessionId: "SIM-SESSION",
            csrf: "SIM-CSRF",
          },
        }}
      >
        <OrderProvider>
          <Probe key={child} />
        </OrderProvider>
      </UserSessionDetailsContext.Provider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

test.each(["missing", "wrong-order", "valid"])(
  "真实提交适配器及Provider处理%s整单回执，并通过独立GET核对（无业务网络）",
  async (mode) => {
    const sim = createEntrySubmissionSim({
      damageResponse: (response) => {
        if (mode === "missing") return {};
        if (mode === "wrong-order")
          response.receipt.requestedSpecimens[1].sampleId = "702";
        return response;
      },
    });
    vi.stubGlobal("fetch", sim.fetch);
    const view = render(<View />);
    await act(async () => {});
    act(() => {
      context.setOrderData((previous) => ({
        ...previous,
        patientProperties: {
          patientPK: "801",
          patientUpdateStatus: "NO_ACTION",
        },
        sampleOrderItems: {
          ...previous.sampleOrderItems,
          labNo: "SIM-RECEIPT-001",
          referringSiteId: "301",
        },
      }));
      context.setSamples([
        { sampleTypeId: "2", tests: [{ id: "11" }] },
        { sampleTypeId: "3", tests: [{ id: "12" }] },
      ]);
    });
    let result, error;
    await act(async () => {
      try {
        result = await context.saveOrderEntry();
      } catch (caught) {
        error = caught;
      }
    });
    expect(sim.writes).toHaveLength(1);
    const write = sim.writes[0];
    expect(JSON.parse(write.options.body)).toMatchObject({
      orderEntryOnly: true,
      sampleXML: "",
      sampleOrderItems: { labNo: "SIM-RECEIPT-001", modified: false },
      requestedSpecimens: [
        { typeOfSampleId: "2", sortOrder: 0, requestedTests: "11" },
        { typeOfSampleId: "3", sortOrder: 1, requestedTests: "12" },
      ],
    });
    expect(write.submissionId).toMatch(/^[a-f0-9-]{36}$/);
    if (mode === "valid") {
      expect(error).toBeUndefined();
      expect(result).toEqual({ success: true, sampleId: "701" });
      expect(context.orderId).toBe("701");
      expect(context.isSaveUnconfirmed).toBe(false);
      expect(sessionStorage.getItem("lis.entry.pending.v1")).toBeNull();
      // Continuing an unchanged confirmed draft must not duplicate its tubes.
      await act(async () => {
        expect(await context.saveOrderEntry()).toEqual(result);
      });
    } else {
      expect(error).toMatchObject({
        errorKey: "order.save.readbackUnconfirmed",
      });
      expect(screen.getByLabelText("保存状态")).toHaveTextContent(
        "unconfirmed",
      );
      expect(context.orderId).toBeNull();
      expect(context.unconfirmedLabNumber).toBe("SIM-RECEIPT-001");
      expect(context.unconfirmedSubmissionId).toBe(write.submissionId);
      expect(
        JSON.parse(sessionStorage.getItem("lis.entry.pending.v1")),
      ).toEqual({
        version: 1,
        submissionId: write.submissionId,
        requestHash: sim.receipts.get(write.submissionId).receipt.requestHash,
      });
      view.rerender(<View child={1} />);
      await act(async () => {
        await expect(context.saveOrderEntry()).rejects.toMatchObject({
          errorKey: "order.save.readbackUnconfirmed",
        });
      });
    }
    const before = JSON.stringify({
      orderData: context.orderData,
      samples: context.samples,
      orderId: context.orderId,
    });
    let recovered;
    await act(async () => {
      recovered = await context.queryEntryRecovery(write.submissionId);
    });
    expect(recovered.sampleId).toBe("701");
    expect(recovered.requestedSpecimens.map((tube) => tube.id)).toEqual([
      "901",
      "902",
    ]);
    expect(
      JSON.stringify({
        orderData: context.orderData,
        samples: context.samples,
        orderId: context.orderId,
      }),
    ).toBe(before);
    expect(sim.reads.at(-1)).toMatchObject({
      path: expect.stringContaining(`/submissions/${write.submissionId}`),
      options: { method: "GET", cache: "no-store", redirect: "manual" },
    });
    if (mode !== "valid") {
      expect(context.isSaveUnconfirmed).toBe(true);
      expect(context.orderId).toBeNull();
      expect(sessionStorage.getItem("lis.entry.pending.v1")).toContain(
        write.submissionId,
      );
    }
    expect(sim.writes).toHaveLength(1);
    expect(sim.unexpected).toEqual([]);
  },
);
