import { readFileSync } from "node:fs";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const read = (relativePath) =>
  readFileSync(`${process.cwd()}/${relativePath}`, "utf8");

describe("China order entry uses governed master data", () => {
  test("the order page generates its laboratory number only when it is saved", () => {
    const source = read("src/components/order/steps/OrderEnter.jsx");

    expect(source).toContain("const ensureLabNumber = async ()");
    expect(source).toContain("await ensureLabNumber()");
    expect(source).toContain('id="usesExternalLabNumber"');
    expect(source).toContain('id="order.labNumber.generatedOnSave"');
    expect(source).not.toContain("onClick={generateLabNumber}");
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
