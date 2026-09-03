import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "../../languages/en.json";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const componentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const qualityRoots = ["nonconform", "qc", "eqa", "coldStorage", "alerts"].map(
  (directory) => path.join(componentRoot, directory),
);
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const referencedMessageIds = new Set();
const productionSources = [];
const messageIdPatterns = [
  /\bid\s*=\s*["']([^"']+)["']/g,
  /\bid\s*:\s*["']([^"']+)["']/g,
];

const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") walk(fullPath);
    } else if (
      sourceExtensions.has(path.extname(entry.name)) &&
      !entry.name.includes(".test.")
    ) {
      const source = fs.readFileSync(fullPath, "utf8");
      productionSources.push({ fullPath, source });
      for (const pattern of messageIdPatterns) {
        for (const match of source.matchAll(pattern)) {
          if (match[1].includes(".")) referencedMessageIds.add(match[1]);
        }
      }
    }
  }
};

qualityRoots.forEach(walk);

const isLanguageNeutral = (value) =>
  typeof value === "string" &&
  (/^[A-Z0-9+./%()_-]{1,18}$/.test(value) ||
    /^https?:\/\//.test(value) ||
    /^[{}0-9:./%_()\s+-]+$/.test(value));

const expectedQualityTerms = {
  "banner.menu.nonconformity": "不符合项管理",
  "banner.menu.nonconformity.dashboard": "不符合项台账",
  "banner.menu.nonconformity.report": "登记不符合项",
  "banner.menu.nonconformity.view": "待处理不符合项",
  "banner.menu.eqa": "室间质量评价",
  "analyzer.navigation.qc": "室内质量控制",
  "analyzer.navigation.qcDashboard": "室内质控工作台",
  "analyzer.navigation.qcAlerts": "质控失控预警",
  "banner.menu.alerts": "质量预警",
  "alerts.dashboard.title": "质量预警中心",
  "coldstorage.label.dashboard": "冰箱温度监控",
  "nce.dashboard.title": "不符合项台账",
  "eqa.management.title": "室间质量评价管理",
  "qc.dashboard.title": "室内质量控制工作台",
};

test("defines every statically referenced quality-page message", () => {
  const missing = [...referencedMessageIds]
    .flatMap((id) =>
      [
        ["en", en],
        ["zh", zh],
        ["zh-CN", zhCN],
      ]
        .filter(([, messages]) => !(id in messages))
        .map(([locale]) => `${locale}: ${id}`),
    )
    .sort();

  expect(missing).toEqual([]);
});

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China quality-management localization for %s", (_locale, messages) => {
  test("uses Chinese laboratory quality terminology", () => {
    expect(messages).toMatchObject(expectedQualityTerms);
  });

  test("translates every statically referenced operator-facing message", () => {
    const untranslated = [...referencedMessageIds]
      .filter((id) => id in en)
      .filter(
        (id) =>
          !(id in messages) ||
          (!isLanguageNeutral(en[id]) && messages[id] === en[id]),
      )
      .sort();

    expect(untranslated).toEqual([]);
  });
});

test("quality pages do not expose known English-only UI fragments", () => {
  const forbiddenFragments = [
    "Cold storage sections",
    "Corrective Actions</Tab>",
    "Historical Trends</Tab>",
    "Loading corrective actions",
    "NCE &gt; All NCEs",
    'SelectItem value="Pending" text="Open"',
    "Instrument detail tabs",
    "EQA Admin tabs",
    "Loading NCE data...",
    '{ text: "Last Name", value: "lastName" }',
    "Device History -",
    "Regulatory Reports",
    "System Configuration</Heading>",
    'modalHeading={editingDevice ? "Edit Device" : "Add New Device"}',
    '<Tag type="red">Critical</Tag>',
    '<SelectItem value="STANDARD" text="Standard" />',
    '<SelectItem value="URGENT" text="Urgent" />',
    '<SelectItem value="CRITICAL" text="Critical" />',
  ];
  const violations = productionSources.flatMap(({ fullPath, source }) =>
    forbiddenFragments
      .filter((fragment) => source.includes(fragment))
      .map(
        (fragment) => `${path.relative(componentRoot, fullPath)}: ${fragment}`,
      ),
  );

  expect(violations).toEqual([]);
});

test("quality pages rely on the complete catalogs instead of English fallbacks", () => {
  const violations = productionSources
    .filter(({ source }) => source.includes("defaultMessage"))
    .map(({ fullPath }) => path.relative(componentRoot, fullPath));

  expect(violations).toEqual([]);
});

const getMultilineJsxOpeningTags = (source, tagName) => {
  const lines = source.split("\n");
  const tags = [];
  const tagPattern = new RegExp(`<${tagName}(?:\\s|>|$)`);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!tagPattern.test(lines[lineIndex])) continue;

    const openingTag = [];
    for (let cursor = lineIndex; cursor < lines.length; cursor += 1) {
      openingTag.push(lines[cursor]);
      const trimmed = lines[cursor].trim();
      if (trimmed === ">" || trimmed === "/>" || /<[^>]+\/>$/.test(trimmed)) {
        break;
      }
    }
    tags.push({ line: lineIndex + 1, source: openingTag.join("\n") });
  }

  return tags;
};

test("localizes Carbon controls that otherwise expose English tooltips", () => {
  const requirements = [
    ["InlineNotification", ["statusIconDescription="]],
    ["Search", ["closeButtonLabelText="]],
    ["TableToolbarSearch", ["closeButtonLabelText="]],
    ["Modal", ["closeButtonLabel="]],
    ["ModalHeader", ["iconDescription="]],
  ];
  const violations = productionSources.flatMap(({ fullPath, source }) =>
    requirements.flatMap(([tagName, requiredProps]) =>
      getMultilineJsxOpeningTags(source, tagName).flatMap((tag) =>
        requiredProps
          .filter((requiredProp) => !tag.source.includes(requiredProp))
          .map(
            (requiredProp) =>
              `${path.relative(componentRoot, fullPath)}:${tag.line} <${tagName}> missing ${requiredProp}`,
          ),
      ),
    ),
  );

  const dismissibleNotificationViolations = productionSources.flatMap(
    ({ fullPath, source }) =>
      getMultilineJsxOpeningTags(source, "InlineNotification")
        .filter((tag) => !tag.source.includes("hideCloseButton"))
        .filter((tag) => !tag.source.includes("aria-label="))
        .map(
          (tag) =>
            `${path.relative(componentRoot, fullPath)}:${tag.line} <InlineNotification> missing aria-label=`,
        ),
  );

  expect([...violations, ...dismissibleNotificationViolations]).toEqual([]);
});
