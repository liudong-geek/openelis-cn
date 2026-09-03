import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentsDirectory = path.dirname(currentDirectory);
const scopedPaths = [
  path.join(currentDirectory, "AdminDashboard.jsx"),
  path.join(currentDirectory, "labelPresets"),
  path.join(currentDirectory, "analyzerTestName"),
  path.join(componentsDirectory, "analyzers"),
];

const collectSourceFiles = (entryPath) => {
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) return [entryPath];

  return fs.readdirSync(entryPath).flatMap((entry) => {
    const childPath = path.join(entryPath, entry);
    const childStat = fs.statSync(childPath);
    if (childStat.isDirectory()) {
      return entry === "__tests__" ? [] : collectSourceFiles(childPath);
    }
    if (!/\.(?:js|jsx|ts|tsx)$/.test(entry) || /\.test\./.test(entry)) {
      return [];
    }
    return [childPath];
  });
};

const sourceFiles = scopedPaths.flatMap(collectSourceFiles);

const extractMessageIds = (source) => {
  const messageIds = new Set();
  const patterns = [
    /\b(?:id|messageId)\s*[:=]\s*(?:\{\s*)?["']([^"']+)["']/g,
    /formatMessage\(\s*\{[^}]*?\bid\s*:\s*["']([^"']+)["']/gs,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1].includes(".")) messageIds.add(match[1]);
    }
  }
  return messageIds;
};

const referencedMessageIds = new Set(
  sourceFiles.flatMap((sourceFile) => [
    ...extractMessageIds(fs.readFileSync(sourceFile, "utf8")),
  ]),
);

const removeAllowedTechnicalText = (value) =>
  String(value)
    .replace(/\{[^{}]*\}/g, "")
    .replace(/\b(?:plural|select|zero|one|two|few|many|other)\b/g, "")
    .replace(
      /\b(?:FHIR|TCP|RS232|JSON|UUID|ASTM|HL7|LOINC|LIS|IP|HTTP|CSV|TSV|Excel|RTS|CTS|XON|XOFF|COM\d*|INFO|mm)\b/gi,
      "",
    )
    .replace(/\b[A-Z][A-Z0-9_./*^$|()\\+\-]*\b/g, "")
    .replace(/\b(?:sampleId|testCode|result)\b/g, "")
    .trim();

describe("系统管理与分析仪中文资源", () => {
  test("所有可达组件引用的静态文案均有一致的中文资源", () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
    expect(referencedMessageIds.size).toBeGreaterThan(500);

    for (const messageId of referencedMessageIds) {
      expect(
        Object.prototype.hasOwnProperty.call(zh, messageId),
        `${messageId} 缺少 zh 文案`,
      ).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(zhCN, messageId),
        `${messageId} 缺少 zh_CN 文案`,
      ).toBe(true);
      expect(zh[messageId], `${messageId} 两套中文资源不一致`).toBe(
        zhCN[messageId],
      );
    }
  });

  test("可达组件不会回退为英文句子或暴露开源产品名", () => {
    for (const messageId of referencedMessageIds) {
      const value = String(zh[messageId]);
      const remainingText = removeAllowedTechnicalText(value);

      expect(value, `${messageId} 不应显示开源产品名`).not.toMatch(/OpenELIS/i);
      expect(
        remainingText,
        `${messageId} 仍包含英文句子：${value}`,
      ).not.toMatch(/\b[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})+\b/);
      if (/^[A-Za-z]/.test(remainingText)) {
        expect(
          remainingText,
          `${messageId} 仍以英文文案开头：${value}`,
        ).not.toMatch(/^[A-Za-z]{2,}/);
      }
    }
  });

  test("核心业务名称符合中国实验室使用习惯", () => {
    expect(zh["admin.dashboard.title"]).toBe("系统管理");
    expect(zh["admin.labelPresets.title"]).toBe("标签模板");
    expect(zh["admin.labelPresets.scope.order"]).toBe("申请单");
    expect(zh["admin.labelPresets.scope.sample"]).toBe("标本");
    expect(zh["analyzer.page.title"]).toBe("分析仪接口管理");
    expect(zh["analyzerType.page.title"]).toBe("分析仪型号管理");
    expect(zh["analyzer.errorDashboard.title"]).toBe("分析仪接口异常");
    expect(zh["analyzer.action.qcRules"]).toBe("质控样本识别规则");
    expect(zh["analyzer.status.pending_registration"]).toBe("待注册");
    expect(zh["sidenav.label.admin.analyzerTest"]).toBe("分析仪项目映射");
    expect(zh["label.actualTestName"]).toBe("LIS检验项目");
  });

  test("已发现的页面硬编码英文不会重新出现", () => {
    const source = sourceFiles
      .map((sourceFile) => fs.readFileSync(sourceFile, "utf8"))
      .join("\n");

    const forbiddenVisibleText = [
      "Pending Registration",
      "QC Sample Identification Rules",
      "Field Equals",
      "Specimen ID Prefix",
      "Specimen ID Pattern",
      "Field Contains",
      "Pending analyzer codes",
      "Query Status",
      "Copied to clipboard",
      "No mapping exists for this field",
      "Failed to update pending code status",
      "unit(s)",
      '? "Yes" : "No"',
      '? "Active" : "Inactive"',
    ];

    for (const forbiddenText of forbiddenVisibleText) {
      expect(source).not.toContain(forbiddenText);
    }
  });
});
