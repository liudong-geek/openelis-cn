#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMANDS = new Set(["health", "backup", "restore-drill", "all"]);
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const CONTAINER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const RESTORE_PREFIX = "openelis_o01_restore_";
const DEFAULT_DATABASE_CONTAINER = "openelis-cn-database";
const DEFAULT_WEBAPP_CONTAINER = "openelis-cn-webapp";
const DEFAULT_SOURCE_DATABASE = "clinlims";
const COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const USAGE = `用法：
  node scripts/ops/openelis-cn-recovery.mjs health --run --docker /绝对路径/docker --docker-socket /绝对路径/docker.sock
  node scripts/ops/openelis-cn-recovery.mjs backup --run --output-dir /绝对备份目录 --docker /绝对路径/docker --docker-socket /绝对路径/docker.sock
  node scripts/ops/openelis-cn-recovery.mjs restore-drill --run --backup /绝对路径/备份.dump --manifest /绝对路径/manifest.json --output-dir /绝对报告目录 --docker /绝对路径/docker --docker-socket /绝对路径/docker.sock
  node scripts/ops/openelis-cn-recovery.mjs all --run --output-dir /绝对目录 --docker /绝对路径/docker --docker-socket /绝对路径/docker.sock

默认只显示说明。--run 只允许本机 Unix Docker 套接字；恢复数据库名由程序生成并强制使用 openelis_o01_restore_ 前缀。`;

function absolute(value, name) {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    /[\x00-\x1f\x7f]/.test(value)
  ) {
    throw new Error(`${name}_MUST_BE_ABSOLUTE`);
  }
  return path.normalize(value);
}

function named(value, pattern, name) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

export function parseArgs(args) {
  const command = args[0];
  if (!COMMANDS.has(command)) throw new Error("COMMAND_REQUIRED");
  const options = {
    command,
    run: false,
    docker: null,
    dockerSocket: null,
    outputDir: null,
    backup: null,
    manifest: null,
    databaseContainer: DEFAULT_DATABASE_CONTAINER,
    webappContainer: DEFAULT_WEBAPP_CONTAINER,
    sourceDatabase: DEFAULT_SOURCE_DATABASE,
  };
  const valueOptions = {
    "--docker": ["docker", absolute],
    "--docker-socket": ["dockerSocket", absolute],
    "--output-dir": ["outputDir", absolute],
    "--backup": ["backup", absolute],
    "--manifest": ["manifest", absolute],
    "--database-container": [
      "databaseContainer",
      (value) => named(value, CONTAINER, "DATABASE_CONTAINER"),
    ],
    "--webapp-container": [
      "webappContainer",
      (value) => named(value, CONTAINER, "WEBAPP_CONTAINER"),
    ],
    "--source-database": [
      "sourceDatabase",
      (value) => named(value, IDENTIFIER, "SOURCE_DATABASE"),
    ],
  };
  const seen = new Set();
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error("DUPLICATE_OPTION");
    seen.add(arg);
    if (arg === "--run") {
      options.run = true;
      continue;
    }
    const specification = valueOptions[arg];
    if (!specification || index + 1 >= args.length) {
      throw new Error("INVALID_ARGUMENTS");
    }
    const [key, validator] = specification;
    options[key] = validator(args[++index], key.toUpperCase());
  }
  if (!options.run) return options;
  if (!options.docker || !options.dockerSocket) {
    throw new Error("LOCAL_DOCKER_SELECTION_REQUIRED");
  }
  if (
    ["backup", "all", "restore-drill"].includes(command) &&
    !options.outputDir
  ) {
    throw new Error("OUTPUT_DIR_REQUIRED");
  }
  if (command === "restore-drill" && (!options.backup || !options.manifest)) {
    throw new Error("BACKUP_AND_MANIFEST_REQUIRED");
  }
  return options;
}

export function assertSafeRestoreDatabase(database) {
  if (
    !IDENTIFIER.test(database) ||
    !/^openelis_o01_restore_[0-9]{14}_[0-9]+$/.test(database)
  ) {
    throw new Error("UNSAFE_RESTORE_DATABASE");
  }
  return database;
}

export function metricsEqual(expected, actual) {
  return [
    "tableCount",
    "columnCount",
    "constraintCount",
    "changesetCount",
  ].every(
    (key) =>
      Number.isInteger(expected?.[key]) && expected[key] === actual?.[key],
  );
}

function completed(result) {
  return result && result.status === 0 && !result.error && !result.signal;
}

