#!/usr/bin/env node
/** Metadata-only environment observation; never a build or delivery approval. */
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 3000;
// Darwin sys/stat.h: SF_DATALESS. Do not infer cloud state from allocated blocks.
const SF_DATALESS = 0x40000000;
const MAX_PACK_FILES = 64;
const MAVEN_RESOURCE_POM =
  "org/apache/maven/plugins/maven-resources-plugin/2.6/maven-resources-plugin-2.6.pom";
const USAGE =
  "用法：node scripts/check-delivery-readiness.mjs --run [--maven-repo <绝对缓存目录>] [--java <绝对java路径>] [--docker-socket <绝对本机Unix套接字路径>]。不加 --run 只显示说明；不会修复、下载、构建、登录、部署或读取业务数据。默认仅检查选定本机 /var/run/docker.sock 和 http://127.0.0.1:18080/login 的匿名 HEAD。通过也不是全源码、构建或交付证明。";

// An explicit sentinel list, not a full source/dependency inventory.
export const FILE_MANIFEST = Object.freeze([
  "pom.xml",
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/vite.config.ts",
  "src/test/resources/testdata/external-connection.xml",
  "frontend/node_modules/vite/node_modules/picomatch/lib/parse.js",
  "frontend/node_modules/vitest/vitest.mjs",
  "scripts/check-auth-candidate.test.mjs",
  "scripts/check-intake-candidate.test.mjs",
  "src/main/java/org/openelisglobal/storage/service/StorageNoteAuditServiceImpl.java",
  "src/test/java/org/openelisglobal/storage/service/StorageNoteAuditIntegrationTest.java",
  "src/main/resources/liquibase/3.3.x.x/037-storage-note-audit-reference.xml",
  "frontend/src/components/reports/auditTrailReport/SystemAuditEvents.jsx",
  "frontend/src/components/reports/auditTrailReport/SystemAuditEvents.patientScope.test.jsx",
  ".git/HEAD",
  ".git/index",
]);

function absolutePath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value))
    throw new Error("INVALID_ARGUMENTS");
  return value;
}

export function parseArgs(args) {
  const options = {
    run: false,
    help: false,
    mavenRepo: null,
    java: null,
    dockerSocket: "/var/run/docker.sock",
  };
  const names = {
    "--maven-repo": "mavenRepo",
    "--java": "java",
    "--docker-socket": "dockerSocket",
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error("INVALID_ARGUMENTS");
    seen.add(arg);
    if (arg === "--run") options.run = true;
    else if (arg === "--help") options.help = true;
    else if (Object.hasOwn(names, arg))
      options[names[arg]] = absolutePath(args[++index]);
    else throw new Error("INVALID_ARGUMENTS");
  }
  return options;
}

