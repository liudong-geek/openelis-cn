import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UnifiedResults from "./UnifiedResults";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";

// No transport, signature ceremony, polymorphic widget, or presence hook mocks.
const baseRow = {
  id: "0",
  analysisId: "101",
  sampleItemId: "201",
  testId: "401",
  patientId: "501",
  analysisLastupdated: "1000",
  analysisStatusId: "4",
  accessionNumber: "SIM-INTEGRATION-301",
  testName: "模拟集成检验",
  resultType: "N",
  resultValue: "",
  reportable: "Y",
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
let requests, row, enabled, save, sign, presenceStatus, notifications, metadata;
beforeEach(() => {
  requests = [];
  row = { ...baseRow };
  enabled = false;
  presenceStatus = 200;
  metadata = () => json([]);
  notifications = vi.fn();
  save = () =>
    json({
      analysisLastupdated: "2000",
      analysisStatusId: "15",
      reflex: [],
      calculated: [],
    });
  sign = () =>
    json({
      signatureId: 901,
      signerId: 701,
      recordId: 101,
      recordType: "RESULT",
      signatureMeaning: "AUTHORED",
      signedAt: "2026-09-14T00:00:00Z",
    });
  localStorage.setItem("CSRF", "SIM-CSRF");
  window.history.replaceState({}, "", "/Results");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init = {}) => {
      const path = new URL(String(url), "http://localhost").pathname;
      requests.push({ path, init });
      if (path.endsWith("/results-entry/lab-units")) return metadata();
      if (path.endsWith("/analysis-status-types")) return json([]);
      if (
        path.endsWith("/results-entry/pending") ||
        path.endsWith("/LogbookResults")
      )
        return json({ testResult: [row] });
      if (path.endsWith("/results-entry/presence"))
        return json({}, presenceStatus);
      if (path.endsWith("/esig/enabled"))
        return json(enabled === null ? {} : { enabled });
      if (path.includes("/esig/certified/"))
        return json({ username: "SIM-USER", certified: true });
      if (path.includes("/esig/session-status/"))
        return json({
          username: "SIM-USER",
          sessionActive: true,
          signingCount: 1,
        });
      if (path.endsWith("/esig/sign")) return sign();
      if (path.endsWith("/analysis/101/result")) {
        const response = await save();
        if (response.status === 200) {
          const receipt = await response.clone().json();
          if (receipt.analysisLastupdated)
            row = {
              ...JSON.parse(init.body).testResult,
              resultId: "601",
              rawResultValue: JSON.parse(init.body).testResult.resultValue,
              analysisLastupdated: receipt.analysisLastupdated,
              analysisStatusId: receipt.analysisStatusId,
            };
        }
        return response;
      }
      throw Error("Unexpected SIM endpoint");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const writes = () =>
  requests.filter((r) => r.path.endsWith("/analysis/101/result"));
const signs = () => requests.filter((r) => r.path.endsWith("/esig/sign"));
const open = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={zh}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              userId: "701",
              sessionId: "SIM-SESSION",
              csrf: "SIM-CSRF",
              loginName: "SIM-USER",
            },
          }}
        >
          <ConfigurationContext.Provider
            value={{
              configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" },
            }}
          >
            <NotificationContext.Provider
              value={{
                addNotification: notifications,
                setNotificationVisible: () => {},
                notificationVisible: false,
              }}
            >
              <UnifiedResults />
            </NotificationContext.Provider>
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
const input = async () =>
  within((await screen.findByText("模拟集成检验")).closest("tr")).getByRole(
    "spinbutton",
  );
const enter = async () =>
  fireEvent.change(await input(), { target: { value: "0" } });

test("真实工作站签名明确关闭后仅保存一次，携带固定身份凭证和值0", async () => {
  open();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  await waitFor(() =>
    expect(notifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "success" }),
    ),
  );
  expect(JSON.parse(writes()[0].init.body).testResult.resultValue).toBe("0");
  expect(writes()[0].init.headers["X-CSRF-Token"]).toBe("SIM-CSRF");
  expect(signs()).toHaveLength(0);
});

test("真实协同请求403不能自动刷新或清除正在录入的值", async () => {
  presenceStatus = 403;
  open();
  await enter();
  expect(await screen.findByText("协同编辑提示暂不可用")).toBeInTheDocument();
  expect(await input()).toHaveValue(0);
  expect(window.location.pathname).toBe("/Results");
  expect(writes()).toHaveLength(0);
  expect(requests.filter((r) => r.path.endsWith("/presence"))).toHaveLength(1);
});

test("签名开关空响应不能绕过签名保存", async () => {
  enabled = null;
  open();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText(zh["esig.error.generic"]);
  expect(writes()).toHaveLength(0);
  expect(signs()).toHaveLength(0);
});

const submitSignature = async () => {
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  const password = await screen.findByLabelText(zh["esig.label.password"]);
  fireEvent.change(password, { target: { value: "SIM-NOT-A-REAL-PASSWORD" } });
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: zh["esig.button.sign"] }),
  );
};

test("真实签名仪式返回匹配回执后才继续结果保存", async () => {
  enabled = true;
  open();
  await enter();
  await submitSignature();
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(signs()).toHaveLength(1);
});

test("签名请求403保持未知保护，取消或重新查询也不重发", async () => {
  enabled = true;
  sign = () => json({}, 403);
  open();
  await enter();
  await submitSignature();
  await screen.findByText("签名结果待核实");
  fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));
  await waitFor(() =>
    expect(
      screen.getByRole("region", { name: "本页输入核对" }),
    ).toHaveTextContent("0"),
  );
  expect(writes()).toHaveLength(0);
  expect(signs()).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
});

test("签名窗口等待期间修改结果，旧仪式不得发送签名或结果", async () => {
  enabled = true;
  open();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  const password = await screen.findByLabelText(zh["esig.label.password"]);
  fireEvent.change(await input(), { target: { value: "7" } });
  fireEvent.change(password, { target: { value: "SIM-NOT-A-REAL-PASSWORD" } });
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: zh["esig.button.sign"],
    }),
  );
  await act(async () => {});
  expect(signs()).toHaveLength(0);
  expect(writes()).toHaveLength(0);
  expect(await input()).toHaveValue(7);
});

test("签名POST在途遇到目录撤权，取消签名不能重新放回患者输入", async () => {
  enabled = true;
  let deny, finish;
  metadata = () =>
    new Promise((resolve) => {
      deny = resolve;
    });
  sign = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  open();
  await enter();
  await submitSignature();
  await waitFor(() => expect(signs()).toHaveLength(1));
  await act(async () => {
    deny(json({}, 403));
  });
  await screen.findByText(zh["security.accessDenied"]);
  expect(screen.queryByRole("region", { name: "本页输入核对" })).toBeNull();
  expect(screen.queryByText("模拟集成检验")).toBeNull();
  await act(async () => {
    finish(
      json({
        signatureId: 901,
        signerId: 701,
        recordId: 101,
        recordType: "RESULT",
        signatureMeaning: "AUTHORED",
      }),
    );
  });
  expect(writes()).toHaveLength(0);
  expect(screen.queryByRole("region", { name: "本页输入核对" })).toBeNull();
});
