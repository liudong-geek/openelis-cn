import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";

vi.mock("../../utils/Utils", async (importOriginal) => ({
  ...(await importOriginal()),
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServer: vi.fn(() => {
    throw new Error("This read-only SIM test must never write patient data");
  }),
}));

vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({}),
    NotificationContext: createContext({}),
  };
});

import SystemAuditEvents from "./SystemAuditEvents";
import { getFromOpenElisServer, postToOpenElisServer } from "../../utils/Utils";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import config from "../../../config.json";
import zhMessages from "../../../languages/zh.json";

// Real Carbon controls and real SearchPatientForm, with only service responses
// simulated. This proves component interaction/URL contracts, not backend or E2E.
const patient = (id = "301") => ({
  patientID: id,
  patientPK: id,
  firstName: "SIM患者",
  lastName: id === "301" ? "甲" : "乙",
  subjectNumber: `SIM-P-${id}`,
  nationalId: `SIM-P-${id}`,
  gender: "F",
  dataSourceName: "OpenElis",
});

const auditEvents = (id) => [
  {
    timestamp: "2026-09-10T03:00:00Z",
    entityType: "PATIENT",
    entityId: id,
    action: "U",
    user: "SIM审核员",
    changes: { gender: { old: "SIM旧性别", new: `SIM患者属性-${id}` } },
  },
  {
    timestamp: "2026-09-10T03:00:01Z",
    entityType: "PERSON",
    entityId: id === "301" ? "401" : "402",
    action: "U",
    user: "SIM审核员",
    changes: { firstName: { old: "SIM旧姓名", new: `SIM姓名变更-${id}` } },
  },
];

const listRequests = () =>
  getFromOpenElisServer.mock.calls.filter(([url]) =>
    url.startsWith("/rest/systemAuditEvents?"),
  );

const paramsFor = (url) => new URL(url, "http://sim.invalid").searchParams;

const renderPage = () =>
  render(
    <ConfigurationContext.Provider
      value={{
        configurationProperties: {
          DEFAULT_DATE_LOCALE: "zh-CN",
          FIRST_NAME_REGEX: ".*",
          LAST_NAME_REGEX: ".*",
          UseExternalPatientInfo: "false",
        },
      }}
    >
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification: vi.fn(),
        }}
      >
        <IntlProvider locale="zh-CN" messages={zhMessages}>
          <SystemAuditEvents />
        </IntlProvider>
      </NotificationContext.Provider>
    </ConfigurationContext.Provider>,
  );

const chooseType = async (user, label) => {
  await user.click(screen.getByRole("combobox", { name: "业务对象" }));
  await user.click(await screen.findByRole("option", { name: label }));
};

const choosePatient = async (user, id = "301") => {
  await user.click(
    screen.getByRole("button", { name: /^(选择患者|选择其他患者)$/ }),
  );
  const input = screen.getByRole("textbox", { name: "患者编号" });
  await user.type(input, `SIM-P-${id}`);
  await user.click(
    within(input.closest("form")).getByRole("button", { name: "搜索" }),
  );
  await user.click(
    await screen.findByRole("radio", {
      name: `选择 SIM患者 ${id === "301" ? "甲" : "乙"}`,
    }),
  );
};