export function createProbes({
  platform = process.platform,
  nodeVersion = process.version,
  nodeExecutable = process.execPath,
  environment = process.env,
  spawn = spawnSync,
  request = http.request,
} = {}) {
  return {
    platform,
    nodeVersion,
    nodeExecutable,
    request,
    command(command, args) {
      try {
        return spawn(command, args, {
          shell: false,
          encoding: "utf8",
          timeout: TIMEOUT_MS,
          maxBuffer: 65536,
          killSignal: "SIGKILL",
          env: {
            PATH: environment.PATH ?? "/usr/bin:/bin",
            LANG: "C",
            LC_ALL: "C",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        return { status: null, error: { code: "PROBE_FAILED" } };
      }
    },
  };
}

const observation = (status, reason, extra = {}) => ({ status, reason, ...extra });
const unknown = (reason) => observation("UNKNOWN", reason);
const completed = (result) =>
  result?.status === 0 && !result.error && !result.signal;

export function inspectPath(
  target,
  probes,
  { type = "file", follow = false } = {},
) {
  if (probes.platform !== "darwin") return unknown("UNSUPPORTED_METADATA_PLATFORM");
  const result = probes.command("/usr/bin/stat", [
    ...(follow ? ["-L"] : []),
    "-f",
    "%p %z %f",
    absolutePath(target),
  ]);
  if (!completed(result)) {
    if (result?.error?.code === "ETIMEDOUT" || result?.signal === "SIGKILL")
      return unknown("TIMEOUT");
    if (result?.status === 1 && /No such file or directory/.test(result.stderr ?? ""))
      return observation("BLOCKED", "MISSING");
    return unknown("METADATA_FAILED");
  }
  const match = /^([0-7]{5,7}) (\d+) (\d+)\n?$/.exec(result.stdout ?? "");
  if (!match) return unknown("INVALID_METADATA");
  const mode = Number.parseInt(match[1], 8) & 0o170000;
  const bytes = Number(match[2]);
  const flags = Number(match[3]);
  if (!Number.isSafeInteger(bytes) || !Number.isInteger(flags) || flags > 0xffffffff)
    return unknown("INVALID_METADATA");
  if ((flags & SF_DATALESS) !== 0)
    return observation("BLOCKED", "CLOUD_PLACEHOLDER", { bytes });
  if (mode === 0o120000) return unknown("SYMLINK_NOT_FOLLOWED");
  if (mode !== { file: 0o100000, directory: 0o040000, socket: 0o140000 }[type])
    return observation("BLOCKED", "WRONG_FILE_TYPE");
  if (type === "file" && bytes === 0)
    return observation("BLOCKED", "EMPTY_FILE", { bytes });
  return observation("PASS", "LOCAL_METADATA_PRESENT", { bytes });
}

function inspectPacks(root, probes) {
  const directory = path.join(root, ".git/objects/pack");
  const check = inspectPath(directory, probes, { type: "directory" });
  if (check.status !== "PASS") return [{ id: "git:pack-directory", ...check }];
  // Directory names only; no Git command, object read, source read or recursive walk.
  const listing = probes.command("/bin/ls", ["-1f", directory]);
  if (!completed(listing))
    return [{ id: "git:pack-inventory", ...unknown("PACK_ENUMERATION_FAILED") }];
  const names = (listing.stdout ?? "")
    .split("\n")
    .filter((name) => name && name !== "." && name !== "..");
  const candidates = names.filter((name) => /\.(?:pack|idx|rev)$/.test(name));
  if (
    candidates.some(
      (name) => !/^pack-[0-9a-f]{40,64}\.(?:pack|idx|rev)$/.test(name),
    )
  )
    return [{ id: "git:pack-inventory", ...unknown("UNRECOGNIZED_PACK_NAME") }];
  if (candidates.length > MAX_PACK_FILES)
    return [{ id: "git:pack-inventory", ...unknown("PACK_SCAN_LIMIT") }];
  if (!candidates.some((name) => name.endsWith(".pack")))
    return [{ id: "git:pack-inventory", ...unknown("NO_PACK_FILES_OBSERVED") }];
  return candidates.sort().map((name) => ({
    id: `git:${name}`,
    ...inspectPath(path.join(directory, name), probes),
  }));
}

function selectedExecutable(name, explicit, probes) {
  if (explicit) return absolutePath(explicit);
  const result = probes.command("/usr/bin/which", [name]);
  if (!completed(result)) return null;
  const value = (result.stdout ?? "").replace(/\n$/, "");
  try {
    return absolutePath(value);
  } catch {
    return null;
  }
}

function versionCheck(result, pattern, reason) {
  if (!completed(result))
    return unknown(
      result?.error?.code === "ETIMEDOUT" ? "TIMEOUT" : "VERSION_PROBE_FAILED",
    );
  const match = pattern.exec(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
  );
  if (!match) return unknown("UNRECOGNIZED_VERSION");
  return observation("PASS", reason, { version: match[1] });
}

function inspectRuntimes(options, probes) {
  const checks = [];
  const node = /^v(\d+\.\d+\.\d+)$/.exec(probes.nodeVersion);
  checks.push({
    id: "runtime:node",
    ...(node
      ? observation(
          Number(node[1].split(".")[0]) >= 20 ? "PASS" : "BLOCKED",
          "NODE_20_MINIMUM_FOR_THIS_TOOL",
          { version: node[1] },
        )
      : unknown("UNRECOGNIZED_VERSION")),
  });
  const java = selectedExecutable("java", options.java, probes);
  if (!java)
    checks.push({
      id: "runtime:java",
      ...unknown("SELECTED_EXECUTABLE_UNAVAILABLE"),
    });
  else {
    const metadata = inspectPath(java, probes, { follow: true });
    let check = metadata;
    if (metadata.status === "PASS") {
      check = versionCheck(
        probes.command(java, ["-version"]),
        /^(?:openjdk|java) version "(\d+(?:\.\d+){0,2}(?:_[0-9]+)?)"(?:\s|$)/,
        "SELECTED_JAVA_VERSION",
      );
      if (check.status === "PASS" && check.version.split(".")[0] !== "21")
        check = observation("BLOCKED", "JAVA_21_REQUIRED", { version: check.version });
    }
    checks.push({ id: "runtime:java", ...check });
  }
  const socket = inspectPath(options.dockerSocket, probes, { type: "socket", follow: true });
  let docker = null;
  if (socket.status !== "PASS") {
    checks.push({
      id: "runtime:docker",
      ...unknown("SELECTED_SOCKET_UNAVAILABLE"),
      socketReason: socket.reason,
    });
  } else {
    docker = selectedExecutable("docker", null, probes);
    let check = docker
      ? inspectPath(docker, probes, { follow: true })
      : unknown("SELECTED_EXECUTABLE_UNAVAILABLE");
    if (check.status === "PASS") {
      check = versionCheck(
        probes.command(docker, [
          "--host", `unix://${options.dockerSocket}`,
          "version", "--format", "{{.Server.Version}}",
        ]),
        /^(\d+\.\d+\.\d+)$/,
        "SELECTED_LOCAL_DOCKER_SERVER_RESPONDED",
      );
    }
    checks.push({ id: "runtime:docker", ...check });
  }
  return { checks, java, docker };
}

export function probeHttp({ request = http.request, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let req;
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      req?.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish(unknown("TIMEOUT")), timeoutMs);
    try {
      // node:http has no automatic redirects or environment-proxy support.
      req = request(
        {
          hostname: "127.0.0.1",
          port: 18080,
          path: "/login",
          method: "HEAD",
          agent: false,
          headers: { Accept: "text/html", Connection: "close" },
        },
        (response) => {
          const status = response.statusCode;
          response.destroy(); // Never read or print body, cookies or Location.
          if (!Number.isInteger(status) || status < 100 || status > 599)
            finish(unknown("INVALID_HTTP_STATUS"));
          else
            finish(observation(
              status === 200 ? "PASS" : "BLOCKED",
              status === 200 ? "ANONYMOUS_LOGIN_HEAD_200" : "LOGIN_HEAD_NOT_200",
              { httpStatus: status },
            ));
        },
      );
      req.on("error", () => finish(unknown("TRANSPORT_UNAVAILABLE")));
      req.end();
    } catch {
      finish(unknown("TRANSPORT_UNAVAILABLE"));
    }
  });
}

export function summarize(checks) {
  if (checks.some((check) => check.status === "BLOCKED")) return "BLOCKED";
  if (!checks.length || checks.some((check) => check.status !== "PASS")) return "INCOMPLETE";
  return "NO_PROBE_BLOCKERS_FOUND";
}

export async function runReadiness(options, { root = ROOT, probes } = {}) {
  if (options?.run !== true) throw new Error("RUN_CONFIRMATION_REQUIRED");
  const selected = {
    dockerSocket: absolutePath(options.dockerSocket ?? "/var/run/docker.sock"),
    java: options.java ? absolutePath(options.java) : null,
    mavenRepo: options.mavenRepo ? absolutePath(options.mavenRepo) : null,
  };
  absolutePath(root);
  probes ??= createProbes();
  const checks = FILE_MANIFEST.map((target) => ({
    id: `file:${target}`,
    ...inspectPath(path.join(root, target), probes),
  }));
  checks.push({
    id: "dependency:maven-resources-2.6",
    ...(selected.mavenRepo
      ? inspectPath(path.join(selected.mavenRepo, MAVEN_RESOURCE_POM), probes)
      : unknown("MAVEN_REPO_NOT_SELECTED")),
  });
  checks.push(...inspectPacks(root, probes));
  const runtime = inspectRuntimes(selected, probes);
  checks.push(...runtime.checks);
  checks.push({
    id: "http:anonymous-login-head",
    ...await probeHttp({ request: probes.request }),
  });
  return {
    schemaVersion: 1,
    scope: "LIMITED_LOCAL_ENVIRONMENT_OBSERVATION",
    outcome: summarize(checks),
    selected: {
      root,
      nodeExecutable: probes.nodeExecutable,
      javaExecutable: runtime.java,
      dockerExecutable: runtime.docker,
      dockerEndpoint: `unix://${selected.dockerSocket}`,
      mavenRepo: selected.mavenRepo,
      httpEndpoint: "http://127.0.0.1:18080/login",
    },
    counts: Object.fromEntries(
      ["PASS", "BLOCKED", "UNKNOWN"].map((status) => [
        status,
        checks.filter((check) => check.status === status).length,
      ]),
    ),
    checks,
    assurance: {
      fullSourceAvailable: "NOT_VERIFIED",
      gitIntegrity: "NOT_VERIFIED",
      dependencyCompleteness: "NOT_VERIFIED",
      buildable: "NOT_VERIFIED",
      testsPassing: "NOT_VERIFIED",
      authenticated: "NOT_VERIFIED",
      deliverable: "NOT_VERIFIED",
    },
    limitation: "METADATA_SENTINELS_ONLY_NO_CONTENT_READS_NO_REPAIR_NO_BUILD_NO_LOGIN_NO_BUSINESS_READS_NO_DEPLOYMENT",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.run || options.help) console.log(USAGE);
    else {
      const report = await runReadiness(options);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode =
        report.outcome === "BLOCKED" ? 1 : report.outcome === "INCOMPLETE" ? 2 : 0;
    }
  } catch {
    console.error("预检未完成：参数无效或探针内部失败。没有构建或交付结论。");
    process.exitCode = 2;
  }
}
