import React from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => vi.unstubAllGlobals());

test.each(["missing", "wrong-order", "valid"])(
  "真实提交适配器及Provider处理%s标本回执（无业务网络）",
  async (mode) => {
    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      if (url.endsWith("/rest/SamplePatientEntry")) return json({});
      if (url.includes("/rest/order/search?"))
        return json({
          id: "701",
          labNumber: "SIM-RECEIPT-001",
          patientProperties: { patientPK: "801" },
        });
      if (url.endsWith("/rest/sample-type-requests")) {
        const sent = JSON.parse(options.body);
        return json(
          mode === "missing"
            ? {}
            : {
                ...sent,
                id: String(901 + sent.sortOrder),
                sampleId: mode === "wrong-order" ? "702" : sent.sampleId,
                status: "REQUESTED",
                sampleItemId: null,
              },
          201,
        );
      }
      throw new Error("Unexpected SIM endpoint");
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<View />);
    act(() => {
      context.setOrderData({
        patientProperties: {
          patientPK: "801",
          patientUpdateStatus: "NO_ACTION",
        },
        sampleOrderItems: { labNo: "SIM-RECEIPT-001", referringSiteId: "301" },
      });
      context.setSamples([
        { sampleTypeId: "2", tests: [{ id: "11" }] },
        { sampleTypeId: "3", tests: [{ id: "12" }] },
      ]);
    });
    let error;
    await act(async () => {
      try {
        await context.saveOrderEntry();
      } catch (caught) {
        error = caught;
      }
    });
    if (mode === "valid") {
      expect(error).toBeUndefined();
      expect(context.isSaveUnconfirmed).toBe(false);
      // Includes the Provider's initial GET of the entry form defaults.
      expect(fetchMock).toHaveBeenCalledTimes(5);
      return;
    }
    expect(error).toMatchObject({ errorKey: "order.save.readbackUnconfirmed" });
    expect(screen.getByLabelText("保存状态")).toHaveTextContent("unconfirmed");
    expect(context.unconfirmedLabNumber).toBe("SIM-RECEIPT-001");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    view.rerender(<View child={1} />);
    await act(async () => {
      await expect(context.saveOrderEntry()).rejects.toMatchObject({
        errorKey: "order.save.readbackUnconfirmed",
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  },
);