describe("患者档案操作日志的联合实体范围", () => {
  let opened;
  let pendingAudit;
  let pendingPatient;
  let deferAudit;
  let deferPatient;

  beforeEach(() => {
    vi.clearAllMocks();
    pendingAudit = [];
    pendingPatient = [];
    deferAudit = false;
    deferPatient = false;
    opened = vi.spyOn(window, "open").mockReturnValue(null);
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url === "/rest/systemAuditEvents/entityTypes") {
        callback([
          { id: "12", name: "PATIENT" },
          { id: "13", name: "PERSON" },
          { id: "11", name: "TEST_SECTION" },
        ]);
      } else if (url === "/rest/users") {
        callback([]);
      } else if (url.startsWith("/rest/patient-search-results?")) {
        callback({
          patientSearchResults: [patient("301"), patient("302")],
          paging: { currentPage: "1", totalPages: "1" },
          totalItems: 2,
        });
      } else if (url.startsWith("/rest/patient-details?")) {
        const result = patient(paramsFor(url).get("patientID"));
        if (deferPatient) pendingPatient.push(() => callback(result));
        else callback(result);
      } else if (url.startsWith("/rest/patient-photos/")) {
        callback({ data: "" });
      } else if (url.startsWith("/rest/systemAuditEvents?")) {
        const params = paramsFor(url);
        const types = params.get("entityType")?.split(",") || [];
        const id = params.get("patientId");
        const events = id
          ? auditEvents(id).filter((event) => types.includes(event.entityType))
          : [];
        const result = { events, totalItems: events.length ? 26 : 0 };
        if (deferAudit) pendingAudit.push(() => callback(result));
        else callback(result);
      } else {
        callback({});
      }
    });
  });

  afterEach(() => {
    expect(postToOpenElisServer).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test("患者入口未选患者不能查询或导出全部患者历史", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseType(user, "患者档案");
    const search = screen.getByRole("button", { name: /搜索/ });
    const csv = screen.getByRole("button", { name: "导出表格" });
    const pdf = screen.getByRole("button", { name: "导出文档" });
    expect(search).toBeDisabled();
    expect(csv).toBeDisabled();
    expect(pdf).toBeDisabled();
    await user.click(search);
    await user.click(csv);
    await user.click(pdf);
    expect(listRequests()).toHaveLength(0);
    expect(opened).not.toHaveBeenCalled();
  });

  test("实际选择患者后列表、翻页、表格和文档均请求患者与人员两类记录", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseType(user, "患者档案");
    await choosePatient(user);
    await user.click(screen.getByRole("button", { name: /搜索/ }));

    expect(await screen.findByText(/SIM患者属性-301/)).toBeInTheDocument();
    expect(screen.getByText(/SIM姓名变更-301/)).toBeInTheDocument();
    expect(paramsFor(listRequests()[0][0]).get("entityType")).toBe(
      "PATIENT,PERSON",
    );
    expect(paramsFor(listRequests()[0][0]).get("patientId")).toBe("301");
    expect(paramsFor(listRequests()[0][0]).get("page")).toBe("1");
    await user.click(screen.getByRole("button", { name: "下一页" }));
    const pageParams = paramsFor(listRequests().at(-1)[0]);
    expect(pageParams.get("page")).toBe("2");
    expect(pageParams.get("pageSize")).toBe("25");
    expect(pageParams.get("entityType")).toBe("PATIENT,PERSON");
    expect(pageParams.get("patientId")).toBe("301");

    await user.click(screen.getByRole("button", { name: "导出表格" }));
    await user.click(screen.getByRole("button", { name: "导出文档" }));
    expect(opened).toHaveBeenCalledTimes(2);
    for (const [index, path] of ["export", "exportPdf"].entries()) {
      const [url, target] = opened.mock.calls[index];
      expect(url).toContain(
        `${config.serverBaseUrl}/rest/systemAuditEvents/${path}?`,
      );
      const params = paramsFor(url);
      expect(params.get("entityType")).toBe("PATIENT,PERSON");
      expect(params.get("patientId")).toBe("301");
      expect(params.has("page")).toBe(false);
      expect(target).toBe("_blank");
    }
  });

  test("切换非患者类型清空旧日志及患者条件，返回患者入口需要重新选择", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseType(user, "患者档案");
    await choosePatient(user);
    await user.click(screen.getByRole("button", { name: /搜索/ }));
    expect(await screen.findByText(/SIM患者属性-301/)).toBeInTheDocument();
    await chooseType(user, "专业组");
    expect(screen.queryByText(/SIM患者属性-301/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下一页" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /搜索/ }));
    const params = paramsFor(listRequests().at(-1)[0]);
    expect(params.get("entityType")).toBe("TEST_SECTION");
    expect(params.has("patientId")).toBe(false);
    expect(params.get("page")).toBe("1");
    await user.click(screen.getByRole("button", { name: "导出表格" }));
    await user.click(screen.getByRole("button", { name: "导出文档" }));
    for (const [url] of opened.mock.calls) {
      expect(paramsFor(url).get("entityType")).toBe("TEST_SECTION");
      expect(paramsFor(url).has("patientId")).toBe(false);
    }
    await chooseType(user, "患者档案");
    expect(screen.getByRole("button", { name: /搜索/ })).toBeDisabled();
  });

  test("切换患者后晚到的旧患者查询不能覆盖当前姓名和属性记录", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseType(user, "患者档案");
    await choosePatient(user);
    deferAudit = true;
    await user.click(screen.getByRole("button", { name: /搜索/ }));
    expect(pendingAudit).toHaveLength(1);
    await choosePatient(user, "302");
    deferAudit = false;
    await user.click(screen.getByRole("button", { name: /搜索/ }));
    expect(await screen.findByText(/SIM患者属性-302/)).toBeInTheDocument();
    await act(async () => pendingAudit[0]());
    expect(screen.queryByText(/SIM患者属性-301/)).not.toBeInTheDocument();
    expect(screen.getByText(/SIM姓名变更-302/)).toBeInTheDocument();
  });

  test("类型切换后晚到的患者查询与患者详情均不能恢复旧选择", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseType(user, "患者档案");
    await choosePatient(user);
    deferAudit = true;
    await user.click(screen.getByRole("button", { name: /搜索/ }));
    deferPatient = true;
    await choosePatient(user, "302");
    expect(pendingPatient).toHaveLength(1);
    await chooseType(user, "专业组");
    await act(async () => {
      pendingAudit[0]();
      pendingPatient[0]();
    });
    expect(screen.queryByText(/SIM患者属性-301/)).not.toBeInTheDocument();
    await chooseType(user, "患者档案");
    expect(screen.getByRole("button", { name: /搜索/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "选择患者" }),
    ).toBeInTheDocument();
  });

  test("清除患者立即清空结果及分页，不能导出上一个患者的记录", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseType(user, "患者档案");
    await choosePatient(user);
    await user.click(screen.getByRole("button", { name: /搜索/ }));
    expect(await screen.findByText(/SIM患者属性-301/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(screen.queryByText(/SIM患者属性-301/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下一页" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜索/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出表格" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出文档" })).toBeDisabled();
    expect(opened).not.toHaveBeenCalled();
  });
});
