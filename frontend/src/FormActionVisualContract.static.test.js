import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const translations = JSON.parse(
  readFileSync(join(sourceRoot, "languages/zh_CN.json"), "utf8"),
);

const collectSourceFiles = (directory) =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      if (entry === "__tests__") {
        return [];
      }
      return collectSourceFiles(path);
    }

    if (!/\.(?:js|jsx|ts|tsx)$/.test(entry) || /\.test\./.test(entry)) {
      return [];
    }

    return [path];
  });

const messageIdsMatching = (matches) =>
  new Set(
    Object.entries(translations)
      .filter(([, label]) => typeof label === "string" && matches(label.trim()))
      .map(([id]) => id),
  );

const messageIdsForLabels = (labels) =>
  messageIdsMatching((label) => labels.has(label));

const findButtonKinds = (messageIds) => {
  const occurrences = [];

  collectSourceFiles(sourceRoot).forEach((path) => {
    const source = readFileSync(path, "utf8");
    const messagePattern =
      /<FormattedMessage\b[^>]*\bid=["']([^"']+)["'][^>]*\/?\s*>/g;

    for (const match of source.matchAll(messagePattern)) {
      if (!messageIds.has(match[1])) {
        continue;
      }

      const messageOffset = match.index ?? 0;
      const buttonOffset = source.lastIndexOf("<Button", messageOffset);
      const closeOffset = source.lastIndexOf("</Button>", messageOffset);

      if (
        buttonOffset < 0 ||
        buttonOffset < closeOffset ||
        messageOffset - buttonOffset > 1800
      ) {
        continue;
      }

      const buttonSource = source.slice(buttonOffset, messageOffset);
      const kinds = [...buttonSource.matchAll(/\bkind\s*=\s*["']([^"']+)/g)];
      const kind = kinds.at(-1)?.[1] ?? "primary";
      const line = source.slice(0, buttonOffset).split("\n").length;

      occurrences.push({ path, line, messageId: match[1], kind });
    }
  });

  return occurrences;
};

describe("保存与取消操作的视觉层级", () => {
  test("基础样式统一主操作、次操作和禁用状态", () => {
    const stylesheet = readFileSync(
      join(sourceRoot, "ux-foundation.scss"),
      "utf8",
    );

    expect(stylesheet).toContain(
      '.oe-main-content .cds--btn--primary[aria-disabled="true"]',
    );
    expect(stylesheet).toContain(
      ".oe-main-content :is(.cds--btn--secondary, .cds--btn--tertiary)",
    );
    expect(stylesheet).not.toContain(
      ".oe-main-content .cds--btn--secondary {\n  background: #344054;",
    );
  });

  test("取消和关闭按钮不使用主色或文字按钮样式", () => {
    const cancelIds = messageIdsForLabels(new Set(["取消", "关闭"]));
    const violations = findButtonKinds(cancelIds).filter(
      ({ kind }) =>
        !["secondary", "tertiary"].includes(kind) && !kind.startsWith("danger"),
    );

    expect(violations).toEqual([]);
  });

  test("保存按钮保持主操作层级", () => {
    const saveIds = messageIdsMatching(
      (label) =>
        new Set(["保存", "保存更改", "保存修改"]).has(label) ||
        label.startsWith("保存并"),
    );
    const violations = findButtonKinds(saveIds).filter(
      ({ kind }) => !["primary", "secondary", "tertiary"].includes(kind),
    );

    expect(violations).toEqual([]);
  });
});
