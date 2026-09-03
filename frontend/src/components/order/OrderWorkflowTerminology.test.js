import en from "../../languages/en.json";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";
import { readFileSync } from "node:fs";

const expectedWorkflowTerms = {
  "order.dashboard.title": "检验申请工作台",
  "order.dashboard.subtitle":
    "查询进行中的检验申请、扫描条码，或新建检验申请。",
  "order.new": "新建检验申请",
  "order.search.placeholder": "搜索检验申请…",
  "order.requester": "送检方",
  "order.facility": "送检机构",
  "order.legend.facility": "送检机构",
  "order.legend.siteName": "送检机构",
  "order.paymentStatus": "缴费状态",
  "order.sampleCategory": "标本类别",
  "order.step.enter": "新建申请",
  "order.step.collect": "采集签收",
  "order.step.label": "贴签上架",
  "order.step.qa": "标本验收",
  "order.step.enter.description":
    "建立检验申请，并录入患者或采集地点、送检方、标本类型和检验项目。",
  "order.step.collect.description":
    "确认每份标本已经采集或签收，并记录采集与签收信息。",
  "order.step.label.description": "打印标签、核对标本身份，并分配上架位置。",
  "order.step.qa.description":
    "核对检验申请与标本信息，处理问题后将标本送入检验环节。",
  "order.status.pending.qa": "待标本验收",
  "order.workflow.navigation": "检验申请业务流程",
  "order.summary.accessionNumber": "实验室编号",
  "order.submit.success": "检验申请提交成功",
  "order.submit.success.labNumber": "实验室编号：{labNumber}",
  "order.send.modal.accession": "实验室编号：{accession}",
  "order.send.modal.title": "发送检验申请至分析仪",
  "order.send.missingAccession": "检验申请缺少实验室编号，无法关联仪器结果。",
  "order.send.success": "检验申请已发送至分析仪",
  "order.send.error": "检验申请发送失败",
  "order.test.request.heading": "检验申请",
  "order.title": "申请信息",
  "order.label.add": "标本与检验项目",
  "order.label.modify": "修改检验申请",
  "order.generate.barcode.history": "本次已生成的实验室编号",
  "order.labNumber.auto": "系统自动编号",
  "order.labNumber.generatedOnSave": "首次保存申请时自动生成",
  "order.labNumber.useExternal": "该申请已有外部系统编号",
  "order.masterData.manage": "维护机构与科室",
  "order.masterData.missing.title": "尚未配置送检机构",
  "order.form.routine": "常规临床检验申请",
  "order.requester.department": "送检科室/病区（选填）",
  "patient.manage.open": "打开患者档案",
  "patient.quickSearch.label": "查找患者",
  "patient.quickSearch.placeholder":
    "姓名、患者编号、证件号、手机号或既往实验室编号",
  "availabletests.title": "可选检验项目",
  "currentests.title": "已选检验项目",
  "label.testCatalog.specimenType": "选择标本类型",
  "sample.label.orderpanel": "组合项目",
  "sample.label.search.labnumber": "按实验室编号查询",
  "sample.reject.label": "拒收标本",
  "sample.specimen.origin": "标本来源（送检机构）",
  "sample.temperature": "标本温度",
  "sample.uom.label": "标本计量单位",
  "search.label.accession": "输入实验室编号",
  "search.label.test": "选择检验项目",
  "notice.testCatalog.intake.awaitingSpecimen":
    "待确定标本——该检验项目可使用多种标本，请在采集或签收时选择实际标本。",
  "collect.assign.title": "检验项目分配",
  "collect.assign.button": "分配检验项目",
  "collect.addSample.button": "添加标本",
  "collect.noTestsOrdered": "尚未开立检验项目",
  "collect.samples.title": "标本",
  "collect.sample.receivedAtLab": "标本签收",
  "collect.sample.receivedDate": "签收日期",
  "collect.sample.receivedTime": "签收时间",
  "collect.sample.nce.link": "登记不合格标本",
  "collect.requestedTests.title": "已开立检验项目",
  "collect.table.testPanel": "检验项目/组合",
  "collect.table.sampleAssignments": "已分配标本",
  "qa.checklist.title": "标本验收清单",
  "qa.checklist.incomplete": "标本验收尚未完成",
  "qa.checklist.instructions": "提交检验申请前，请完成所有必填验收项",
  "qa.summary.order": "检验申请详情",
  "qa.summary.samples": "标本与检验项目",
  "qa.summary.noSamples": "暂无可验收标本",
  "barcode.scan.error": "未找到检验申请",
  "barcode.scan.success": "检验申请加载成功",
  "barcode.labels.order.row": "申请单标签数量",
  "barcode.labels.sample.row": "标本 {sampleNumber} 标签数量",
  "label.order": "申请单标签",
  "label.sample": "标本标签",
  "label.panel": "组合项目",
  "label.tests": "检验项目",
  "orderEntry.labels.orderTable.title": "申请单标签",
  "orderEntry.labels.sampleTable.title": "标本标签",
  "sample.type": "标本类型",
  "sample.types": "标本",
  "sample.orderTests": "已选检验项目",
  "sample.orderPanels": "已选组合项目",
  "storage.assign.title": "标本上架",
  "storage.assigned": "已上架",
  "storage.active": "待上架",
  "storage.currentLocation": "当前库位",
  "storage.unassigned.title": "未上架标本",
  "storage.allAssigned.title": "所有标本均已上架",
  "save.order.success.msg": "检验申请已保存",
  "test.search.placeholder": "选择可用检验项目",
  "tests.count": "个检验项目",
  "workflow.clinical": "临床标本",
  "workflow.environmental": "环境/其他样品",
  "program.helper": "选择程序后，下方会显示该程序需要填写的附加申请信息。",
  "sample.label.orderdate": "申请日期",
  "sample.label.dept": "送检科室/病区",
  "sample.label.facility": "送检机构",
  "sidenav.label.incomingorder": "待接收申请",
  "banner.menu.eorders": "待接收电子申请",
  "banner.menu.sampleBatchEntry": "批量申请录入",
  "banner.menu.printBarcode": "标本条码补打",
  "banner.menu.reports.routine": "常规检验报告",
  "sidenav.label.storage.management": "标本库管理",
  "sidenav.label.storage.coldstorage": "冰箱温度监控",
  "sidenav.label.inventory": "试剂耗材",
  "sidenav.label.inventory.management": "试剂耗材管理",
  "menu.accession.validation": "按申请单审核",
  "menu.accession.validation.range": "按申请单号范围审核",
  "menu.validation.date": "按日期审核",
  "sideNav.label.audittrail": "操作日志查询",
  "analyzer.navigation.analyzers": "分析仪接口管理",
  "analyzer.navigation.analyzersList": "分析仪管理",
  "analyzer.navigation.errorDashboard": "接口异常",
  "analyzer.navigation.analyzerTypes": "分析仪型号",
  "analyzer.navigation.qc": "室内质量控制",
  "banner.menu.eqa.tests": "室间质评任务",
  "banner.menu.eqa.tests.orders": "待处理质评样品",
  "banner.menu.eqa.tests.myPrograms": "我的质评计划",
  "banner.menu.eqa.mgmt": "室间质评管理",
  "banner.menu.eqa.mgmt.programs": "质评计划",
  "banner.menu.eqa.mgmt.participants": "参评实验室",
  "banner.menu.eqa.mgmt.distributions": "样品发放",
  "banner.menu.eqa.mgmt.results": "质评结果",
  "banner.menu.eqa.distribution": "样品发放",
  "banner.menu.eqa.distribution.tooltip": "室间质评样品发放",
  "banner.menu.eqa.management": "质评管理",
  "banner.menu.eqa.management.tooltip": "室间质评管理",
  "banner.menu.eqa.mgmt.distributions.tooltip": "创建并管理室间质评样品发放",
  "banner.menu.eqa.mgmt.participants.tooltip": "管理参加室间质评的实验室",
  "banner.menu.eqa.mgmt.programs.tooltip": "创建并管理室间质评计划",
  "banner.menu.eqa.mgmt.results.tooltip": "汇总并分析室间质评结果",
  "banner.menu.eqa.mgmt.tooltip": "管理质评计划、参评实验室和样品发放",
  "banner.menu.eqa.tests.myPrograms.tooltip": "查看和维护我参加的室间质评计划",
  "banner.menu.eqa.tests.orders.tooltip": "查看和处理待检的室间质评样品",
  "banner.menu.eqa.tests.tooltip": "处理室间质评样品并维护参评计划",
  "banner.menu.eqa.tooltip": "室间质量评价",
  "pagination.previous": "上一页",
  "pagination.next": "下一页",
};

