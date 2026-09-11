import { statSync } from "node:fs";
import { resolve } from "node:path";
import { getFileInfo } from "prettier";

const frontendRoot = process.cwd();
const ignorePath = resolve(frontendRoot, ".prettierignore");

// Exercise the installed formatter and the real project rules, without
// formatting source files or creating generated/vendor fixtures.
const inspect = (file) =>
  getFileInfo(resolve(frontendRoot, file), {
    ignorePath,
    resolveConfig: false,
    withNodeModules: true,
  });

describe("交付格式检查范围", () => {
  test.each([
    "src/components/reports/auditTrailReport/SystemAuditEvents.jsx",
    "src/components/reports/auditTrailReport/SystemAuditEvents.patientScope.test.jsx",
    "src/components/reports/reportDateUtils.js",
  ])("报告源码不能被生成报告目录的规则跳过：%s", async (file) => {
    expect(statSync(resolve(frontendRoot, file)).isFile()).toBe(true);
    const info = await inspect(file);
    expect(info.ignored).toBe(false);
    expect(info.inferredParser).not.toBeNull();
  });

  // SIM path strings only: no output, authentication data or packages are read.
  test.each([
    "reports/SIM-format-output.json",
    "node_modules/SIM-format-vendor/index.js",
    "dist/SIM-format-bundle.js",
    "build/SIM-format-bundle.js",
    "coverage/SIM-format-coverage.json",
    "public/SIM-format-asset.js",
    "playwright-report/SIM-format-report.json",
    "test-results/SIM-format-result.json",
    "playwright/.auth/SIM-format-session.json",
    "src/components/reports/SIM-format-generated.min.js",
    "SIM-format-output.log",
  ])("仍然排除生成、第三方和认证产物：%s", async (file) => {
    const info = await inspect(file);
    expect(info.ignored).toBe(true);
  });
});
