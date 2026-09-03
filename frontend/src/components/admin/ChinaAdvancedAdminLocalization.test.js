import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "@babel/parser";
import { describe, expect, test } from "vitest";

import en from "../../languages/en.json";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const scopedPaths = [
  path.join(currentDirectory, "testCatalog"),
  path.join(currentDirectory, "generalConfig/siteBranding"),
  path.join(currentDirectory, "generalConfig/common"),
  path.join(currentDirectory, "DataExportStatus"),
  path.join(currentDirectory, "calendarManagement"),
  path.join(currentDirectory, "menu/CommonProperties.jsx"),
  path.join(currentDirectory, "menu/DictionaryManagement.jsx"),
  path.join(currentDirectory, "ProviderMenu/ProviderMenu.tsx"),
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
const sourceByFile = new Map(
  sourceFiles.map((sourceFile) => [
    sourceFile,
    fs.readFileSync(sourceFile, "utf8"),
  ]),
);

const referencedMessageIds = new Set();
for (const source of sourceByFile.values()) {
  for (const match of source.matchAll(
    /["']([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)["']/g,
  )) {
    const messageId = match[1];
    if (
      Object.prototype.hasOwnProperty.call(en, messageId) ||
      Object.prototype.hasOwnProperty.call(zh, messageId) ||
      Object.prototype.hasOwnProperty.call(zhCN, messageId)
    ) {
      referencedMessageIds.add(messageId);
    }
  }
}

const removeAllowedTechnicalText = (value) =>
  String(value)
    .replace(/\{[^{}]*\}/g, "")
    .replace(
      /\b(?:FHIR|TCP|RS232|JSON|UUID|ASTM|HL7|LOINC|LIS|IP|HTTP|HTTPS|CSV|TSV|Excel|UCUM|AMR|URI|RGB|CSS|PDF|API|URL|TAT|JPG|PNG|GIF|SVG|LP|en|date|name|recurring|true|false)\b/gi,
      "",
    )
    .replace(/\bg\/dL\b/gi, "")
    .trim();

const visibleAttributeNames = new Set([
  "aria-label",
  "ariaLabel",
  "alt",
  "buttonLabel",
  "defaultMessage",
  "helperText",
  "iconDescription",
  "invalidText",
  "label",
  "labelText",
  "modalHeading",
  "placeholder",
  "primaryButtonText",
  "secondaryButtonText",
  "title",
  "titleText",
]);

const allowedVisibleTechnicalText = (value) =>
  /^(?:LOINC|UCUM|AMR|FHIR|YYYY-MM-DD|yyyy-mm-dd|Y|N)$/.test(value);

const findHardcodedVisibleEnglish = () => {
  const findings = [];
  const inspectText = (sourceFile, line, kind, value) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (
      normalized &&
      /[A-Za-z]{2}/.test(normalized) &&
      !allowedVisibleTechnicalText(normalized) &&
      !Object.prototype.hasOwnProperty.call(en, normalized)
    ) {
      findings.push(
        `${path.basename(sourceFile)}:${line} ${kind}: ${normalized}`,
      );
    }
  };

  for (const [sourceFile, source] of sourceByFile) {
    const ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    const visit = (node) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "JSXText") {
        inspectText(sourceFile, node.loc.start.line, "界面文本", node.value);
      }
      if (node.type === "JSXAttribute") {
        const attributeName = node.name?.name;
        if (visibleAttributeNames.has(attributeName)) {
          const literalValue =
            node.value?.type === "StringLiteral"
              ? node.value.value
              : node.value?.expression?.type === "StringLiteral"
                ? node.value.expression.value
                : null;
          if (literalValue) {
            inspectText(
              sourceFile,
              node.loc.start.line,
              String(attributeName),
              literalValue,
            );
          }
        }
      }
      if (node.type === "ObjectProperty") {
        const propertyName = node.key?.name || node.key?.value;
        if (
          visibleAttributeNames.has(propertyName) &&
          node.value?.type === "StringLiteral"
        ) {
          inspectText(
            sourceFile,
            node.loc.start.line,
            String(propertyName),
            node.value.value,
          );
        }
      }

      for (const [key, child] of Object.entries(node)) {
        if (["loc", "start", "end"].includes(key)) continue;
        if (Array.isArray(child)) child.forEach(visit);
        else visit(child);
      }
    };
    visit(ast);
  }
  return findings;
};

describe("中国版高级检验项目与系统配置中文资源", () => {
  test("全部实际静态资源键存在且两套中文一致", () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(38);
    expect(referencedMessageIds.size).toBeGreaterThanOrEqual(620);

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

  test("实际可达文案不回退为英文句子或暴露开源产品名", () => {
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

  test("核心业务名称符合中国 LIS 使用习惯", () => {
    expect(zh["label.testCatalog.testName"]).toBe("检验项目名称");
    expect(zh["label.testCatalog.section.panels"]).toBe("组合项目");
    expect(zh["label.testCatalog.basicInfo.sampleTypes"]).toBe("适用标本类型");
    expect(zh["label.testCatalog.section.ranges"]).toBe("参考区间");
    expect(zh["label.testCatalog.ranges.modal.lowCritical"]).toBe("危急值下限");
    expect(zh["label.testCatalog.sampleResults.label"]).toBe("结果项名称");
    expect(zh["label.testCatalog.section.methods"]).toBe("检验方法");
    expect(zh["label.testCatalog.section.reagents"]).toBe("检验试剂");
    expect(zh["dictionary.label.modify"]).toBe("结果字典管理");
    expect(zh["provider.browse.title"]).toBe("申请医生管理");
    expect(zh["common.properties.title"]).toBe("系统通用参数");
    expect(zh["site.branding.title"]).toBe("界面标识与配色");
    expect(zh["calendar.management.title"]).toBe("工作日历管理");
    expect(zh["dataexport.status.title"]).toBe("FHIR 数据交换监控");
  });

  test("生产组件不含硬编码可见英文", () => {
    expect(findHardcodedVisibleEnglish()).toEqual([]);
  });
});
