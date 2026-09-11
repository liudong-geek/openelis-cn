import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  FILE_MANIFEST,
  createProbes,
  inspectPath,
  parseArgs,
  probeHttp,
  runReadiness,
  summarize,
} from "./check-delivery-readiness.mjs";

const script = new URL("./check-delivery-readiness.mjs", import.meta.url);
const success = (stdout) => ({ status: 0, stdout, stderr: "" });
const temporary = (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "SIM-lis-readiness-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

test("CLI defaults to usage and rejects unapproved options, repeats and unsafe paths", () => {
  assert.equal(parseArgs([]).run, false);
  assert.equal(parseArgs(["--run"]).run, true);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["--run", "--maven-repo", "/tmp/SIM cache"]).mavenRepo, "/tmp/SIM cache");
  for (const args of [
    ["--run", "--run"], ["--base-url", "https://example.org"],
    ["--docker-socket", "tcp://remote:2375"], ["--java", "relative/java"],
    ["--maven-repo"], ["--maven-repo", "/tmp/SIM\nsecret"],
  ]) assert.throws(() => parseArgs(args));
});

test("default CLI prints only usage without attempting an environment probe", () => {
  const result = spawnSync(process.execPath, [script.pathname], {
    encoding: "utf8", timeout: 5000, env: { PATH: "/SIM-no-programs" },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--run/);
  assert.doesNotMatch(result.stdout, /"checks"|"outcome"/);
  assert.equal(result.stderr, "");
});

test("without run confirmation none of the injected probes can execute", async () => {
  let calls = 0;
  const probes = new Proxy({}, { get() { calls += 1; throw new Error("SIM probe forbidden"); } });
  await assert.rejects(runReadiness({ run: false }, { probes }));
  assert.equal(calls, 0);
});

test("real SIM files distinguish nonempty, empty, missing, directory and symlink metadata", (t) => {
  const root = temporary(t);
  const file = path.join(root, "SIM-file");
  writeFileSync(file, "SIM only, not a clinical record");
  writeFileSync(path.join(root, "SIM-empty"), "");
  symlinkSync(file, path.join(root, "SIM-link"));
  const probes = createProbes();
  const observed = [file, path.join(root, "SIM-empty"), path.join(root, "SIM-absent"), root, path.join(root, "SIM-link")]
    .map((target) => inspectPath(target, probes));
  if (process.platform === "darwin") {
    assert.deepEqual(observed.map((result) => result.reason), [
      "LOCAL_METADATA_PRESENT", "EMPTY_FILE", "MISSING", "WRONG_FILE_TYPE", "SYMLINK_NOT_FOLLOWED",
    ]);
    assert.equal(observed[0].status, "PASS");
    assert.ok(observed[0].bytes > 0);
  } else {
    assert.ok(observed.every((result) => result.status === "UNKNOWN"));
    assert.ok(observed.every((result) => result.reason === "UNSUPPORTED_METADATA_PLATFORM"));
  }
});

test("dataless numeric flag blocks without reading or executing the target", () => {
  const calls = [];
  const probes = createProbes({ platform: "darwin", spawn(command, args, options) {
    calls.push({ command, args, options });
    return success("100644 33731 1073741920\n");
  } });
  const result = inspectPath("/tmp/SIM-cloud", probes);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "CLOUD_PLACEHOLDER");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "/usr/bin/stat");
  assert.deepEqual(calls[0].args, ["-f", "%p %z %f", "/tmp/SIM-cloud"]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.timeout, 3000);
});

test("unsupported platform, malformed metadata, permissions and timeout cannot become PASS", () => {
  const unsupported = createProbes({ platform: "linux", spawn() { throw new Error("must not run"); } });
  assert.equal(inspectPath("/tmp/SIM", unsupported).reason, "UNSUPPORTED_METADATA_PLATFORM");
  for (const response of [
    success("secret metadata"), success("100644 NaN 0"),
    { status: 1, stdout: "", stderr: "stat: SIM: Permission denied private" },
    { status: null, error: { code: "ETIMEDOUT" }, stdout: "secret", stderr: "private" },
  ]) {
    const probes = createProbes({ platform: "darwin", spawn: () => response });
    const result = inspectPath("/tmp/SIM", probes);
    assert.equal(result.status, "UNKNOWN");
    assert.doesNotMatch(JSON.stringify(result), /secret|private/);
  }
});

