import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import messages from "../../languages/zh.json";

const api = vi.hoisted(() => ({ recover: vi.fn(), submit: vi.fn() }));
vi.mock("./specimenRecollection", async (original) => {
  const actual = await original();
  return {
    ...actual,
    recoverRecollection: api.recover,
    submitRecollection: api.submit,
  };
});
import RecoveredSpecimenRecollection from "./RecoveredSpecimenRecollection";

const current = {
  sampleId: "701",
  labNo: "SIM-701",
  lastUpdated: "2026-09-17T01:00:00Z",
  patient: { id: "801" },
  requestedSpecimens: [
    { id: "901", status: "COLLECTED", sampleItemId: "1001" },
  ],
  physicalSpecimens: [
    {
      id: "1001",
      requestId: "901",
      sortOrder: "1",
      rejected: true,
      voided: false,
    },
  ],
  specimenDecisions: [
    {
      sampleItemId: "1001",
      state: "RECORDED",
      recordedDecision: "REJECTED",
      operationId: "11111111-2222-4333-8444-555555555555",
      evidenceDigest: "a".repeat(64),
      reason: { label: "标本凝固" },
    },
  ],
};
const receipt = {
  success: true,
  version: 1,
  replayed: false,
  operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  sampleId: "701",
  sourceSampleItemId: "1001",
  request: { id: "902", status: "REQUESTED" },
};
const mount = () => {
  const history = createMemoryHistory({ initialEntries: ["/order/enter"] });
  return {
    history,
    ...render(
      <Router history={history}>
        <IntlProvider locale="zh" messages={messages}>
          <UserSessionDetailsContext.Provider
            value={{ userSessionDetails: { userId: "7", csrf: "SIM-CSRF" } }}
          >
            <RecoveredSpecimenRecollection result={{ current }} />
          </UserSessionDetailsContext.Provider>
        </IntlProvider>
      </Router>,
    ),
  };
};

beforeEach(() => {
  api.recover.mockReset();
  api.submit.mockReset();
});

it("queries the existing relation first, creates once, then opens canonical label printing", async () => {
  api.recover.mockRejectedValueOnce({
    status: 404,
    code: "RECOLLECTION_NOT_FOUND",
  });
  api.submit.mockResolvedValue(receipt);
  const { history } = mount();
  const create = await screen.findByRole("button", { name: "创建重采申请" });
  await userEvent.setup().click(create);
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("申请 902")).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "打开标签打印" }));
  expect(history.location.pathname).toBe("/PrintBarcode");
  expect(history.location.search).toBe("?labNumber=SIM-701");
});

it("does not enable a blind retry when both create and recovery are uncertain", async () => {
  api.recover.mockRejectedValue({
    status: 404,
    code: "RECOLLECTION_NOT_FOUND",
  });
  api.submit.mockRejectedValue({ status: 500, code: "RECOLLECTION_UNKNOWN" });
  mount();
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "创建重采申请" }));
  expect(api.submit).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("重采保存结果尚未确认")).toBeVisible();
  expect(screen.queryByRole("button", { name: "创建重采申请" })).toBeNull();
});
