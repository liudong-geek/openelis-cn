import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const patientCalendar = "./src/components/common/CustomDatePicker.test.jsx";
const nceCalendar =
  "./src/components/nonconform/common/NceCalendar.locale.test.jsx";

// All inputs are checked before any tool runs. Real paths also prevent symlink
// escapes; positional arguments are passed literally, without shell expansion.
export function run(argv, { root = frontendRoot, execute = spawnSync } = {}) {
  const [mode, ...inputs] = argv;
  if (!["test", "format", "check-format"].includes(mode) || !inputs.length) {
    throw new Error(
      "Specify a mode (test, format, check-format) and explicit existing files.",
    );
  }
  const base = realpathSync(root);
  const files = [
    ...new Set(
      inputs.map((input) => {
        if (!input || input.startsWith("-") || /[*?\[\]{}\0\r\n]/.test(input)) {
          throw new Error(
            `Options and glob patterns are not accepted: ${input}`,
          );
        }
        const file = realpathSync(path.resolve(base, input));
        const relative = path.relative(base, file);
        if (
          !relative ||
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative) ||
          !statSync(file).isFile()
        ) {
          throw new Error(`Expected a file inside frontend: ${input}`);
        }
        if (mode === "test" && !/\.test\.[cm]?[jt]sx?$/.test(relative)) {
          throw new Error(
            `Expected an explicit .test.js/jsx/ts/tsx file: ${input}`,
          );
        }
        return `./${relative.split(path.sep).join("/")}`;
      }),
    ),
  ];

  const commands = [];
  if (mode === "test") {
    const ordinary = files.filter((file) => file !== nceCalendar);
    if (ordinary.length) commands.push(["run", "--maxWorkers=2", ...ordinary]);
    if (files.includes(patientCalendar))
      commands.push([
        "run",
        "--maxWorkers=2",
        "--config",
        "vitest.patient-calendar.config.ts",
        patientCalendar,
      ]);
    if (files.includes(nceCalendar))
      commands.push([
        "run",
        "--maxWorkers=2",
        "--config",
        "vitest.nce-calendar.config.ts",
        nceCalendar,
      ]);
  } else {
    commands.push([mode === "format" ? "--write" : "--check", ...files]);
  }
  const executable = path.join(
    base,
    "node_modules",
    mode === "test" ? "vitest/vitest.mjs" : "prettier/bin/prettier.cjs",
  );
  for (const args of commands) {
    const result = execute(process.execPath, [executable, ...args], {
      cwd: base,
      stdio: "inherit",
      shell: false,
    });
    if (result.error) throw result.error;
    if (
      result.signal ||
      result.status === null ||
      result.status === undefined
    ) {
      throw new Error(
        `Check did not complete (${result.signal || "no exit status"}).`,
      );
    }
    if (result.status !== 0) return result.status;
  }
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
