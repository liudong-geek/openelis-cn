import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const baselinePath = path.join(frontendRoot, "typescript-error-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
let baselineTotal = 0;
const validBaseline =
  isRecord(baseline) &&
  baseline.version === 1 &&
  isCount(baseline.total) &&
  isRecord(baseline.diagnostics) &&
  Object.entries(baseline.diagnostics).every(([fileName, codes]) => {
    if (!fileName.trim() || !isRecord(codes)) return false;
    return Object.entries(codes).every(([code, count]) => {
      if (!/^TS\d+$/.test(code) || !isCount(count)) return false;
      baselineTotal += count;
      return Number.isSafeInteger(baselineTotal);
    });
  }) &&
  baselineTotal === baseline.total;

if (!validBaseline) {
  console.error(
    "Invalid TypeScript baseline: expected version 1 and exact non-negative integer counts.",
  );
  process.exit(1);
}

const tscPath = path.join(frontendRoot, "node_modules", ".bin", "tsc");
const result = spawnSync(tscPath, ["--noEmit", "--pretty", "false"], {
  cwd: frontendRoot,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});

const output = `${result.stdout || ""}\n${result.stderr || ""}`;
const failIncompleteCheck = (reason) => {
  console.error(
    `TypeScript regression gate could not verify the check: ${reason}`,
  );
  if (output.trim()) console.error(output.trim());
  process.exit(1);
};

if (result.error) {
  failIncompleteCheck(`Unable to run TypeScript: ${result.error.message}`);
}

// 1 and 2 are TypeScript's diagnostic exits, not proof of a complete check.
// A killed/crashed compiler must never look like a reduction in type errors.
if (result.signal || ![0, 1, 2].includes(result.status)) {
  failIncompleteCheck(
    `compiler status ${result.status}, signal ${result.signal || "none"}`,
  );
}
if (result.stderr?.trim()) {
  failIncompleteCheck("compiler wrote unexpected error-stream output");
}

const current = Object.create(null);
const unrecognized = [];
let currentTotal = 0;
for (const line of (result.stdout || "").split(/\r?\n/)) {
  const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+):/);
  if (!match) {
    // Plain tsc diagnostics can have indented continuation lines. Global
    // errors, unknown formats and orphan output cannot be silently discarded.
    if (
      line.trim() &&
      (/\berror\s+TS\d+:/.test(line) || !/^\s/.test(line) || currentTotal === 0)
    )
      unrecognized.push(line);
    continue;
  }
  currentTotal += 1;
  const [, fileName, code] = match;
  current[fileName] ??= {};
  current[fileName][code] = (current[fileName][code] || 0) + 1;
}

if (unrecognized.length) {
  failIncompleteCheck("global diagnostics or unrecognized compiler output");
}
if ((result.status === 0) !== (currentTotal === 0)) {
  failIncompleteCheck("compiler exit status and parsed diagnostics disagree");
}

const regressions = [];
for (const [fileName, codes] of Object.entries(current)) {
  for (const [code, count] of Object.entries(codes)) {
    const allowed = baseline.diagnostics?.[fileName]?.[code] || 0;
    if (count > allowed) {
      regressions.push(`${fileName} ${code}: ${count} (baseline ${allowed})`);
    }
  }
}

if (regressions.length) {
  console.error(
    "TypeScript regression gate failed. New diagnostics were introduced:",
  );
  console.error(regressions.join("\n"));
  process.exit(1);
}

console.log(
  `TypeScript regression gate passed: ${currentTotal} current diagnostics, ${baseline.total} baseline. No file/diagnostic class increased.`,
);
if (currentTotal > 0) {
  console.log("Baseline comparison only; the full type check still fails.");
}
