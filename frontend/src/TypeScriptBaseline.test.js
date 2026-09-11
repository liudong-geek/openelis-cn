import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const gateSource = resolve("scripts/check-typescript-baseline.mjs");
const diagnostic = "src/SIM-patient.ts(1,2): error TS2322: SIM type mismatch.";
const baseline = {
  version: 1,
  total: 2,
  diagnostics: { "src/SIM-patient.ts": { TS2322: 2 } },
};
const fixtures = [];

// Run the real gate CLI, not a mock of its classification/comparison logic.
// Only its compiler collaborator is a SIM child process in an owned directory.
function runGate({
  stdout = "",
  stderr = "",
  status = 0,
  signal,
  missingCompiler = false,
  baselineValue = baseline,
  realCompiler = false,
} = {}) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "SIM-lis-typescript-gate-")),
  );
  fixtures.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  copyFileSync(
    gateSource,
    join(root, "scripts", "check-typescript-baseline.mjs"),
  );
  writeFileSync(
    join(root, "typescript-error-baseline.json"),
    JSON.stringify(baselineValue),
  );
  if (realCompiler) {
    symlinkSync(
      realpathSync(resolve("node_modules/.bin/tsc")),
      join(root, "node_modules", ".bin", "tsc"),
    );
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "SIM-patient.ts"),
      realCompiler === "type-error"
        ? 'const simValue: number = "SIM";'
        : "const simValue: number = 1;",
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, types: [] },
        files: [
          realCompiler === "global-error"
            ? "src/SIM-missing.ts"
            : "src/SIM-patient.ts",
        ],
      }),
    );
  } else if (!missingCompiler) {
    writeFileSync(
      join(root, "node_modules", ".bin", "tsc"),
      `#!${process.execPath}
const fs = require("node:fs");
fs.writeFileSync("SIM-invocation.json", JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));
fs.writeSync(1, ${JSON.stringify(stdout)});
fs.writeSync(2, ${JSON.stringify(stderr)});
${signal ? `process.kill(process.pid, ${JSON.stringify(signal)});` : `process.exit(${status});`}
`,
      { mode: 0o700 },
    );
  }
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "check-typescript-baseline.mjs")],
    { cwd: tmpdir(), encoding: "utf8", timeout: 5000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return { ...result, root, output: result.stdout + result.stderr };
}

afterEach(() => {
  // Delete only the exact SIM temporary directories created by this test.
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true });
});

