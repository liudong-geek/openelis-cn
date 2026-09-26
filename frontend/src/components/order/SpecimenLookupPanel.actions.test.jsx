import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../languages/zh.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import SpecimenLookupPanel from "./SpecimenLookupPanel";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  clock: vi.fn(),
  receipt: vi.fn(),
  decision: vi.fn(),
}));
vi.mock("./api/specimenLookupApi", () => ({ lookupSpecimen: mocks.lookup }));
vi.mock("./api/serverClockApi", () => ({
  getVerifiedServerClock: mocks.clock,
}));
vi.mock("./receiptTransport", () => ({ postSpecimenReceipt: mocks.receipt }));
vi.mock("./intakeTransport", () => ({ postIntakeDecision: mocks.decision }));

const collected = {
  version: 1,
  source: "specimen_lookup",
  readOnly: true,
  matchedKind: "specimen",
  selection: { sampleId: "30", sampleItemId: "22", requestId: "12" },
  current: {
    sampleId: "30",
    labNo: "DEV30",
    patientMasked: false,
    patient: {
      id: "9",
      firstName: "Mei",
      lastName: "Li",
      birthDate: "1990-01-01",
    },
    requestedSpecimens: [
      {
        id: "12",
        sampleItemId: "22",
        typeOfSampleId: "7",
        sampleTypeName: "Whole blood",
        status: "COLLECTED",
      },
    ],
    physicalSpecimens: [
      {
        id: "22",
        requestId: "12",
        sortOrder: "1",
        typeOfSampleId: "7",
        statusId: "5",
        voided: false,
        rejected: false,
        collectionDate: "2026-09-26T05:00:00Z",
        receivedDate: null,
        decisionState: "NOT_RECORDED",
        recordedDecision: null,
        expectedEvidenceDigest: null,
        operationId: null,
      },
    ],
  },
};
const tube = (result, changes) => ({
  ...result,
  current: {
    ...result.current,
    physicalSpecimens: [{ ...result.current.physicalSpecimens[0], ...changes }],
  },
});
const received = tube(collected, {
  receivedDate: "2026-09-26T05:03:00Z",
  expectedEvidenceDigest: "a".repeat(64),
});

const renderPanel = (props = {}) =>
  render(
    <UserSessionDetailsContext.Provider
      value={{
        userSessionDetails: {
          authenticated: true,
          userId: "9",
          csrf: "CSRF",
          sessionId: "SESSION",
        },
        sessionPhase: "authenticated",
        getSessionIdentity: () => "SESSION-9",
        getSessionCheckGeneration: () => 1,
        isSessionWriteAllowed: () => true,
      }}
    >
      <IntlProvider locale="zh" messages={messages}>
        <SpecimenLookupPanel active {...props} />
      </IntlProvider>
    </UserSessionDetailsContext.Provider>,
  );

const scan = async (user) => {
  await user.type(screen.getByRole("searchbox"), "DEV30.1");
  await user.click(screen.getByRole("button", { name: "查询当前状态" }));
  expect(await screen.findByText("LiMei")).toBeInTheDocument();
};

