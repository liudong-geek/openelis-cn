import React from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import { webcrypto } from "node:crypto";

vi.mock("../layout/Layout", () => ({
  ConfigurationContext: React.createContext({ configurationProperties: {} }),
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: () => {},
    addNotification: () => {},
  }),
}));
vi.mock("../common/PageBreadCrumb", () => ({ default: () => null }));
vi.mock("../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { success: "success", error: "error" },
}));
vi.mock("./BarcodeScannerBar", () => ({ default: () => null }));
// These selection editors have their own component tests. Keep the real entry
// page, workflow controls, Provider and transport; supply an explicit SIM draft.
vi.mock("./steps/sections/PatientSearchSection", () => ({
  default: () => null,
}));
vi.mock("./steps/sections/LocationSection", () => ({ default: () => null }));
vi.mock("./steps/sections/ProgramSection", () => ({ default: () => null }));
vi.mock("./steps/sections/ClinicalInfoSection", () => ({
  default: () => null,
}));
vi.mock("./steps/sections/RequesterSection", () => ({ default: () => null }));
vi.mock("./steps/sections/SampleTestSection", () => ({ default: () => null }));

import OrderEnter from "./steps/OrderEnter";
import { OrderProvider, useOrderContext } from "./OrderContext";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { createEntrySubmissionSim } from "./testUtils/entrySubmissionSim";
import { readFileSync } from "node:fs";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const read = (relativePath) =>
  readFileSync(`${process.cwd()}/${relativePath}`, "utf8");

