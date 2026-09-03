import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { readFileSync } from "node:fs";
import en from "../languages/en.json";
import zh from "../languages/zh.json";
import zhCN from "../languages/zh_CN.json";
import AutoComplete from "./common/AutoComplete";

const expectedClinicalTerms = {
  "address.search.level": "第 {level} 级行政区划",
  "address.search.no.results": "未找到“{term}”对应的地址",
  "address.search.placeholder": "输入至少 2 个字搜索地址…",
  "address.search.results.count": "找到 {count} 条地址",
  "autocomplete.noSuggestions": "暂无匹配选项",
  "button.collapse": "收起",
  "button.expand": "展开",
  calculatedTests: "计算项目",
  "column.name.retest": "复检",
  "column.name.sampleInfo": "标本信息",
  "column.name.testDate": "检验日期",
  "column.name.testName": "检验项目",
  "label.editing": "正在编辑",
  "label.results.date": "检验日期",
  "label.results.labUnit": "专业组",
  "label.results.reflexTriggered": "已追加以下反射或计算项目：",
  "label.results.search": "按实验室编号查询并录入检验结果",
  "label.results.subject": "标本 / 患者",
  "label.results.test": "检验项目",
  "label.referOut.column.sampleId": "标本编号",
  "label.validation.errors": "审核错误",
  "label.validation.nonconforming": "不合格标本",
  "label.validation.results": "结果审核",
  "loading.label": "正在加载患者档案…",
  "patient.dataSource.external": "外部患者档案",
  "patient.dataSource.local": "本系统",
  "patient.fetch.error": "无法加载患者档案，请确认患者编号有效且服务可用。",
  "patient.search.client.registry": "查询外部患者档案",
  "placeholder.accession.number": "输入实验室编号",
  "referral.button.unitTestSearch": "按专业组和检验项目查询",
  "referral.label.testtoperform": "待检项目",
  "referral.out.request": "按日期、检验项目或专业组查询",
  reflexTests: "反射检验",
  "result.reject.warning": "拒绝后将删除当前检验结果，且无法恢复。",
  "results.label.refer": "外送至参考实验室",
  "results.workbench.filters.subtitle":
    "待录入队列已自动加载；仅在查找指定检验申请时使用筛选。",
  "results.workbench.labUnit.all": "全部授权专业组",
  "sample.rejection.reason.select": "请选择拒收原因",
  "search.label.fromaccession": "起始实验室编号",
  "search.label.sample": "选择标本状态",
  "search.label.testdate": "输入检验日期",
  "search.label.testunit": "选择专业组",
  "search.label.toaccession": "结束实验室编号",
  "storage.location.assigned.error": "标本上架失败，请重试。",
  "storage.location.assigned.success": "标本已成功上架。",
  "validation.empty.message":
    "请选择专业组，或输入实验室编号，加载待审核检验结果。",
  "validation.label.nonconform": "= 标本或检验申请不合格，或检验项目已被拒绝",
  "validation.reject.all": "全部复检",
  "validation.save.error": "结果审核失败",
  "validation.save.success": "结果审核成功",
  "validation.search.noresult": "未找到待审核结果",
  "vl.indication.confirmatory": "确证检测",
  "vl.indication.routine": "常规监测",
  "vl.indication.targeted": "重点检测（临床怀疑）",
  "vl.pregnancy.breastfeeding": "哺乳期",
  "vl.pregnancy.notApplicable": "不适用",
  "vl.pregnancy.pregnant": "妊娠期",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("residual China clinical language for %s", (_locale, messages) => {
  test.each(Object.entries(expectedClinicalTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});

test.each(Object.keys(expectedClinicalTerms))(
  "English compatibility resource defines %s",
  (id) => {
    expect(en[id]).toEqual(expect.any(String));
    expect(en[id].trim()).not.toBe("");
  },
);

test("autocomplete empty state follows the active Chinese locale", () => {
  render(
    <IntlProvider locale="zh-CN" messages={zhCN}>
      <AutoComplete
        id="clinical-term-search"
        label="检验项目"
        suggestions={[{ id: "1", value: "血常规" }]}
      />
    </IntlProvider>,
  );

  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "不存在的项目" },
  });

  expect(screen.getByText("暂无匹配选项")).toBeInTheDocument();
});

test.each([
  ["common/AutoComplete.jsx", "No suggestions available."],
  ["patient/AddressSearch.tsx", "`Level ${levelNum}`"],
  ["modifyOrder/SearchOrder.jsx", "Enter Lab No"],
  ["eOrder/EOrderSearch.jsx", "All Statuses"],
  ["eOrder/EOrder.jsx", 'ariaLabel="row"'],
  ["addOrder/SampleType.jsx", "Choose Rejection Reason"],
  ["addOrder/SampleType.jsx", "<h4>Order Tests</h4>"],
  ["order/steps/sections/ProgramSection.jsx", "Routine Monitoring"],
  ["order/steps/sections/ProgramSection.jsx", "Not Applicable"],
  ["order/steps/sections/PatientSearchSection.jsx", "`DOB:"],
  ["order/steps/sections/PatientSearchSection.jsx", "`Merged into"],
])("%s does not expose %s", (file, forbiddenText) => {
  const source = readFileSync(
    `${process.cwd()}/src/components/${file}`,
    "utf8",
  );
  expect(source).not.toContain(forbiddenText);
});