test("version commands have bounded output and do not inherit Java, Docker or proxy overrides", () => {
  let invocation;
  const probes = createProbes({ environment: {
    PATH: "/usr/bin", JAVA_TOOL_OPTIONS: "secret", JDK_JAVA_OPTIONS: "secret",
    DOCKER_HOST: "tcp://remote:2375", DOCKER_CONTEXT: "production", HTTPS_PROXY: "private",
  }, spawn(command, args, options) { invocation = { command, args, options }; return success("SIM"); } });
  probes.command("SIM", ["--version"]);
  assert.deepEqual(invocation.options.env, { PATH: "/usr/bin", LANG: "C", LC_ALL: "C" });
  assert.equal(invocation.options.timeout, 3000);
  assert.equal(invocation.options.maxBuffer, 65536);
  assert.equal(invocation.options.killSignal, "SIGKILL");
  assert.equal(invocation.options.shell, false);
});

const httpHarness = (statusCode, behavior = "response") => {
  const calls = [];
  const request = (options, callback) => {
    const req = new EventEmitter();
    req.destroy = () => { req.destroyed = true; };
    req.end = () => queueMicrotask(() => {
      if (behavior === "error") req.emit("error", Object.assign(new Error("SIM private response"), { code: "EPERM" }));
      else if (behavior === "response") {
        const response = { statusCode, headers: { location: "https://secret.example", "set-cookie": "private" }, destroy() { this.destroyed = true; } };
        calls[0].response = response;
        callback(response);
      }
    });
    calls.push({ options, req });
    return req;
  };
  return { request, calls };
};

test("HTTP sends one fixed anonymous HEAD and discards response without redirect or body reads", async () => {
  for (const status of [200, 302, 401, 500]) {
    const harness = httpHarness(status);
    const result = await probeHttp({ request: harness.request, timeoutMs: 50 });
    assert.equal(result.status, status === 200 ? "PASS" : "BLOCKED");
    assert.equal(result.httpStatus, status);
    assert.equal(harness.calls.length, 1);
    assert.deepEqual(harness.calls[0].options, {
      hostname: "127.0.0.1", port: 18080, path: "/login", method: "HEAD", agent: false,
      headers: { Accept: "text/html", Connection: "close" },
    });
    assert.equal(harness.calls[0].response.destroyed, true);
    assert.doesNotMatch(JSON.stringify(result), /secret|private|set-cookie/);
  }
});

test("HTTP transport and deadline failures are sanitized UNKNOWN, with no retry", async () => {
  for (const behavior of ["error", "hang"]) {
    const harness = httpHarness(200, behavior);
    const result = await probeHttp({ request: harness.request, timeoutMs: 10 });
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.reason, behavior === "hang" ? "TIMEOUT" : "TRANSPORT_UNAVAILABLE");
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].req.destroyed, true);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

const syntheticProbes = (overrides = {}) => createProbes({
  platform: "darwin", nodeVersion: "v25.6.1", environment: { PATH: "/usr/bin" },
  request: httpHarness(200).request,
  spawn(command, args) {
    if (command === "/usr/bin/stat") {
      const target = args.at(-1);
      if (target.endsWith("/objects/pack")) return success("40755 64 0\n");
      if (target.endsWith("docker.sock")) return success("140600 0 0\n");
      return success("100755 23 0\n");
    }
    if (command === "/bin/ls") return success(".\n..\npack-" + "a".repeat(40) + ".pack\n");
    if (command === "/usr/bin/which") return success(`/usr/bin/${args[0]}\n`);
    if (command === "/usr/bin/java") return { ...success(""), stderr: 'openjdk version "21.0.2" 2024-01-16\n' };
    if (command === "/usr/bin/docker") return success("28.1.0\n");
    throw new Error("Unexpected SIM invocation");
  },
  ...overrides,
});

test("healthy limited probe report still denies build, full-source and delivery verification", async () => {
  const report = await runReadiness(parseArgs(["--run", "--maven-repo", "/tmp/SIM-maven"]), {
    root: "/tmp/SIM-repo", probes: syntheticProbes(),
  });
  assert.equal(report.outcome, "NO_PROBE_BLOCKERS_FOUND");
  assert.equal(report.checks.length, FILE_MANIFEST.length + 6);
  assert.deepEqual(report.checks.filter((check) => check.id.startsWith("runtime:")).map((check) => check.id),
    ["runtime:node", "runtime:java", "runtime:docker"]);
  assert.equal(report.assurance.fullSourceAvailable, "NOT_VERIFIED");
  assert.equal(report.assurance.buildable, "NOT_VERIFIED");
  assert.equal(report.assurance.deliverable, "NOT_VERIFIED");
  assert.equal(report.scope, "LIMITED_LOCAL_ENVIRONMENT_OBSERVATION");
  assert.equal(report.selected.dockerEndpoint, "unix:///var/run/docker.sock");
});

