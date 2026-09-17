import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertSafeRestoreDatabase,
  createRunner,
  metricsEqual,
  parseArgs,
} from "./openelis-cn-recovery.mjs";

test("CLI is inert without --run and requires an explicit local Docker selection", () => {
  assert.equal(parseArgs(["health"]).run, false);
  assert.throws(() => parseArgs(["health", "--run"]), /LOCAL_DOCKER/);
  assert.equal(
    parseArgs([
      "health",
      "--run",
      "--docker",
      "/usr/local/bin/docker",
      "--docker-socket",
      "/tmp/SIM-docker.sock",
    ]).dockerSocket,
    "/tmp/SIM-docker.sock",
  );
});

test("CLI rejects remote endpoints, relative paths, duplicate and unknown options", () => {
  for (const args of [
    [],
    ["delete"],
    ["health", "--docker-socket", "tcp://remote:2375"],
    ["health", "--docker", "docker"],
    ["health", "--run", "--run"],
    ["health", "--secret", "SIM"],
  ]) {
    assert.throws(() => parseArgs(args));
  }
});

test("write commands require explicit absolute artifacts", () => {
  const docker = [
    "--run",
    "--docker",
    "/usr/local/bin/docker",
    "--docker-socket",
    "/tmp/SIM-docker.sock",
  ];
  assert.throws(() => parseArgs(["backup", ...docker]), /OUTPUT_DIR/);
  assert.throws(
    () => parseArgs(["restore-drill", ...docker, "--output-dir", "/tmp/SIM"]),
    /BACKUP_AND_MANIFEST/,
  );
  assert.equal(
    parseArgs(["all", ...docker, "--output-dir", "/tmp/SIM"]).command,
    "all",
  );
});

test("restore database guard accepts only the generated isolated prefix", () => {
  assert.equal(
    assertSafeRestoreDatabase("openelis_o01_restore_20260917221530_123"),
    "openelis_o01_restore_20260917221530_123",
  );
  for (const name of [
    "clinlims",
    "postgres",
    "openelis_o01_restore_",
    "openelis_o01_restore_x;drop database clinlims",
    "OPENELIS_O01_RESTORE_1",
  ]) {
    assert.throws(
      () => assertSafeRestoreDatabase(name),
      /UNSAFE_RESTORE_DATABASE/,
    );
  }
});

test("restore metrics require all structural counters to match exactly", () => {
  const baseline = {
    tableCount: 380,
    columnCount: 4100,
    constraintCount: 800,
    changesetCount: 846,
  };
  assert.equal(metricsEqual(baseline, { ...baseline }), true);
  assert.equal(
    metricsEqual(baseline, { ...baseline, changesetCount: 845 }),
    false,
  );
  assert.equal(
    metricsEqual(baseline, { ...baseline, columnCount: "4100" }),
    false,
  );
  assert.equal(metricsEqual({}, {}), false);
});

test("runner never invokes a shell, bounds time and strips Docker overrides", () => {
  let invocation;
  const runner = createRunner((command, args, options) => {
    invocation = { command, args, options };
    return { status: 0, stdout: "SIM", stderr: "" };
  });
  assert.equal(runner("/tmp/SIM docker", ["exec", "SIM container"]), "SIM");
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.timeout, 15 * 60 * 1000);
  assert.deepEqual(invocation.options.env, {
    PATH: "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
  });
  assert.deepEqual(invocation.args, ["exec", "SIM container"]);
});

test("test cleanup removes only its own SIM directory", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "SIM-openelis-o01-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.ok(directory.startsWith(os.tmpdir()));
});
