import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const expectedTerms = {
  "sidenav.label.reports": "报告查询",
  "sidenav.china.analytics": "查询统计",
  "sidenav.label.reports.routine": "常规报告",
  "sidenav.title.statusreport": "检验报告查询",
  "sidenav.label.statusreport": "患者检验报告",
  "sidenav.title.aggregatereport": "业务统计",
  "sidenav.label.statisticsreport": "检验工作量统计",
  "sideNav.label.hivtestsummary": "艾滋病病毒检验汇总",
  "sideNav.title.activityreport": "检验业务量统计",
  "sideNav.label.bytesttype": "按检验项目",
  "sideNav.label.bypaneltype": "按组合项目",
  "sideNav.label.byunit": "按专业组",
  "sideNav.title.referredtestreport": "外送检验报告",
  "sideNav.label.referredtestreport": "外送检验结果报告",
  "sideNav.title.rejectionreport": "标本拒收统计",
  "sideNav.title.noncomformityreports": "不符合项统计",
  "reports.tat.title": "检验周转时间分析",
  "sideNav.title.tatreport": "周转时间分析",
  "reports.tat.tabs.label": "检验周转时间分析栏目",
  "reports.tat.summary": "汇总分析",
  "reports.tat.tatSegment": "周转阶段",
  "reports.tat.priority.all": "全部",
  "reports.tat.exportCsv": "导出表格",
  "reports.systemAuditTrail": "操作日志查询",
  "reports.query.dateType.order": "申请日期",
  "report.enter.labNumber.headline": "按实验室编号查询报告",
  "report.enter.patient.headline": "按患者查询报告",
  "report.enter.site.headline": "按送检机构和日期查询报告",
  "report.labe.site": "送检机构与日期",
  "report.label.site.onlyResults": "仅显示已有结果",
  "reports.query.method.siteDate": "按送检机构和日期查询",
  "reports.query.labNumber.from": "起始实验室编号",
  "reports.query.labNumber.to": "结束实验室编号",
  "label.report.byNationalId": "按身份证件号码或患者唯一编号查询",
  "nationalID.title": "身份证件号码或患者唯一编号",
  "openreports.stat.aggregate": "检验工作量统计",
  "select.referral.centre": "外送实验室",
  "select.labUnits": "专业组",
  "select.priority.tests": "申请优先级",
  "select.timeFrame": "接收时段",
  "select.year.report": "统计年度",
  "systemAudit.filter.entityType": "业务对象",
  "systemAudit.filter.export": "导出表格",
  "systemAudit.filter.exportPdf": "导出文档",
  "systemAudit.entityType.PATIENT": "患者档案",
  "sideNav.label.audittrail.orderEvents": "申请单操作记录",
  "pagination.item-range": "第 {min}–{max} 项，共 {total} 项",
  "pagination.items-per-page": "每页显示",
  "reports.tat.noResults":
    "未找到符合所选筛选条件的结果。请尝试调整日期范围或筛选条件。",
  "systemAudit.noResults": "未查询到符合条件的操作记录。",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China report terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});
