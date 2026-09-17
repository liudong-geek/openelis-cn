#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOperations as createRecoveryOperations,
  createRunner,
} from "./openelis-cn-recovery.mjs";

const DATABASE_PREFIX = "openelis_o02_perf_";
const DEFAULTS = Object.freeze({
  httpRequests: 240,
  httpConcurrency: 12,
  databaseSeconds: 15,
  databaseClients: 8,
});
const USAGE = `用法：
  node scripts/ops/openelis-cn-baseline.mjs --run --output-dir /绝对报告目录 --docker /绝对路径/docker --docker-socket /绝对路径/docker.sock [--http-requests 240] [--http-concurrency 12] [--database-seconds 15] [--database-clients 8]

默认只显示说明。负载固定指向本机 127.0.0.1:18080/login 和程序创建的 openelis_o02_perf_ 临时数据库；不接受远程URL或现有业务数据库名。`;

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

function boundedInteger(value, name, minimum, maximum) {
  if (!/^[0-9]+$/.test(value ?? "")) throw new Error(`${name}_INVALID`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name}_OUT_OF_RANGE`);
  }
  return parsed;
}

export function parseArgs(args) {
  const options = {
    run: false,
    docker: null,
    dockerSocket: null,
    outputDir: null,
    databaseContainer: "openelis-cn-database",
    webappContainer: "openelis-cn-webapp",
    sourceDatabase: "clinlims",
    ...DEFAULTS,
  };
  const specifications = {
    "--docker": ["docker", (value) => absolute(value, "DOCKER")],
    "--docker-socket": [
      "dockerSocket",
      (value) => absolute(value, "DOCKER_SOCKET"),
    ],
    "--output-dir": ["outputDir", (value) => absolute(value, "OUTPUT_DIR")],
    "--http-requests": [
      "httpRequests",
      (value) => boundedInteger(value, "HTTP_REQUESTS", 20, 5000),
    ],
    "--http-concurrency": [
      "httpConcurrency",
      (value) => boundedInteger(value, "HTTP_CONCURRENCY", 1, 64),
    ],
    "--database-seconds": [
      "databaseSeconds",
      (value) => boundedInteger(value, "DATABASE_SECONDS", 5, 300),
    ],
    "--database-clients": [
      "databaseClients",
      (value) => boundedInteger(value, "DATABASE_CLIENTS", 1, 64),
    ],
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error("DUPLICATE_OPTION");
    seen.add(arg);
    if (arg === "--run") {
      options.run = true;
      continue;
    }
    const specification = specifications[arg];
    if (!specification || index + 1 >= args.length)
      throw new Error("INVALID_ARGUMENTS");
    const [key, validator] = specification;
    options[key] = validator(args[++index]);
  }
  if (!options.run) return options;
  if (!options.docker || !options.dockerSocket || !options.outputDir) {
    throw new Error("LOCAL_DOCKER_AND_OUTPUT_REQUIRED");
  }
  if (options.httpConcurrency > options.httpRequests) {
    throw new Error("HTTP_CONCURRENCY_EXCEEDS_REQUESTS");
  }
  return options;
}

export function assertSafePerformanceDatabase(database) {
  if (!/^openelis_o02_perf_[0-9]{14}_[0-9]+$/.test(database)) {
    throw new Error("UNSAFE_PERFORMANCE_DATABASE");
  }
  return database;
}

export function percentile(values, quantile) {
  if (!values.length || quantile <= 0 || quantile > 1) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

const rounded = (value) => Math.round(value * 1000) / 1000;

export function summarizeLatencies(values) {
  if (!values.length) return null;
  return {
    meanMs: rounded(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ),
    p50Ms: rounded(percentile(values, 0.5)),
    p95Ms: rounded(percentile(values, 0.95)),
    p99Ms: rounded(percentile(values, 0.99)),
    maxMs: rounded(Math.max(...values)),
  };
}

export function parsePgbench(output) {
  const extract = (pattern, name) => {
    const match = pattern.exec(output);
    if (!match) throw new Error(`PGBENCH_${name}_MISSING`);
    return Number(match[1]);
  };
  const transactions = extract(
    /number of transactions actually processed:\s*([0-9]+)/,
    "TRANSACTIONS",
  );
  const failedMatch = /number of failed transactions:\s*([0-9]+)/.exec(output);
  const failedTransactions = failedMatch ? Number(failedMatch[1]) : 0;
  const latencyAverageMs = extract(
    /latency average =\s*([0-9.]+) ms/,
    "LATENCY",
  );
  const tpsMatches = [...output.matchAll(/^tps =\s*([0-9.]+).*$/gm)];
  if (!tpsMatches.length) throw new Error("PGBENCH_TPS_MISSING");
  return {
    transactions,
    failedTransactions,
    latencyAverageMs,
    transactionsPerSecond: Number(tpsMatches.at(-1)[1]),
  };
}

function requestOnce({ request = http.request, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const started = performance.now();
    let req;
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      req?.destroy();
      resolve({ ...result, elapsedMs: performance.now() - started });
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: "TIMEOUT" }),
      timeoutMs,
    );
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
        const status = response.statusCode ?? 0;
        response.destroy();
        finish({ ok: status === 200, status });
      },
    );
    req.on("error", () => finish({ ok: false, reason: "UNAVAILABLE" }));
    req.end();
  });
}

export async function runHttpLoad(
  { requests, concurrency },
  { request = http.request } = {},
) {
  const started = performance.now();
  const results = new Array(requests);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= requests) return;
      results[index] = await requestOnce({ request });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const durationMs = performance.now() - started;
  const successful = results.filter((result) => result.ok);
  const statusCounts = {};
  for (const result of results) {
    const key = result.status ? String(result.status) : result.reason;
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  const latency = summarizeLatencies(
    successful.map((result) => result.elapsedMs),
  );
  return {
    requests,
    concurrency,
    successful: successful.length,
    failed: requests - successful.length,
    errorRate: rounded((requests - successful.length) / requests),
    durationMs: rounded(durationMs),
    requestsPerSecond: rounded((requests * 1000) / durationMs),
    statusCounts,
    latency,
    result:
      successful.length === requests && latency && latency.p95Ms <= 2000
        ? "passed"
        : "failed",
  };
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function writeReport(outputDir, report) {
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);
  const metadata = lstatSync(outputDir);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("OUTPUT_DIR_INVALID");
  }
  const file = path.join(
    outputDir,
    `openelis-o02-baseline-${timestamp()}.json`,
  );
  if (existsSync(file)) throw new Error("OUTPUT_FILE_ALREADY_EXISTS");
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, file);
  return file;
}

export function createDatabaseBenchmark(
  options,
  { run = createRunner() } = {},
) {
  const dockerBase = ["--host", `unix://${options.dockerSocket}`];
  const docker = (...args) => run(options.docker, [...dockerBase, ...args]);
  const dbExec = (...args) =>
    docker("exec", options.databaseContainer, ...args);
  const psql = (database, sql) =>
    dbExec(
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
      "-Atc",
      sql,
    ).trim();
  return () => {
    const database = assertSafePerformanceDatabase(
      `${DATABASE_PREFIX}${timestamp()
        .toLowerCase()
        .replace(/[^0-9]/g, "")}_${process.pid}`,
    );
    let created = false;
    let cleanupError = null;
    let result;
    try {
      psql(
        "postgres",
        `CREATE DATABASE "${database}" TEMPLATE template0 ENCODING 'UTF8';`,
      );
      created = true;
      dbExec("pgbench", "-i", "-s", "1", "-U", "postgres", database);
      const accountRows = Number(
        psql(database, "SELECT count(*) FROM pgbench_accounts;"),
      );
      if (accountRows !== 100000)
        throw new Error("PGBENCH_SYNTHETIC_ROWS_INVALID");
      const workers = Math.min(options.databaseClients, 4);
      const output = dbExec(
        "pgbench",
        "-c",
        String(options.databaseClients),
        "-j",
        String(workers),
        "-T",
        String(options.databaseSeconds),
        "-U",
        "postgres",
        database,
      );
      result = {
        scale: 1,
        syntheticAccountRows: accountRows,
        clients: options.databaseClients,
        workers,
        durationSeconds: options.databaseSeconds,
        ...parsePgbench(output),
      };
      result.result =
        result.transactions > 0 &&
        result.failedTransactions === 0 &&
        result.transactionsPerSecond > 0
          ? "passed"
          : "failed";
    } finally {
      if (created) {
        try {
          psql(
            "postgres",
            `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`,
          );
        } catch (error) {
          cleanupError = error;
        }
      }
    }
    if (cleanupError) throw new Error("PERFORMANCE_DATABASE_CLEANUP_FAILED");
    return { ...result, isolatedDatabaseRemoved: true };
  };
}