test("real SIM manifest missing and empty files make the overall report non-green", async (t) => {
  const root = temporary(t);
  for (const target of FILE_MANIFEST) {
    const full = path.join(root, target);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, "SIM placeholder content");
  }
  writeFileSync(path.join(root, "pom.xml"), "");
  rmSync(path.join(root, "frontend/package-lock.json"));
  const probes = syntheticProbes({ spawn(command, args, options) {
    if (command === "/usr/bin/stat" && args.at(-1).startsWith(root)) return spawnSync(command, args, options);
    if (command === "/usr/bin/which") return { status: 1, stdout: "", stderr: "" };
    throw new Error("SIM unexpected executable");
  } });
  const report = await runReadiness(parseArgs(["--run"]), { root, probes });
  if (process.platform === "darwin") {
    assert.equal(report.outcome, "BLOCKED");
    assert.equal(report.checks.find((check) => check.id === "file:pom.xml").reason, "EMPTY_FILE");
    assert.equal(report.checks.find((check) => check.id === "file:frontend/package-lock.json").reason, "MISSING");
  } else assert.notEqual(report.outcome, "NO_PROBE_BLOCKERS_FOUND");
  assert.ok(report.checks.some((check) => check.reason === "MAVEN_REPO_NOT_SELECTED"));
});

test("Git pack placeholders and enumeration failure are blockers or UNKNOWN without Git content reads", async () => {
  const base = syntheticProbes();
  for (const mode of ["cloud", "listing-failed", "listing-limit"]) {
    const calls = [];
    const probes = { ...base, command(command, args) {
      calls.push({ command, args });
      if (command === "/bin/ls") {
        if (mode === "listing-failed") return { status: 1, stdout: "secret", stderr: "private" };
        if (mode === "listing-limit") return success(Array.from({ length: 65 }, (_, i) => `pack-${i.toString(16).padStart(40, "0")}.pack`).join("\n"));
      }
      if (mode === "cloud" && command === "/usr/bin/stat" && args.at(-1).endsWith(".pack")) return success("100444 999 1073741824\n");
      return base.command(command, args);
    } };
    const report = await runReadiness(parseArgs(["--run", "--maven-repo", "/tmp/SIM"]), { root: "/tmp/SIM-repo", probes });
    assert.notEqual(report.outcome, "NO_PROBE_BLOCKERS_FOUND");
    assert.ok(report.checks.some((check) => check.reason === ({ cloud: "CLOUD_PLACEHOLDER", "listing-failed": "PACK_ENUMERATION_FAILED", "listing-limit": "PACK_SCAN_LIMIT" })[mode]));
    assert.ok(calls.every(({ command }) => !/\bgit$|cat$|head$/.test(command)));
    assert.doesNotMatch(JSON.stringify(report), /secret|private/);
  }
});

test("wrong Java, missing local Docker endpoint and absent runtime output cannot pass", async () => {
  const base = syntheticProbes();
  const calls = [];
  const probes = { ...base, command(command, args) {
    calls.push({ command, args });
    if (command === "/usr/bin/java") return { ...success(""), stderr: 'openjdk version "17.0.9"\n' };
    if (command === "/usr/bin/stat" && args.at(-1).endsWith("docker.sock")) return { status: 1, stdout: "", stderr: "stat: No such file or directory" };
    return base.command(command, args);
  } };
  const report = await runReadiness(parseArgs(["--run"]), { root: "/tmp/SIM", probes });
  assert.equal(report.checks.find((check) => check.id === "runtime:java").reason, "JAVA_21_REQUIRED");
  assert.equal(report.checks.find((check) => check.id === "runtime:docker").reason, "SELECTED_SOCKET_UNAVAILABLE");
  assert.equal(report.checks.find((check) => check.id === "runtime:docker").status, "UNKNOWN");
  assert.ok(!calls.some(({ command }) => command === "/usr/bin/docker"));
  assert.equal(report.outcome, "BLOCKED");
});

