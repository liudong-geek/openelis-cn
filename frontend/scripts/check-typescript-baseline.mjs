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
const tscPath = path.join(frontendRoot, "node_modules", ".bin", "tsc");
const result = spawnSync(tscPath, ["--noEmit"], {
  cwd: frontendRoot,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});

if (result.error) {
  console.error(`Unable to run TypeScript: ${result.error.message}`);
  process.exit(1);
}

const output = `${result.stdout || ""}\n${result.stderr || ""}`;
const current = {};
let currentTotal = 0;
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+):/);
  if (!match) continue;
  currentTotal += 1;
  const [, fileName, code] = match;
  current[fileName] ??= {};
  current[fileName][code] = (current[fileName][code] || 0) + 1;
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
