import { describe, expect, test } from "vitest";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";
import { SECURITY_REVIEW_REPORTS } from "./reportAvailability";
import { RoutineReportsMenu as RoutineMenu } from "./Routine";
import { RoutineReportsMenu as StudyMenu } from "./Study";

const DELIVERY_REPORT_LABELS = {
  "sideNav.label.laporanHasil": "合规报告",
  "sideNav.title.audittrail": "操作日志查询",
  "sideNav.title.environmentalReports": "环境检测报告",
  "sideNav.title.vectorIdentification": "媒介鉴定",
  "sideNav.label.audittrail.orderEvents": "申请单操作记录",
  "sideNav.label.audittrail.systemEvents": "系统配置操作记录",
};

const SECURITY_REVIEW_LABELS = {
  "reports.securityReview.status": "安全适配中",
  "reports.securityReview.title": "报告暂不可用",
};

describe("Chinese report navigation", () => {
  test.each(Object.entries(DELIVERY_REPORT_LABELS))(
    "%s uses the reviewed business label in both Chinese locales",
    (messageId, expectedLabel) => {
      expect(zh[messageId]).toBe(expectedLabel);
      expect(zhCN[messageId]).toBe(expectedLabel);
    },
  );

  test.each(Object.entries(SECURITY_REVIEW_LABELS))(
    "%s has the reviewed security message in both Chinese locales",
    (messageId, expectedLabel) => {
      expect(zh[messageId]).toBe(expectedLabel);
      expect(zhCN[messageId]).toBe(expectedLabel);
    },
  );

  test("keeps every known patient-level legacy export fail-closed", () => {
    expect([...SECURITY_REVIEW_REPORTS].sort()).toEqual(
      [
        "CIStudyExport",
        "CISampleRoutineExport",
        "ExportWHONETReportByDate",
        "TBOrderExport",
        "TBOrderReport",
        "Trends",
        "activityReportByPanel",
        "activityReportByTest",
        "activityReportByTestSection",
        "haitiNonConformityByDate",
        "indicatorSectionPerformance",
        "patientAssociated",
        "patientCollection",
        "retroCIFollowupRequiredByLocation",
        "retroCINonConformityByDate",
        "retroCINonConformityByLabno",
        "retroCInonConformityNotification",
        "sampleRejectionReport",
      ].sort(),
    );
  });

  test("marks every restricted report that is visible in the report catalog", () => {
    const menuItems = [
      ...RoutineMenu.sideNavMenuItems,
      ...StudyMenu.sideNavMenuItems,
    ]
      .flatMap((group) => group.SideNavMenuItem)
      .map((item) => ({
        ...item,
        report: new URL(item.link, "http://openelis.local").searchParams.get(
          "report",
        ),
      }));

    const unguardedRestrictedItems = menuItems.filter(
      (item) =>
        SECURITY_REVIEW_REPORTS.has(item.report) && !item.securityRestricted,
    );
    const wronglyDisabledItems = menuItems.filter(
      (item) =>
        item.securityRestricted && !SECURITY_REVIEW_REPORTS.has(item.report),
    );

    expect(unguardedRestrictedItems).toEqual([]);
    expect(wronglyDisabledItems).toEqual([]);
  });
});
