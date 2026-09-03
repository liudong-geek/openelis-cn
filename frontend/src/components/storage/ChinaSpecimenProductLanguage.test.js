import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const expectedTerms = {
  "add.aliquot": "添加分装标本",
  "banner.menu.sampleManagement": "标本管理",
  "banner.menu.sampleManagement.tooltip": "查询、分装和追加检验项目",
  "sampleManagement.title": "标本管理",
  "sampleManagement.search.label": "按实验室编号查询",
  "sampleManagement.search.placeholder": "输入实验室编号…",
  "sampleManagement.results.externalId": "标本编号",
  "sampleManagement.results.sampleType": "标本类型",
  "sampleManagement.addTests.title": "追加检验项目",
  "sampleManagement.aliquot.title": "标本分装",
  "sample.management.title": "标本管理",
  "sample.management.search.label": "实验室编号",
  "sample.management.search.placeholder": "输入实验室编号…",
  "sample.management.addTests.modal.title": "追加检验项目",
  "sample.management.aliquot.modal.title": "标本分装",
  "inventory.title": "试剂耗材管理",
  "inventory.list.title": "试剂耗材库存",
  "inventory.tab.catalog": "品种目录",
  "inventory.tab.dashboard": "库存台账",
  "inventory.tab.reports": "库存报表",
  "inventory.transaction.RECEIPT": "接收入库",
  "inventory.transaction.CONSUMPTION": "领用出库",
  "shipment.reception.title": "标本转运接收",
  "shipment.sample.accessionNumber": "实验室编号",
  "shipment.nav.referenceLabResults": "外送检验结果",
  "storage.assign.title": "标本上架",
  "storage.location.label": "库位",
  "storage.location.move": "标本移库",
  "storage.picker.sample.accession": "实验室编号",
  "storage.type.room": "存储间",
  "storage.type.device": "存储设备",
  "storage.type.shelf": "架层",
  "storage.type.rack": "货架",
  "storage.type.box": "储物盒",
  "barcode.print.table.labNumber": "实验室编号",
  "barcode.print.table.specimenLabel": "标本标签",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("Chinese specimen workflow product language for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))(
    "%s is clinician-facing Chinese",
    (id, expected) => {
      expect(messages[id]).toBe(expected);
    },
  );

  test("reachable specimen modules do not contain untranslated prose", () => {
    const prefixes = [
      "storage.",
      "shipment.",
      "sampleManagement.",
      "sample.management.",
      "aliquot",
      "inventory.",
      "catalog.item.",
      "lot.",
      "usage.",
      "disposal.",
      "adjustment.",
      "barcode.",
    ];
    const technicalWords =
      /\b(?:FHIR|SNOMED|Excel|PDF|CSV|QC|HIV|RDT|ID|IP|IPv4|IPv6|HTTP|BACnet|ROOM|DEVICE|SHELF|RACK|POSITION|plural|other)\b/gi;
    const untranslated = Object.entries(messages)
      .filter(([id]) => prefixes.some((prefix) => id.startsWith(prefix)))
      .filter(([, value]) => typeof value === "string")
      .map(([id, value]) => [
        id,
        value.replace(/\{[^{}]*\}/g, "").replace(technicalWords, ""),
      ])
      .filter(([, value]) => /[A-Za-z]{2,}/.test(value));

    expect(untranslated).toEqual([]);

    const nonClinicalSampleTerms = Object.entries(messages).filter(
      ([id, value]) =>
        prefixes.some((prefix) => id.startsWith(prefix)) &&
        typeof value === "string" &&
        value.includes("样本"),
    );
    expect(nonClinicalSampleTerms).toEqual([]);
  });
});

test("specimen workflow controls do not expose hard-coded English", () => {
  const currentFile = fileURLToPath(import.meta.url);
  const componentsRoot = path.resolve(path.dirname(currentFile), "..");
  const roots = [
    "storage",
    "inventory",
    "shipment",
    "sampleManagement",
    "printBarcode",
  ].map((name) => path.join(componentsRoot, name));
  const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
  const forbidden = [];
  const englishFallbacksWithoutChinese = [];
  const referencedMessageIds = new Set();
  const hardCodedControl =
    /\b(?:aria-label|ariaLabel|iconDescription|placeholder|label|helperText|description|backwardText|forwardText)\s*=\s*["'][A-Za-z][^"']*["']/g;
  const hardCodedTableText =
    /\b(?:header|labelType)\s*:\s*["'][A-Z][^"']*["']/g;
  const hardCodedTextNode = /(?<!=)>\s*[A-Za-z][^<>{}\n]{1,80}\s*</g;

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (
        extensions.has(path.extname(entry.name)) &&
        !entry.name.includes(".test.")
      ) {
        const source = fs.readFileSync(fullPath, "utf8");
        for (const pattern of [
          /\bid\s*=\s*["']([^"']+)["']/g,
          /\bid\s*:\s*["']([^"']+)["']/g,
        ]) {
          for (const match of source.matchAll(pattern)) {
            referencedMessageIds.add(match[1]);
          }
        }
        for (const match of source.matchAll(hardCodedControl)) {
          forbidden.push(
            `${path.relative(componentsRoot, fullPath)}: ${match[0]}`,
          );
        }
        for (const match of source.matchAll(hardCodedTableText)) {
          forbidden.push(
            `${path.relative(componentsRoot, fullPath)}: ${match[0]}`,
          );
        }
        for (const match of source.matchAll(hardCodedTextNode)) {
          forbidden.push(
            `${path.relative(componentsRoot, fullPath)}: ${match[0]}`,
          );
        }
        const fallbackPatterns = [
          /id\s*:\s*["']([^"']+)["'][^}]{0,180}?defaultMessage\s*:\s*["'][A-Za-z][^"']*["']/g,
          /id\s*=\s*["']([^"']+)["'][^>]{0,180}?defaultMessage\s*=\s*["'][A-Za-z][^"']*["']/g,
        ];
        for (const pattern of fallbackPatterns) {
          for (const match of source.matchAll(pattern)) {
            if (!zh[match[1]] || !zhCN[match[1]]) {
              englishFallbacksWithoutChinese.push(
                `${path.relative(componentsRoot, fullPath)}: ${match[1]}`,
              );
            }
          }
        }
      }
    }
  };
  roots.forEach(walk);

  expect(forbidden).toEqual([]);
  expect([...new Set(englishFallbacksWithoutChinese)].sort()).toEqual([]);

  const technicalWords =
    /\b(?:FHIR|SNOMED|Excel|PDF|CSV|QC|HIV|RDT|ID|IP|IPv4|IPv6|HTTP|BACnet|ROOM|DEVICE|SHELF|RACK|POSITION)\b/gi;
  for (const [locale, messages] of [
    ["zh", zh],
    ["zh-CN", zhCN],
  ]) {
    const languageDefects = [...referencedMessageIds]
      .filter((id) => typeof messages[id] === "string")
      .map((id) => [
        id,
        messages[id].replace(/\{[^{}]*\}/g, "").replace(technicalWords, ""),
      ])
      .filter(
        ([, value]) => value.includes("样本") || /[A-Za-z]{2,}/.test(value),
      );
    expect(languageDefects, locale).toEqual([]);
  }
});