describe("scanned physical tube actions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.clock.mockResolvedValue({
      date: "2026-09-26",
      time: "13:03",
      timezone: "Asia/Shanghai",
      instant: "2026-09-26T05:03:00Z",
    });
  });

  it("requires explicit identity confirmation, uses server instant, and reads back receipt", async () => {
    mocks.lookup
      .mockResolvedValueOnce(collected)
      .mockResolvedValueOnce(collected)
      .mockResolvedValueOnce(received);
    mocks.receipt.mockImplementation(async (body) => {
      const command = JSON.parse(body);
      return {
        success: true,
        ...command,
        tubes: command.tubes.map((row) => ({ ...row, replayed: false })),
      };
    });
    const user = userEvent.setup();
    renderPanel();
    await scan(user);
    const submit = screen.getByRole("button", { name: "确认此管签收" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByText("我已核对患者、申请与实管条码"));
    await user.click(submit);
    expect(
      await screen.findByText(/实管 DEV30\.1 的签收已回查/),
    ).toBeInTheDocument();
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
    expect(mocks.receipt).toHaveBeenCalledTimes(1);
    const command = JSON.parse(mocks.receipt.mock.calls[0][0]);
    expect(command.tubes).toEqual([
      {
        requestId: "12",
        sampleItemId: "22",
        collectionDate: "2026-09-26T05:00:00Z",
        receivedDate: "2026-09-26T05:03:00Z",
      },
    ]);
    expect(screen.getByRole("button", { name: "确认此管验收" })).toBeDisabled();
  });

  it("rechecks the exact tube and operation ID before showing a successful acceptance", async () => {
    const operationId = "12345678-1234-1234-1234-123456789abc";
    const originalRandomUUID = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: () => operationId,
    });
    try {
      mocks.lookup
        .mockResolvedValueOnce(received)
        .mockResolvedValueOnce(received)
        .mockResolvedValueOnce(
          tube(received, {
            decisionState: "RECORDED",
            recordedDecision: "ACCEPTED",
            operationId,
            expectedEvidenceDigest: null,
          }),
        );
      mocks.decision.mockImplementation(async (body) => {
        const command = JSON.parse(body);
        return {
          success: true,
          replayed: false,
          ...command,
          recordedDecision: "ACCEPTED",
          decidedBy: "9",
          decidedAt: "2026-09-26T05:04:00Z",
          currentAcceptanceVerified: false,
        };
      });
      const user = userEvent.setup();
      const onOpenResults = vi.fn();
      renderPanel({ onOpenResults });
      await scan(user);
      await user.click(screen.getByText("我已核对患者、申请与实管条码"));
      await user.click(screen.getByRole("button", { name: "确认此管验收" }));
      expect(
        await screen.findByText(/实管 DEV30\.1 的验收已回查/),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "结果录入" }));
      expect(onOpenResults).toHaveBeenCalledWith("DEV30");
      expect(mocks.decision).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mocks.decision.mock.calls[0][0])).toMatchObject({
        operationId,
        expectedEvidenceDigest: "a".repeat(64),
        decision: "ACCEPTED",
        reason: null,
      });
      expect(
        screen.queryByRole("button", { name: "确认此管验收" }),
      ).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        configurable: true,
        value: originalRandomUUID,
      });
    }
  });

  it("requeries an uncertain receipt and does not send it again", async () => {
    mocks.lookup.mockResolvedValue(collected);
    mocks.receipt.mockRejectedValue(new Error("network lost"));
    const user = userEvent.setup();
    renderPanel();
    await scan(user);
    await user.click(screen.getByText("我已核对患者、申请与实管条码"));
    await user.click(screen.getByRole("button", { name: "确认此管签收" }));
    expect(await screen.findByText(/写入结果尚未核实/)).toBeInTheDocument();
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
    expect(mocks.receipt).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "确认此管签收" }),
    ).not.toBeInTheDocument();
  });

  it("clears identity confirmation and hides writes when another tube row is selected", async () => {
    const twoTubes = {
      ...collected,
      current: {
        ...collected.current,
        requestedSpecimens: [
          ...collected.current.requestedSpecimens,
          {
            id: "13",
            sampleItemId: "23",
            typeOfSampleId: "7",
            sampleTypeName: "Whole blood",
            status: "COLLECTED",
          },
        ],
        physicalSpecimens: [
          ...collected.current.physicalSpecimens,
          {
            ...collected.current.physicalSpecimens[0],
            id: "23",
            requestId: "13",
            sortOrder: "2",
          },
        ],
      },
    };
    mocks.lookup.mockResolvedValueOnce(twoTubes);
    const user = userEvent.setup();
    renderPanel();
    await scan(user);
    await user.click(screen.getByText("我已核对患者、申请与实管条码"));
    expect(screen.getByRole("button", { name: "确认此管签收" })).toBeEnabled();
    await user.click(
      within(screen.getByRole("row", { name: /DEV30\.2/ })).getByRole(
        "button",
        { name: "选择" },
      ),
    );
    expect(
      screen.queryByRole("button", { name: "确认此管签收" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/请扫描该管条码并重新核对身份/),
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("row", { name: /DEV30\.1/ })).getByRole(
        "button",
        { name: "选择" },
      ),
    );
    expect(screen.getByRole("button", { name: "确认此管签收" })).toBeDisabled();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
});
