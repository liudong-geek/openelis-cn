import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoots = [
  "src/components/home",
  "src/components/layout",
  "src/components/common",
  "src/components/order",
  "src/components/patient",
  "src/components/resultPage",
  "src/components/validation",
  "src/components/reports",
  "src/components/storage",
  "src/components/inventory",
  "src/components/shipment",
  "src/components/sampleManagement",
  "src/components/printBarcode",
].map((relativePath) => path.join(frontendRoot, relativePath));

const en = JSON.parse(
  fs.readFileSync(path.join(frontendRoot, "src/languages/en.json"), "utf8"),
);
const chineseBundles = ["zh.json", "zh_CN.json"].map((fileName) => ({
  fileName,
  messages: JSON.parse(
    fs.readFileSync(path.join(frontendRoot, "src/languages", fileName), "utf8"),
  ),
}));
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const messageIdPatterns = [
  /\bid\s*=\s*["']([^"']+)["']/g,
  /\bid\s*:\s*["']([^"']+)["']/g,
];

const ids = new Set();
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      const source = fs.readFileSync(fullPath, "utf8");
      for (const pattern of messageIdPatterns) {
        for (const match of source.matchAll(pattern)) ids.add(match[1]);
      }
    }
  }
};
sourceRoots.forEach(walk);

// Clinical abbreviations, identifiers, numeric masks and product names are
// intentionally language-neutral. Operator-facing English sentences are not.
const isLanguageNeutral = (value) =>
  typeof value === "string" &&
  (/^[A-Z0-9+./%()_-]{1,18}$/.test(value) ||
    /^https?:\/\//.test(value) ||
    /^[{}0-9:./_-]+$/.test(value));

const failures = [];
const referencedMessageIds = [...ids].filter((id) => id in en).sort();
for (const { fileName, messages } of chineseBundles) {
  const missing = [];
  const untranslated = [];
  for (const id of referencedMessageIds) {
    if (!(id in messages) || !String(messages[id]).trim()) {
      missing.push(id);
    } else if (messages[id] === en[id] && !isLanguageNeutral(en[id])) {
      untranslated.push(`${id}: ${en[id]}`);
    }
  }
  if (missing.length || untranslated.length) {
    failures.push({ fileName, missing, untranslated });
  }
}

if (failures.length) {
  console.error("China delivery localization gate failed.");
  for (const { fileName, missing, untranslated } of failures) {
    console.error(`Bundle: ${fileName}`);
    if (missing.length)
      console.error(`Missing (${missing.length}):\n${missing.join("\n")}`);
    if (untranslated.length)
      console.error(
        `Untranslated (${untranslated.length}):\n${untranslated.join("\n")}`,
      );
  }
  process.exit(1);
}

console.log(
  `China delivery localization gate passed for ${referencedMessageIds.length} referenced message ids in zh and zh-CN.`,
);