export function createRunner(spawn = spawnSync) {
  return (command, args, { timeout = COMMAND_TIMEOUT_MS } = {}) => {
    const result = spawn(command, args, {
      shell: false,
      encoding: "utf8",
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      killSignal: "SIGKILL",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!completed(result)) {
      const reason =
        result?.error?.code === "ETIMEDOUT" ? "TIMEOUT" : "COMMAND_FAILED";
      throw new Error(`${reason}:${path.basename(command)}`);
    }
    return result.stdout ?? "";
  };
}

function safeFile(file) {
  const metadata = lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error("BACKUP_FILE_INVALID");
  }
  return metadata;
}

function checksum(file) {
  const hash = createHash("sha256");
  const descriptor = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function writeJson(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, file);
  chmodSync(file, 0o600);
}

function prepareOutput(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("OUTPUT_DIR_INVALID");
  }
  chmodSync(directory, 0o700);
}

function assertNewFile(file) {
  if (existsSync(file)) throw new Error("OUTPUT_FILE_ALREADY_EXISTS");
}

function proxyProbe(timeoutMs = 5000) {
  return new Promise((resolve) => {
    let request;
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      request?.destroy();
      resolve(value);
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: "TIMEOUT" }),
      timeoutMs,
    );
    request = http.request(
      {
        hostname: "127.0.0.1",
        port: 18080,
        path: "/login",
        method: "HEAD",
        agent: false,
        headers: { Accept: "text/html", Connection: "close" },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        response.destroy();
        finish({ ok: status === 200, status });
      },
    );
    request.on("error", () => finish({ ok: false, reason: "UNAVAILABLE" }));
    request.end();
  });
}

const METRICS_SQL = `
SELECT json_build_object(
  'tableCount', (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='clinlims' AND table_type='BASE TABLE'),
  'columnCount', (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='clinlims'),
  'constraintCount', (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='clinlims'),
  'changesetCount', (SELECT count(*)::int FROM clinlims.databasechangelog)
)::text;
`;

