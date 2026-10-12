import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";

const { request, sampleDraft } = vi.hoisted(() => ({
  request: vi.fn(),
  sampleDraft: { samples: [] },
}));

vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFormData: vi.fn(),
  postToOpenElisServerJsonResponse: request,
  resolveApiErrorMessage: vi.fn(),
}));
vi.mock("../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: vi.fn(),
    addNotification: vi.fn(),
  }),
  ConfigurationContext: React.createContext({
    configurationProperties: { ACCEPT_EXTERNAL_ORDERS: "false" },
  }),
}));
vi.mock("../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { success: "success", error: "error" },
}));
vi.mock("../formModel/validationSchema/OrderEntryValidationSchema", () => ({
  createOrderEntryValidationSchema: () => ({
    validate: () => Promise.resolve(),
  }),
}));

// Keep the real Index navigation, sample attachment and submission; the sample
// editor supplies the same per-test referral draft shape as OrderReferralRequest.
vi.mock("./AddSample", () => ({
  default: ({ setSamples }) => (
    <button onClick={() => setSamples(sampleDraft.samples)}>
      Set sample draft
    </button>
  ),
}));
vi.mock("./PatientInfo", () => ({ default: () => null }));
vi.mock("./AddOrder", () => ({ default: () => null }));
vi.mock("./OrderEntryAdditionalQuestions", () => ({ default: () => null }));
vi.mock("./OrderSuccessMessage", () => ({ default: () => null }));
vi.mock("../eqa/EQASampleEntry", () => ({ default: () => null }));
vi.mock("../eqa/EQAOrderForm", () => ({ default: () => null }));
vi.mock("../common/PageBreadCrumb", () => ({ default: () => null }));

import Index from "./Index";

const referrals = () => [
  {
    testId: "1",
    institute: "601",
    sentDate: "",
    reasonForReferral: "901",
    referrer: "张医生",
  },
  {
    testId: "2",
    institute: "602",
    sentDate: "2026/10/13",
    reasonForReferral: "902",
    referrer: "李医生",
  },
];

const sample = (overrides = {}) => ({
  sampleTypeId: "10",
  sampleXML: {
    collectionDate: "2026/10/13",
    collectionTime: "08:30",
    collector: "王护士",
    quantity: "1",
    uom: "1",
    rejected: false,
    rejectionReason: "",
  },
  tests: [{ id: "1" }, { id: "2" }],
  panels: [],
  requestReferralEnabled: true,
  referralItems: referrals(),
  ...overrides,
});

const next = () =>
  fireEvent.click(
    screen.getByRole("button", { name: messages["next.action.button"] }),
  );

const renderSampleStep = () => {
  render(
    <IntlProvider locale="en" messages={messages}>
      <Index />
    </IntlProvider>,
  );
  next();
  next();
  fireEvent.click(screen.getByRole("button", { name: "Set sample draft" }));
};

const submit = async () => {
  const button = screen.getByRole("button", {
    name: messages["label.button.submit"],
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toBe("/rest/SamplePatientEntry");
  return JSON.parse(request.mock.calls[0][1]);
};

describe("order entry referral submission", () => {
  beforeEach(() => {
    request.mockReset();
    window.history.replaceState({}, "", "/SamplePatientEntry");
    sampleDraft.samples = [sample()];
  });

  it("submits one referral per test with its own institute, reason, referrer and optional date", async () => {
    renderSampleStep();
    next();

    const payload = await submit();
    expect(payload.useReferral).toBe(true);
    expect(payload.referralItems).toEqual([
      {
        referredTestId: "1",
        referredInstituteId: "601",
        referredSendDate: "",
        referralReasonId: "901",
        referrer: "张医生",
      },
      {
        referredTestId: "2",
        referredInstituteId: "602",
        referredSendDate: "2026/10/13",
        referralReasonId: "902",
        referrer: "李医生",
      },
    ]);
  });

  it("does not refer other selected tests when only one has a referral request", async () => {
    sampleDraft.samples = [sample({ referralItems: [referrals()[1]] })];
    renderSampleStep();
    next();

    const payload = await submit();
    expect(payload.referralItems).toHaveLength(1);
    expect(payload.referralItems[0].referredTestId).toBe("2");
    expect(payload.sampleXML).toContain("tests='1,2'");
  });

  it("drops a removed test's stale referral after returning to the sample editor", async () => {
    renderSampleStep();
    next();
    fireEvent.click(
      screen.getByRole("button", { name: messages["back.action.button"] }),
    );
    sampleDraft.samples = [sample({ tests: [{ id: "2" }] })];
    fireEvent.click(screen.getByRole("button", { name: "Set sample draft" }));
    next();

    const payload = await submit();
    expect(payload.referralItems).toHaveLength(1);
    expect(payload.referralItems[0]).toMatchObject({
      referredTestId: "2",
      referredInstituteId: "602",
      referralReasonId: "902",
    });
  });

  it.each([
    ["referral switched off", { requestReferralEnabled: false }],
    ["all tests removed", { tests: [] }],
    ["ordinary order", { requestReferralEnabled: false, referralItems: [] }],
  ])("submits no residual referrals for %s", async (_, overrides) => {
    renderSampleStep();
    next();
    fireEvent.click(
      screen.getByRole("button", { name: messages["back.action.button"] }),
    );
    sampleDraft.samples = [sample(overrides)];
    fireEvent.click(screen.getByRole("button", { name: "Set sample draft" }));
    next();

    const payload = await submit();
    expect(payload.useReferral).toBe(false);
    expect(payload.referralItems).toEqual([]);
  });
});