const expectedEnvironmentalTerms = {
  "env.samplingSite.title": "采样点信息",
  "env.site.searchTab": "查询采样点",
  "env.site.newTab": "新建采样点",
  "env.site.helperText":
    "可查询已有采样点，也可新建采样点。新建后将保存到采样点档案，供后续检验申请复用。",
  "env.site.searchLabel": "采样点名称",
  "env.site.searchPlaceholder": "输入采样点名称",
  "env.site.address": "地址",
  "site.code": "采样点编码",
  "env.site.code": "采样点编码",
  "env.site.code.placeholder": "自动生成，也可手动录入",
  "env.site.name": "采样点名称",
  "env.site.name.placeholder": "输入采样点名称",
  "env.site.unknown": "未命名采样点",
  "env.site.type": "采样点类型",
  "env.site.type.select": "请选择采样点类型",
  "env.site.subtype": "采样点子类型",
  "env.site.subtype.placeholder": "例如：河流、水井、固定监测点",
  "env.site.addressSearch.placeholder":
    "搜索行政区划或地址，以自动填写下方位置",
  "env.site.zone": "环境区域",
  "env.site.zone.select": "请选择环境区域",
  "env.site.description": "采样点描述",
  "env.site.description.placeholder": "例如：闸门下游监测点",
  "env.site.streetAddress": "详细地址",
  "env.site.streetAddress.placeholder": "输入街道地址或位置说明",
  "env.site.contactPerson": "联系人",
  "env.site.contactPerson.placeholder": "输入采样点联系人姓名",
  "env.site.contactPhone": "联系电话",
  "env.site.saveAndSelect": "保存并选择采样点",
  "label.button.saving": "正在保存…",
  "env.collectionConditions.subtitle": "本批次所有样品默认采用以下采样条件。",
  "env.conditions": "采样环境",
  "env.conditions.placeholder": "例如：20 ℃、晴、旱季",
  "env.regulatoryReference": "法规/标准依据",
  "env.regulatoryReference.placeholder": "例如：GB 3838—2002",
  "env.collectionMethod.placeholder": "例如：瞬时采样、24 小时混合采样",
  "env.collectionConditions.helper":
    "请记录采样时的环境、标准依据和采样方式，便于结果解释与追溯。",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("core order workflow terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedWorkflowTerms))(
    "%s uses the China LIS term",
    (id, expected) => {
      expect(messages[id]).toBe(expected);
    },
  );

  test.each(Object.entries(expectedEnvironmentalTerms))(
    "%s uses natural environmental testing terminology",
    (id, expected) => {
      expect(messages[id]).toBe(expected);
    },
  );

  test("keeps technical configuration validation terminology unchanged", () => {
    expect(messages["sidenav.label.admin.formEntry.validationconfig"]).toBe(
      "验证配置",
    );
  });

  test("keeps English EQA abbreviations out of the China-facing quality menu", () => {
    Object.entries(messages)
      .filter(([id]) => id.startsWith("banner.menu.eqa"))
      .forEach(([, value]) => {
        expect(value).not.toMatch(/\bEQA\b/i);
      });
  });
});

