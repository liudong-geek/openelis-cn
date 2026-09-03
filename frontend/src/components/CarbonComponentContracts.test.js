import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const componentsRoot = path.dirname(fileURLToPath(import.meta.url));
const productionExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

const productionFiles = [];

const collectProductionFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectProductionFiles(fullPath);
      continue;
    }

    if (
      productionExtensions.has(path.extname(entry.name)) &&
      !/\.(?:test|spec)\.[jt]sx?$/.test(entry.name)
    ) {
      productionFiles.push(fullPath);
    }
  }
};

collectProductionFiles(componentsRoot);

const relativeMatches = (pattern) =>
  productionFiles.flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    return pattern.test(source) ? [path.relative(componentsRoot, file)] : [];
  });

describe("Carbon component contracts", () => {
  test("dismissible tags use DismissibleTag instead of deprecated Tag props", () => {
    const deprecatedTag = /<Tag\b(?:(?!\/?>)[\s\S])*?\b(?:filter|onClose)\b/;
    const directCarbonTagImport =
      /import\s*\{[^}]*\bTag\b[^}]*\}\s*from\s*["']@carbon\/react["']/s;

    const offenders = productionFiles.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return directCarbonTagImport.test(source) && deprecatedTag.test(source)
        ? [path.relative(componentsRoot, file)]
        : [];
    });

    expect(offenders).toEqual([]);
  });

  test("controlled dates belong to DatePicker rather than DatePickerInput", () => {
    const inputWithValue = /<DatePickerInput\b(?:(?!\/?>)[\s\S])*?\bvalue\s*=/;

    expect(relativeMatches(inputWithValue)).toEqual([]);
  });
});
