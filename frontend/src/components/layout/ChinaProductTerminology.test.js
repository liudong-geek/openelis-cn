import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const expectedBusinessTerms = {
  "banner.menu.home": "工作台",
  "home.label": "工作台",
  "banner.menu.sample": "检验申请",
  "banner.menu.sampleAdd": "新建检验申请",
  "banner.menu.sampleEdit": "修改检验申请",
  "banner.menu.sampleConsult": "查看检验申请",
  "sidenav.label.order.active": "申请列表",
  "sidenav.label.order.new": "新建检验申请",
  "sidenav.label.order.collect": "标本采集与签收",
  "sidenav.label.order.label": "标本贴签与上架",
  "sidenav.label.order.qa": "标本验收",
  "banner.menu.patient": "患者档案",
  "banner.menu.patient.addOrEdit": "患者档案管理",
  "banner.menu.patienthistory": "历史结果查询",
  "label.page.patientHistory": "患者历次检验结果",
  "patient.history.title": "患者历次检验结果",
  "patient.history.search.title": "查询患者",
  "patient.history.viewResults": "查看历次结果",
  "patient.id": "患者编号",
  "patient.prev.lab.no": "既往实验室编号",
  "input.placeholder.patientId": "输入患者编号",
  "input.placeholder.prevLabNumber": "输入既往实验室编号",
  "patient.management.search.subtitle":
    "默认展示患者列表，在这里完成查询、新建、查看和资料维护。",
  "report.enter.patient.headline.description":
    "可按既往实验室编号、患者编号（唯一健康标识或国家身份标识）及其他信息查询患者。",
  "banner.menu.patient.merge": "重复患者档案合并",
  "banner.menu.results": "检验工作站",
  "banner.menu.results.unified": "待录入结果",
  "banner.menu.referredOut": "外送检验查询",
  "banner.menu.resultvalidation": "结果审核",
  "banner.menu.reports": "报告查询",
  "banner.menu.sample.shipment": "标本转运",
  "banner.menu.aliquot": "标本分装",
  "banner.menu.storage": "标本存储",
  "banner.menu.inventory": "试剂耗材",
  "banner.menu.eqa": "室间质量评价",
  "banner.menu.nonconformity": "不符合项管理",
  "sidenav.label.workplan": "检验工作单",
  "sidenav.label.order": "检验申请",
  "sidenav.label.results": "检验结果",
  "sidenav.label.validation": "结果审核",
  "sidenav.label.reports": "报告查询",
  "sidenav.label.validation.routine": "待审核结果",
  "sidenav.label.statusreport": "患者检验报告",
  "sideNav.label.audittrail": "操作日志查询",
  "sidenav.china.specimens": "标本管理",
  "sidenav.china.analytics": "查询统计",
  "sidenav.china.quality": "质量管理",
  "dashboard.quick.receiveSample": "标本采集与签收",
  "dashboard.quick.title": "常用操作",
  "dashboard.shift.pending": "待处理",
  "dashboard.partially.completed.subtitle.label": "等待其余检验项目完成",
  "dashboard.overview.subtitle":
    "查看今日检验工作量，点击指标卡可继续处理相关申请。",
  "login.error.account.disable": "账户已被停用，请联系系统管理员。",
  "login.error.password.current.incorrect": "当前密码不正确，请重新输入。",
  "login.logo.alt": "临床检验信息系统",
  "header.logo.alt": "系统标识",
  "header.panel.help": "帮助面板",
  "header.panel.user": "用户信息面板",
  "app.session.error.title": "系统连接失败",
  "banner.menu.administration": "系统管理",
  "sidenav.label.admin": "系统管理",
  "admin.dashboard.title": "系统管理",
  "admin.dashboard.subtitle": "请选择需要维护的系统配置模块。",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China LIS terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedBusinessTerms))(
    "%s uses the clinical laboratory term",
    (id, expected) => {
      expect(messages[id]).toBe(expected);
    },
  );
});
