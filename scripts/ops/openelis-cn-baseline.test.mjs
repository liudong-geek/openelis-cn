import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  assertSafePerformanceDatabase,
  createDatabaseBenchmark,
  parseArgs,
  parsePgbench,
  percentile,
  runHttpLoad,
  summarizeLatencies,
} from "./openelis-cn-baseline.mjs";

test("CLI is inert by default and requires explicit local artifacts for --run", () => {
  assert.equal(parseArgs([]).run, false);
  assert.throws(() => parseArgs(["--run"]), /LOCAL_DOCKER/);
  const parsed = parseArgs([
    "--run",
    "--output-dir",
    "/tmp/SIM-o02",
    "--docker",
    "/usr/local/bin/docker",
    "--docker-socket",
    "/tmp/SIM-docker.sock",
  ]);
  assert.equal(parsed.httpRequests, 240);
  assert.equal(parsed.databaseSeconds, 15);
});

test("CLI rejects remote paths, repeats, unknown options and unbounded loads", () => {
  for (const args of [
    ["--run", "--output-dir", "relative"],
    ["--docker-socket", "tcp://remote:2375"],
    ["--run", "--run"],
    ["--url", "https://example.org"],
    ["--http-requests", "5001"],
    ["--http-concurrency", "65"],
    ["--database-seconds", "301"],
    ["--database-clients", "0"],
  ]) {
    assert.throws(() => parseArgs(args));
  }
});

test("performance database guard excludes business and malformed databases", () => {
  assert.equal(
    assertSafePerformanceDatabase("openelis_o02_perf_20260917224000_123"),
    "openelis_o02_perf_20260917224000_123",
  );
  for (const name of [
    "clinlims",
    "postgres",
    "openelis_o02_perf_",
    "openelis_o02_perf_20260917_1",
    "openelis_o02_perf_20260917224000_1;drop database clinlims",
  ]) {
    assert.throws(() => assertSafePerformanceDatabase(name));
  }
});

test("nearest-rank percentiles and summaries are deterministic", () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.95), 5);
  assert.equal(percentile([], 0.95), null);
  assert.deepEqual(summarizeLatencies([1, 2, 3, 4]), {
    meanMs: 2.5,
    p50Ms: 2,
    p95Ms: 4,
    p99Ms: 4,
    maxMs: 4,
  });
});

test("pgbench parser keeps transactions, failures, latency and final TPS", () => {
  const parsed = parsePgbench(`
number of transactions actually processed: 4321
number of failed transactions: 0 (0.000%)
latency average = 2.500 ms
tps = 1600.000000 (including connections establishing)
tps = 1728.400000 (excluding connections establishing)
`);
  assert.deepEqual(parsed, {
    transactions: 4321,
    failedTransactions: 0,
    latencyAverageMs: 2.5,
    transactionsPerSecond: 1728.4,
  });
  assert.throws(() => parsePgbench("private output"), /PGBENCH_/);
});

test("database benchmark passes its generated database positionally without enabling pgbench debug", () => {
  const calls = [];
  const run = (tool, args) => {
    calls.push({ tool, args });
    if (args.includes("SELECT count(*) FROM pgbench_accounts;"))
      return "100000\n";
    if (args.includes("-T")) {
      return `number of transactions actually processed: 10
number of failed transactions: 0 (0.000%)
latency average = 1.250 ms
tps = 800.000000 (excluding connections establishing)\n`;
    }
    return "";
  };
  const benchmark = createDatabaseBenchmark(
    {
      docker: "/usr/local/bin/docker",
      dockerSocket: "/tmp/docker.sock",
      databaseContainer: "openelis-cn-database",
      databaseSeconds: 5,
      databaseClients: 2,
    },
    { run },
  );
  const result = benchmark();
  assert.equal(result.result, "passed");
  assert.equal(result.isolatedDatabaseRemoved, true);
  const pgbenchCalls = calls.filter(({ args }) => args.includes("pgbench"));
  assert.equal(pgbenchCalls.length, 2);
  for (const { args } of pgbenchCalls) {
    const pgbenchIndex = args.indexOf("pgbench");
    const pgbenchArgs = args.slice(pgbenchIndex + 1);
    assert.equal(pgbenchArgs.includes("-d"), false);
    assert.match(pgbenchArgs.at(-1), /^openelis_o02_perf_[0-9]{14}_[0-9]+$/);
  }
});

function syntheticRequest(status = 200) {
  return (options, callback) => {
    assert.deepEqual(options, {
      hostname: "127.0.0.1",
      port: 18080,
      path: "/login",
      method: "HEAD",
      agent: false,
      headers: { Accept: "text/html", Connection: "close" },
    });
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () =>
      queueMicrotask(() => callback({ statusCode: status, destroy() {} }));
    return request;
  };
}

test("HTTP load uses only the fixed anonymous local endpoint", async () => {
  const result = await runHttpLoad(
    { requests: 24, concurrency: 4 },
    { request: syntheticRequest() },
  );
  assert.equal(result.successful, 24);
  assert.equal(result.failed, 0);
  assert.equal(result.statusCounts["200"], 24);
  assert.equal(result.result, "passed");
  assert.ok(result.latency.p95Ms >= 0);
});

test("HTTP errors cannot produce a passing baseline", async () => {
  const result = await runHttpLoad(
    { requests: 20, concurrency: 2 },
    { request: syntheticRequest(503) },
  );
  assert.equal(result.successful, 0);
  assert.equal(result.failed, 20);
  assert.equal(result.result, "failed");
});