test("both Simplified Chinese resource aliases stay aligned", () => {
  for (const id of [
    ...Object.keys(expectedWorkflowTerms),
    ...Object.keys(expectedEnvironmentalTerms),
  ]) {
    expect(zh[id]).toBe(zhCN[id]);
  }
});

test.each([
  "pagination.previous",
  "pagination.next",
  ...Object.keys(expectedEnvironmentalTerms),
])("English compatibility resource defines %s", (id) => {
  expect(en[id]).toEqual(expect.any(String));
  expect(en[id].trim()).not.toBe("");
});

test("sampling-site summary does not hard-code English field labels", () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/order/steps/sections/LocationSection.jsx`,
    "utf8",
  );

  expect(source).not.toContain("`Code:");
  expect(source).not.toContain("` · Location:");
  expect(source).not.toContain("` · Type:");
  expect(source).not.toContain('|| "Unknown Site"');
});

test("requester summary does not hard-code English organization labels", () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/order/steps/sections/RequesterSection.jsx`,
    "utf8",
  );

  expect(source).not.toContain("`Location:");
  expect(source).not.toContain("` · Type:");
  expect(source).toContain('<FormattedMessage id="site.location" />');
  expect(source).toContain('<FormattedMessage id="site.type" />');
});

test("specimen acceptance loading states do not expose English text", () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/order/steps/OrderQA.jsx`,
    "utf8",
  );

  expect(source).not.toContain('description="Loading checklist..."');
  expect(source).not.toContain('description="Saving..."');
});

test.each([
  "steps/sections/PatientSearchSection.jsx",
  "steps/sections/ProgramSection.jsx",
  "OrderDashboard.jsx",
  "../patient/CreatePatientForm.tsx",
  "../resultPage/unified/UnifiedResults.tsx",
])(
  "China core date picker %s does not hard-code a European date order",
  (file) => {
    const source = readFileSync(
      `${process.cwd()}/src/components/order/${file}`,
      "utf8",
    );

    expect(source).not.toContain('dateFormat="d/m/Y"');
    expect(source).not.toContain('placeholder="dd/mm/yyyy"');
    expect(source).not.toContain('dateLocale === "fr-FR"');
  },
);