test("Java 21 initial release and patch releases are recognized without accepting Java 17", async () => {
  for (const version of ["21", "21.0.9", "17"]) {
    const base = syntheticProbes();
    const probes = {
      ...base,
      command(command, args) {
        if (command === "/usr/bin/java")
          return {
            ...success(""),
            stderr: `openjdk version "${version}" 2023-09-19\n`,
          };
        return base.command(command, args);
      },
    };
    const report = await runReadiness(
      parseArgs(["--run", "--maven-repo", "/tmp/SIM"]),
      { root: "/tmp/SIM", probes },
    );
    const java = report.checks.find((check) => check.id === "runtime:java");
    assert.equal(java.version, version);
    assert.equal(java.status, version === "17" ? "BLOCKED" : "PASS");
  }
});

test("Docker invocation selects only a local Unix endpoint and parses numeric server version", async () => {
  const base = syntheticProbes();
  const calls = [];
  const probes = { ...base, command(command, args) { calls.push({ command, args }); return base.command(command, args); } };
  const report = await runReadiness(parseArgs(["--run", "--docker-socket", "/tmp/SIM/docker.sock"]), { root: "/tmp/SIM", probes });
  assert.deepEqual(calls.find(({ command }) => command === "/usr/bin/docker").args,
    ["--host", "unix:///tmp/SIM/docker.sock", "version", "--format", "{{.Server.Version}}"]);
  assert.equal(report.checks.find((check) => check.id === "runtime:docker").version, "28.1.0");
});

test("unsupported Node and unrecognized or failing Java/Docker versions cannot produce green", async () => {
  for (const mode of ["node-old", "node-invalid", "java-invalid", "docker-invalid", "java-timeout", "docker-failed"]) {
    const base = syntheticProbes({ nodeVersion: mode === "node-old" ? "v18.20.0" : mode === "node-invalid" ? "SIM invalid" : "v25.6.1" });
    const probes = { ...base, command(command, args) {
      if (mode === "java-invalid" && command === "/usr/bin/java") return success("SIM secret build text");
      if (mode === "docker-invalid" && command === "/usr/bin/docker") return success("private.server.version");
      if (mode === "java-timeout" && command === "/usr/bin/java") return { status: null, error: { code: "ETIMEDOUT" }, stderr: "secret" };
      if (mode === "docker-failed" && command === "/usr/bin/docker") return { status: 1, stdout: "28.1.0", stderr: "private" };
      return base.command(command, args);
    } };
    const report = await runReadiness(parseArgs(["--run", "--maven-repo", "/tmp/SIM"]), { root: "/tmp/SIM", probes });
    assert.notEqual(report.outcome, "NO_PROBE_BLOCKERS_FOUND", mode);
    assert.doesNotMatch(JSON.stringify(report), /secret|private/);
  }
});

test("thrown process errors and cloud executable metadata are handled without running the executable", async () => {
  const errorProbes = createProbes({ platform: "darwin", spawn() { throw new Error("SIM secret"); } });
  assert.equal(inspectPath("/tmp/SIM", errorProbes).reason, "METADATA_FAILED");
  const base = syntheticProbes();
  const calls = [];
  const probes = { ...base, command(command, args) {
    calls.push(command);
    if (command === "/usr/bin/stat" && ["/usr/bin/java", "/usr/bin/docker"].includes(args.at(-1)))
      return success("100755 50 1073741824\n");
    return base.command(command, args);
  } };
  const report = await runReadiness(parseArgs(["--run"]), { root: "/tmp/SIM", probes });
  for (const id of ["runtime:java", "runtime:docker"])
    assert.equal(report.checks.find((check) => check.id === id).reason, "CLOUD_PLACEHOLDER");
  assert.ok(!calls.includes("/usr/bin/java"));
  assert.ok(!calls.includes("/usr/bin/docker"));
});

test("summary prioritizes actual blockers and never hides UNKNOWN or empty observations", () => {
  assert.equal(summarize([{ status: "PASS" }]), "NO_PROBE_BLOCKERS_FOUND");
  assert.equal(summarize([{ status: "PASS" }, { status: "UNKNOWN" }]), "INCOMPLETE");
  assert.equal(summarize([{ status: "UNKNOWN" }, { status: "BLOCKED" }]), "BLOCKED");
  assert.equal(summarize([]), "INCOMPLETE");
  assert.equal(summarize([{ status: "garbage" }]), "INCOMPLETE");
});