export function createOperations(
  options,
  { run = createRunner(), probe = proxyProbe } = {},
) {
  const dockerBase = ["--host", `unix://${options.dockerSocket}`];
  const docker = (...args) => run(options.docker, [...dockerBase, ...args]);
  const dbExec = (...args) =>
    docker("exec", options.databaseContainer, ...args);
  const psql = (user, database, sql) =>
    dbExec(
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      user,
      "-d",
      database,
      "-Atc",
      sql,
    ).trim();
  const metrics = (database) => {
    const parsed = JSON.parse(psql("postgres", database, METRICS_SQL));
    for (const key of [
      "tableCount",
      "columnCount",
      "constraintCount",
      "changesetCount",
    ]) {
      if (!Number.isInteger(parsed[key]) || parsed[key] < 0) {
        throw new Error("DATABASE_METRICS_INVALID");
      }
    }
    return parsed;
  };

  async function health() {
    const databaseState = JSON.parse(
      docker(
        "inspect",
        "--format",
        "{{json .State}}",
        options.databaseContainer,
      ),
    );
    const webappState = JSON.parse(
      docker("inspect", "--format", "{{json .State}}", options.webappContainer),
    );
    dbExec(
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "clinlims",
      "-d",
      options.sourceDatabase,
      "-Atc",
      "SELECT 1;",
    );
    docker("exec", options.webappContainer, "/healthcheck.sh");
    const proxy = await probe();
    const checks = {
      databaseRunning: databaseState.Running === true,
      databaseHealthy: databaseState.Health?.Status === "healthy",
      webappRunning: webappState.Running === true,
      webappHealthy: webappState.Health?.Status === "healthy",
      webappProbe: true,
      proxy,
    };
    return {
      result: Object.values(checks).every((value) =>
        typeof value === "object" ? value.ok === true : value === true,
      )
        ? "passed"
        : "failed",
      checks,
    };
  }

  function backup() {
    prepareOutput(options.outputDir);
    const createdAt = new Date().toISOString();
    const stamp = timestamp();
    const name = `openelis-cn-${stamp}`;
    const remote = `/tmp/${name}-${process.pid}.dump`;
    const backupFile = path.join(options.outputDir, `${name}.dump`);
    const manifestFile = path.join(options.outputDir, `${name}.manifest.json`);
    assertNewFile(backupFile);
    assertNewFile(manifestFile);
    let copied = false;
    try {
      const sourceMetrics = metrics(options.sourceDatabase);
      dbExec(
        "pg_dump",
        "-U",
        "clinlims",
        "-d",
        options.sourceDatabase,
        "--format=custom",
        "--compress=6",
        "--no-owner",
        `--file=${remote}`,
      );
      dbExec("pg_restore", "--list", remote);
      docker("cp", `${options.databaseContainer}:${remote}`, backupFile);
      copied = true;
      const metadata = safeFile(backupFile);
      const manifest = {
        schemaVersion: 1,
        kind: "OPENELIS_CN_DATABASE_BACKUP",
        createdAt,
        sourceDatabase: options.sourceDatabase,
        databaseContainer: options.databaseContainer,
        backupFile: path.basename(backupFile),
        bytes: metadata.size,
        sha256: checksum(backupFile),
        metrics: sourceMetrics,
      };
      writeJson(manifestFile, manifest);
      chmodSync(backupFile, 0o600);
      return { backupFile, manifestFile, manifest };
    } finally {
      try {
        dbExec("rm", "-f", remote);
      } catch (error) {
        throw new Error(
          copied ? "BACKUP_TEMP_CLEANUP_FAILED" : "BACKUP_AND_CLEANUP_FAILED",
        );
      }
    }
  }

  function restoreDrill(
    backupFile = options.backup,
    manifestFile = options.manifest,
  ) {
    const startedAt = Date.now();
    prepareOutput(options.outputDir);
    safeFile(backupFile);
    safeFile(manifestFile);
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (
      manifest.kind !== "OPENELIS_CN_DATABASE_BACKUP" ||
      manifest.schemaVersion !== 1 ||
      manifest.backupFile !== path.basename(backupFile) ||
      manifest.sha256 !== checksum(backupFile)
    ) {
      throw new Error("BACKUP_MANIFEST_MISMATCH");
    }
    const restoreDatabase = assertSafeRestoreDatabase(
      `${RESTORE_PREFIX}${timestamp()
        .toLowerCase()
        .replace(/[^0-9]/g, "")}_${process.pid}`,
    );
    const remote = `/tmp/${restoreDatabase}.dump`;
    let databaseCreated = false;
    let restoredMetrics;
    let cleanupError = null;
    try {
      docker("cp", backupFile, `${options.databaseContainer}:${remote}`);
      psql(
        "postgres",
        "postgres",
        `CREATE DATABASE "${restoreDatabase}" TEMPLATE template0 ENCODING 'UTF8';`,
      );
      databaseCreated = true;
      dbExec(
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "-U",
        "postgres",
        "-d",
        restoreDatabase,
        remote,
      );
      restoredMetrics = metrics(restoreDatabase);
      if (!metricsEqual(manifest.metrics, restoredMetrics)) {
        throw new Error("RESTORE_METRICS_MISMATCH");
      }
    } finally {
      if (databaseCreated) {
        try {
          psql(
            "postgres",
            "postgres",
            `DROP DATABASE IF EXISTS "${restoreDatabase}" WITH (FORCE);`,
          );
        } catch (error) {
          cleanupError = error;
        }
      }
      try {
        dbExec("rm", "-f", remote);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) throw new Error("RESTORE_DRILL_CLEANUP_FAILED");
    const report = {
      schemaVersion: 1,
      kind: "OPENELIS_CN_RESTORE_DRILL",
      completedAt: new Date().toISOString(),
      durationMillis: Date.now() - startedAt,
      sourceBackup: path.basename(backupFile),
      sourceSha256: manifest.sha256,
      expectedMetrics: manifest.metrics,
      restoredMetrics,
      isolatedDatabasePrefix: RESTORE_PREFIX,
      isolatedDatabaseRemoved: true,
      result: "passed",
    };
    const reportFile = path.join(
      options.outputDir,
      `${path.basename(backupFile, ".dump")}.restore-drill-${timestamp()}.json`,
    );
    assertNewFile(reportFile);
    writeJson(reportFile, report);
    return { reportFile, report };
  }

  return { health, backup, restoreDrill };
}

export async function execute(options, dependencies) {
  if (!options.run) return { usage: USAGE };
  const operations = createOperations(options, dependencies);
  if (options.command === "health") return operations.health();
  if (options.command === "backup") return operations.backup();
  if (options.command === "restore-drill") return operations.restoreDrill();
  const startedAt = Date.now();
  const healthBefore = await operations.health();
  if (healthBefore.result !== "passed") throw new Error("HEALTH_CHECK_FAILED");
  const backup = operations.backup();
  const restore = operations.restoreDrill(
    backup.backupFile,
    backup.manifestFile,
  );
  const healthAfter = await operations.health();
  if (healthAfter.result !== "passed")
    throw new Error("POST_DRILL_HEALTH_CHECK_FAILED");
  return {
    result: "passed",
    durationMillis: Date.now() - startedAt,
    healthBefore,
    backup: {
      backupFile: backup.backupFile,
      manifestFile: backup.manifestFile,
      sha256: backup.manifest.sha256,
      bytes: backup.manifest.bytes,
      metrics: backup.manifest.metrics,
    },
    restore: restore.report,
    reportFile: restore.reportFile,
    healthAfter,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await execute(options);
    if (!options.run) {
      console.log(USAGE);
      return;
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ result: "failed", reason: error.message }));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
