import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { run } from "./check-feature.mjs";

const cleanups = [];
afterEach(() => {
  for (const directory of cleanups.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture(files = []) {
  const parent = mkdtempSync(path.join(os.tmpdir(), "lis-feature-check-"));
  cleanups.push(parent);
  mkdirSync(path.join(parent, "frontend"));
  const root = realpathSync(path.join(parent, "frontend"));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), "// fixture\n");
  }
  const calls = [];
  const execute = (...args) => {
    calls.push(args);
    return { status: 0 };
  };
  return { parent, root, calls, execute };
}
const basic = "src/example.test.jsx";
const datePicker = "src/components/common/CustomDatePicker.test.jsx";
const nce = "src/components/nonconform/common/NceCalendar.locale.test.jsx";

test("test mode requires existing explicit test files and validates the whole request before execution", () => {
  const f = fixture([basic, "src/example.jsx"]);
  for (const files of [
    [],
    ["--watch"],
    ["--passWithNoTests"],
    ["src"],
    ["src/*.test.jsx"],
    ["src/example.jsx"],
    ["src/missing.test.jsx"],
    [basic, "--config=other.ts"],
  ]) {
    assert.throws(() => run(["test", ...files], f));
  }
  assert.equal(f.calls.length, 0);
});

test("rejects outside paths and symlinks escaping the frontend", () => {
  const f = fixture([basic]);
  const outside = path.join(f.parent, "outside.test.jsx");
  writeFileSync(outside, "// outside\n");
  symlinkSync(outside, path.join(f.root, "src/escape.test.jsx"));
  for (const file of [outside, "../outside.test.jsx", "src/escape.test.jsx"]) {
    assert.throws(() => run(["test", file], f));
  }
  assert.equal(f.calls.length, 0);
});

test("ordinary tests use bounded Vitest with de-duplicated literal file arguments and no shell", () => {
  const spaced = "src/has space.test.tsx";
  const f = fixture([basic, spaced]);
  assert.equal(
    run(["test", basic, `./${basic}`, path.join(f.root, spaced)], f),
    0,
  );
  assert.deepEqual(f.calls, [
    [
      process.execPath,
      [
        path.join(f.root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--maxWorkers=2",
        `./${basic}`,
        `./${spaced}`,
      ],
      { cwd: f.root, stdio: "inherit", shell: false },
    ],
  ]);
});

test("calendar files keep real-vendor configurations and the date picker also runs the normal configuration", () => {
  const f = fixture([basic, datePicker, nce]);
  assert.equal(run(["test", basic, datePicker, nce], f), 0);
  assert.deepEqual(
    f.calls.map(([, args]) => args.slice(1)),
    [
      ["run", "--maxWorkers=2", `./${basic}`, `./${datePicker}`],
      [
        "run",
        "--maxWorkers=2",
        "--config",
        "vitest.patient-calendar.config.ts",
        `./${datePicker}`,
      ],
      [
        "run",
        "--maxWorkers=2",
        "--config",
        "vitest.nce-calendar.config.ts",
        `./${nce}`,
      ],
    ],
  );
  const solo = fixture([nce]);
  run(["test", nce], solo);
  assert.equal(solo.calls.length, 1);
  assert.ok(solo.calls[0][1].includes("vitest.nce-calendar.config.ts"));
});

test("a failing group stops later groups and preserves its failure status", () => {
  const f = fixture([datePicker, nce]);
  f.execute = (...args) => {
    f.calls.push(args);
    return { status: 7 };
  };
  assert.equal(run(["test", datePicker, nce], f), 7);
  assert.equal(f.calls.length, 1);
});

test("process launch failures and signals cannot report success", () => {
  const f = fixture([basic]);
  assert.throws(
    () =>
      run(["test", basic], {
        ...f,
        execute: () => ({ error: new Error("launch failed") }),
      }),
    /launch failed/,
  );
  assert.throws(
    () =>
      run(["test", basic], {
        ...f,
        execute: () => ({ status: null, signal: "SIGTERM" }),
      }),
    /SIGTERM/,
  );
});

test("format modes accept only explicit files and never invoke repository-wide formatting", () => {
  const f = fixture(["src/example.jsx", "package.json"]);
  for (const mode of ["format", "check-format"]) {
    assert.equal(run([mode, "src/example.jsx", "package.json"], f), 0);
    assert.throws(() => run([mode], f));
    assert.throws(() => run([mode, "src"], f));
    assert.throws(() => run([mode, "--write"], f));
    assert.throws(() => run([mode, "../outside.js"], f));
  }
  assert.deepEqual(
    f.calls.map(([, args]) => args.slice(1)),
    [
      ["--write", "./src/example.jsx", "./package.json"],
      ["--check", "./src/example.jsx", "./package.json"],
    ],
  );
  assert.throws(() => run(["unknown", "package.json"], f));
});