describe("China order entry uses governed master data", () => {
  test("真实开单页只在保存时取号，整单回执确认后推进，独立核对不重复写入", async () => {
    sessionStorage.clear();
    vi.stubGlobal("crypto", webcrypto);
    const sim = createEntrySubmissionSim({ holdWrite: true });
    vi.stubGlobal("fetch", sim.fetch);
    const user = userEvent.setup();
    const history = createMemoryHistory({ initialEntries: ["/order/enter"] });
    let context;
    const Probe = () => {
      context = useOrderContext();
      return null;
    };
    const h = React.createElement;
    const view = render(
      h(
        Router,
        { history },
        h(
          IntlProvider,
          { locale: "zh", messages: zh },
          h(
            UserSessionDetailsContext.Provider,
            {
              value: {
                userSessionDetails: {
                  authenticated: true,
                  userId: "91",
                  sessionId: "SIM-SESSION",
                  csrf: "SIM-CSRF",
                },
              },
            },
            h(
              OrderProvider,
              null,
              h(Probe),
              h(Route, { path: "/order/enter", component: OrderEnter }),
            ),
          ),
        ),
      ),
    );
    try {
      await act(async () => {});
      act(() => {
        context.setOrderData((previous) => ({
          ...previous,
          patientProperties: {
            patientPK: "801",
            patientUpdateStatus: "NO_ACTION",
            lastName: "SIM患者",
          },
          sampleOrderItems: {
            ...previous.sampleOrderItems,
            labNo: "",
            referringSiteId: "301",
          },
        }));
        context.setSamples([
          { sampleTypeId: "2", tests: [{ id: "11" }] },
          { sampleTypeId: "3", tests: [{ id: "12" }] },
        ]);
      });
      const numberReads = () =>
        sim.reads.filter(({ path }) =>
          path.endsWith("/SampleEntryGenerateScanProvider"),
        );
      expect(numberReads()).toHaveLength(0);
      expect(sim.writes).toHaveLength(0);
      expect(
        screen.getByText(zh["order.labNumber.generatedOnSave"]),
      ).toBeVisible();
      const next = screen.getByRole("button", {
        name: zh["button.save.nextStep"].replace(
          "{step}",
          zh["order.step.collect"],
        ),
      });
      await user.dblClick(next);
      await waitFor(() => expect(sim.writes).toHaveLength(1));
      expect(numberReads()).toHaveLength(1);
      expect(next).toBeDisabled();
      expect(history.location.pathname).toBe("/order/enter");
      expect(context.orderId).toBeNull();
      const write = sim.writes[0];
      const body = JSON.parse(write.options.body);
      expect(body).toMatchObject({
        orderEntryOnly: true,
        sampleXML: "",
        sampleOrderItems: {
          labNo: "SIM-GENERATED-001",
          referringSiteId: "301",
          modified: false,
        },
        patientProperties: { patientPK: "801", lastName: "SIM患者" },
        requestedSpecimens: [
          { typeOfSampleId: "2", requestedTests: "11", sortOrder: 0 },
          { typeOfSampleId: "3", requestedTests: "12", sortOrder: 1 },
        ],
      });
      await act(async () => write.release());
      await waitFor(() =>
        expect(history.location.pathname).toBe("/order/collect"),
      );
      expect(context.orderId).toBe("701");
      expect(context.stepProgress.enter).toBe(true);
      expect(context.labNumber).toBe("SIM-GENERATED-001");
      expect(context.isSaveUnconfirmed).toBe(false);
      let recovered;
      await act(async () => {
        recovered = await context.queryEntryRecovery(write.submissionId);
      });
      expect(recovered).toMatchObject({
        sampleId: "701",
        labNo: "SIM-GENERATED-001",
        patientId: "801",
        requestedSpecimens: [
          { id: "901", sampleItemId: null },
          { id: "902", sampleItemId: null },
        ],
      });
      expect(sim.reads.at(-1)).toMatchObject({
        path: expect.stringContaining(`/submissions/${write.submissionId}`),
        options: { method: "GET", cache: "no-store" },
      });
      expect(numberReads()).toHaveLength(1);
      expect(sim.writes).toHaveLength(1);
      expect(sim.unexpected).toEqual([]);
    } finally {
      view.unmount();
      sessionStorage.clear();
      vi.unstubAllGlobals();
    }
  });

  test("the order page searches the patient master with one selector", () => {
    const source = read(
      "src/components/order/steps/sections/PatientSearchSection.jsx",
    );

    expect(source).toContain('id="patientQuickQuery"');
    expect(source).toContain("quickQuery: query");
    expect(source).toContain('history.push("/PatientManagement")');
    expect(source).not.toContain('id="previousLabNumber"');
    expect(source).not.toContain('id="patientLastName"');
    expect(source).not.toContain('id="patientFirstName"');
  });

  test("routine order entry presents one numbered required path before optional fields", () => {
    const orderEntry = read("src/components/order/steps/OrderEnter.jsx");
    const patient = read(
      "src/components/order/steps/sections/PatientSearchSection.jsx",
    );
    const requester = read(
      "src/components/order/steps/sections/RequesterSection.jsx",
    );
    const sample = read(
      "src/components/order/steps/sections/SampleTestSection.jsx",
    );

    expect(patient).toContain('id="order.entry.patient.title"');
    expect(requester).toContain('id="order.entry.requester.title"');
    expect(sample).toContain('id="order.entry.sample.title"');
    expect(orderEntry.indexOf("<RequesterSection")).toBeLessThan(
      orderEntry.indexOf("<SampleTestSection"),
    );
    expect(orderEntry.indexOf("<SampleTestSection")).toBeLessThan(
      orderEntry.indexOf('className="order-section order-optional-details"'),
    );
  });

  test("the request worklist distinguishes loading failure from an empty list", () => {
    const source = read("src/components/order/OrderDashboard.jsx");

    expect(source).toContain("const [loadError, setLoadError]");
    expect(source).toContain('id="order.dashboard.retry"');
    expect(source).toContain("className={`order-dashboard-state");
    expect(source).not.toContain(
      'message: intl.formatMessage({ id: "order.dashboard.load.error" })',
    );
  });

  test("facility and department selectors use one organization hierarchy", () => {
    const requester = read(
      "src/components/order/steps/sections/RequesterSection.jsx",
    );
    const batch = read(
      "src/components/batchOrderEntry/SampleBatchEntrySetup.jsx",
    );

    expect(requester).toContain("/rest/departments-for-site");
    expect(requester).toContain('id="requesterDepartmentId"');
    expect(batch).toContain("allowFreeText={false}");
    expect(batch).toContain("order.requester.department.empty");
    expect(batch).toContain("order.masterData.missing.title");
    expect(batch).toContain("order.form.routine");
    expect(batch).not.toContain('id="form-dropdown"');
  });

  test("a fresh China installation has guarded, editable organization defaults", () => {
    const migration = read(
      "../src/main/resources/liquibase/3.5.x.x/077-cn-clinical-organization-bootstrap.xml",
    );
    const base = read("../src/main/resources/liquibase/3.5.x.x/base.xml");

    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("'本院'");
    expect(migration).toContain("'门诊'");
    expect(migration).toContain("'急诊'");
    expect(migration).toContain("'住院病区'");
    expect(migration).toContain("'体检中心'");
    expect(base).toContain("077-cn-clinical-organization-bootstrap.xml");
  });
});

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China master-data terminology for %s", (_locale, messages) => {
  test.each([
    ["organization.main.title", "机构与科室"],
    ["organization.organizationName", "机构/科室名称"],
    ["organization.parent", "上级机构"],
    ["organization.type.CI", "机构类型"],
    ["sample.label.dept", "送检科室/病区"],
    ["patient.manage.open", "打开患者档案"],
    ["order.labNumber.auto", "系统自动编号"],
    ["order.entry.patient.title", "选择患者"],
    ["order.entry.requester.title", "填写送检信息"],
    ["order.entry.sample.title", "选择标本与检验项目"],
    ["order.dashboard.retry", "重新加载"],
  ])("%s uses a clinical master-data term", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});