function containerStats(options, run) {
  const output = run(options.docker, [
    "--host",
    `unix://${options.dockerSocket}`,
    "stats",
    "--no-stream",
    "--format",
    "{{json .}}",
    options.databaseContainer,
    options.webappContainer,
    "openelis-cn-frontend",
    "openelis-cn-proxy",
  ]);
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parsed = JSON.parse(line);
      return {
        name: parsed.Name,
        cpu: parsed.CPUPerc,
        memory: parsed.MemUsage,
      };
    });
}

export async function execute(options, dependencies = {}) {
  if (!options.run) return { usage: USAGE };
  const run = dependencies.run ?? createRunner();
  const health = createRecoveryOperations(options, {
    run,
    probe: dependencies.healthProbe,
  }).health;
  const databaseBenchmark = createDatabaseBenchmark(options, { run });
  const startedAt = Date.now();
  const healthBefore = await health();
  if (healthBefore.result !== "passed") throw new Error("HEALTH_CHECK_FAILED");
  const resourcesBefore = containerStats(options, run);
  const httpResult = await runHttpLoad(
    { requests: options.httpRequests, concurrency: options.httpConcurrency },
    { request: dependencies.request },
  );
  if (httpResult.result !== "passed") throw new Error("HTTP_BASELINE_FAILED");
  const databaseResult = databaseBenchmark();
  if (databaseResult.result !== "passed")
    throw new Error("DATABASE_BASELINE_FAILED");
  const resourcesAfter = containerStats(options, run);
  const healthAfter = await health();
  if (healthAfter.result !== "passed")
    throw new Error("POST_BASELINE_HEALTH_FAILED");
  const report = {
    schemaVersion: 1,
    kind: "OPENELIS_CN_SYNTHETIC_BASELINE",
    completedAt: new Date().toISOString(),
    totalDurationMillis: Date.now() - startedAt,
    workload: {
      http: "fixed anonymous HEAD http://127.0.0.1:18080/login",
      database: "pgbench scale 1 in an isolated temporary database",
    },
    healthBefore,
    resourcesBefore,
    http: httpResult,
    database: databaseResult,
    resourcesAfter,
    healthAfter,
    result: "passed",
    scope: "LOCAL_SYNTHETIC_BASELINE_ONLY",
  };
  const reportFile = writeReport(options.outputDir, report);
  return { reportFile, report };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await execute(options);
    if (!options.run) console.log(USAGE);
    else console.log(JSON.stringify(result, null, 2));
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