describe("类型基线门禁的真实CLI边界", () => {
  test("无诊断正常结束可以通过，编译目录及非彩色参数明确", () => {
    const result = runGate();
    expect(result.status).toBe(0);
    expect(result.output).toContain("0 current diagnostics");
    expect(
      JSON.parse(
        readFileSync(join(result.root, "SIM-invocation.json"), "utf8"),
      ),
    ).toEqual({ args: ["--noEmit", "--pretty", "false"], cwd: result.root });
  });

  test.each([1, 2])("退出%s且只有基线内诊断时仅通过增量比较", (status) => {
    const result = runGate({ status, stdout: diagnostic });
    expect(result.status).toBe(0);
    expect(result.output).toContain("1 current diagnostics");
    expect(result.output).toContain("full type check still fails");
  });

  test("多行说明和CRLF不增加诊断计数，等于基线可以通过", () => {
    const result = runGate({
      status: 2,
      stdout: `${diagnostic}\r\n  SIM nested type explanation.\r\n${diagnostic}\r\n`,
    });
    expect(result.status).toBe(0);
    expect(result.output).toContain("2 current diagnostics");
  });

  test("合法零基线与零诊断可以通过", () => {
    const result = runGate({
      baselineValue: { version: 1, total: 0, diagnostics: {} },
    });
    expect(result.status).toBe(0);
    expect(result.output).toContain("0 current diagnostics, 0 baseline");
  });

  test.each([
    ["缺少计数字典", { version: 1, total: 0 }],
    ["总数非法", { ...baseline, total: -1 }],
    [
      "字符串计数",
      { ...baseline, diagnostics: { "src/SIM-patient.ts": { TS2322: "NaN" } } },
    ],
    [
      "小数计数",
      { ...baseline, diagnostics: { "src/SIM-patient.ts": { TS2322: 1.5 } } },
    ],
    [
      "空计数",
      { ...baseline, diagnostics: { "src/SIM-patient.ts": { TS2322: null } } },
    ],
    ["总数与明细不符", { ...baseline, total: 3 }],
    ["未知基线版本", { ...baseline, version: 2 }],
  ])("%s不能当合法比较依据，且不启动编译器", (_name, baselineValue) => {
    const result = runGate({ baselineValue });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid TypeScript baseline");
    expect(result.output).not.toContain("gate passed");
    expect(existsSync(join(result.root, "SIM-invocation.json"))).toBe(false);
  });

  test.each([
    ["编译器不存在", { missingCompiler: true }],
    ["进程被信号终止", { signal: "SIGTERM" }],
    ["输出已有诊断后被信号终止", { signal: "SIGTERM", stdout: diagnostic }],
    ["退出1但没有诊断", { status: 1 }],
    ["退出2但没有诊断", { status: 2 }],
    ["异常退出但没有诊断", { status: 7 }],
    ["项目失败不能靠已有诊断放行", { status: 3, stdout: diagnostic }],
    ["引用循环不能靠已有诊断放行", { status: 4, stdout: diagnostic }],
    ["运行错误不能靠已有诊断放行", { status: 9, stdout: diagnostic }],
    ["成功状态却输出错误", { status: 0, stdout: diagnostic }],
    ["无文件全局错误", { status: 1, stdout: "error TS18003: SIM no inputs." }],
    [
      "全局错误不能被成功状态掩盖",
      { stdout: "error TS5083: SIM missing config." },
    ],
    [
      "已有诊断后夹带全局错误",
      {
        status: 2,
        stdout: `${diagnostic}\nerror TS2318: SIM missing global type.`,
      },
    ],
    [
      "全局错误后夹带已有诊断",
      {
        status: 2,
        stdout: `error TS2318: SIM missing global type.\n${diagnostic}`,
      },
    ],
    [
      "错误流有运行失败",
      { status: 2, stdout: diagnostic, stderr: "SIM compiler crash" },
    ],
    [
      "未知格式错误不能忽略",
      {
        status: 2,
        stdout: "src/SIM-patient.ts:1:2 - error TS2322: SIM mismatch.",
      },
    ],
    [
      "成功退出的未知输出不能算完成检查",
      { stdout: "SIM compiler did not check types" },
    ],
    [
      "已有诊断后的未知输出不能忽略",
      { status: 2, stdout: `${diagnostic}\nSIM compiler failed` },
    ],
  ])("%s必须拒绝而非显示通过", (_name, scenario) => {
    const result = runGate(scenario);
    expect(result.status).toBe(1);
    expect(result.output).not.toContain("gate passed");
    expect(result.stderr.trim()).not.toBe("");
  });

  test.each([
    ["原文件诊断数增加", `${diagnostic}\n${diagnostic}\n${diagnostic}`],
    ["出现新文件", diagnostic.replace("SIM-patient.ts", "SIM-other.ts")],
    ["出现新错误类型", diagnostic.replace("TS2322", "TS7006")],
  ])("%s仍由原基线比较拒绝", (_name, stdout) => {
    const result = runGate({ status: 2, stdout });
    expect(result.status).toBe(1);
    expect(result.output).toContain("New diagnostics were introduced");
    expect(result.output).toContain("baseline");
    expect(result.output).not.toContain("gate passed");
  });

  test.each([
    ["clean", 0, "0 current diagnostics"],
    ["type-error", 0, "full type check still fails"],
    ["global-error", 1, "global diagnostics or unrecognized compiler output"],
  ])(
    "实际安装的TypeScript检查隔离SIM工程：%s",
    (realCompiler, status, message) => {
      const result = runGate({ realCompiler });
      expect(result.status).toBe(status);
      expect(result.output).toContain(message);
      if (status !== 0) expect(result.output).not.toContain("gate passed");
    },
  );
});
