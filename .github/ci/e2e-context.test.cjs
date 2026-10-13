const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildScope,
  checkpointOutcome,
  classifyFiles,
  resolveSource,
  sameRepository,
  verifyBuildContext,
} = require("./e2e-context.cjs");

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MERGE = "c".repeat(40);
const OTHER = "d".repeat(40);
const repository = "liudong-geek/openelis-cn";
const repo = { owner: "liudong-geek", repo: "openelis-cn" };
const file = (filename, extra = {}) => ({
  filename,
  status: "modified",
  ...extra,
});

function fixture({
  files = [file("docs/guide.md")],
  event = "pull_request",
  fork = false,
} = {}) {
  const headRepository = fork ? "contributor/openelis-cn" : repository;
  // The current repository can itself be a fork; that is not a cross-repo PR.
  const pr = {
    number: 42,
    changed_files: files.length,
    merge_commit_sha: MERGE,
    head: { sha: HEAD, repo: { full_name: headRepository, fork: true } },
    base: { sha: BASE, repo: { full_name: repository } },
  };
  const run = {
    id: 99,
    workflow_id: 7,
    path: ".github/workflows/e2e-playwright.yml",
    repository: { full_name: repository },
    head_repository: { full_name: headRepository },
    head_sha: HEAD,
    event,
    head_branch: "develop",
    conclusion: "success",
    pull_requests: event === "pull_request" ? [{ number: 42 }] : [],
  };
  const context = {
    repo,
    eventName: event,
    sha: event === "pull_request" ? MERGE : HEAD,
    payload: {
      repository: { full_name: repository },
      pull_request: structuredClone(pr),
      workflow_run: { id: 99 },
    },
  };
  const calls = [];
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async (args) => {
          calls.push(["run", args]);
          return { data: structuredClone(run) };
        },
        getWorkflow: async () => ({ data: { id: 7 } }),
      },
      pulls: {
        get: async (args) => {
          calls.push(["pr", args]);
          return { data: structuredClone(pr) };
        },
        listFiles: async (args) => {
          calls.push(["files", args]);
          return {
            data: files.slice(
              (args.page - 1) * args.per_page,
              args.page * args.per_page,
            ),
          };
        },
      },
      repos: {
        listPullRequestsAssociatedWithCommit: async () => ({
          data: [{ number: 42 }],
        }),
      },
    },
    paginate: async (method, args) => {
      const result = [];
      for (let page = 1; ; page++) {
        const { data } = await method({ ...args, page });
        result.push(...data);
        if (data.length < args.per_page) return result;
      }
    },
  };
  const metadata = {
    event_name: event,
    head_sha: HEAD,
    is_fork: String(fork),
    pr_number: event === "pull_request" ? "42" : "",
    pr_sha: event === "pull_request" ? MERGE : "",
    base_sha: event === "pull_request" ? BASE : "",
  };
  return { github, context, run, pr, calls, metadata };
}

function gate(plan, executor = "skipped", setup = "success") {
  return checkpointOutcome({
    mode: plan.execution_mode,
    reason: plan.reason,
    conclusion: plan.build_conclusion,
    setup,
    executor,
  });
}

test("only root documentation and README are eligible, including deletion and safe rename", () => {
  assert.equal(
    classifyFiles(
      [
        file("README.md"),
        file("docs/obsolete.md", { status: "removed" }),
        file("docs/new.md", {
          status: "renamed",
          previous_filename: "docs/old.md",
        }),
      ],
      3,
    ),
    "docs-only",
  );
});

for (const filename of [
  "frontend/public/docs/manual.html",
  "frontend/src/App.jsx",
  "frontend/package-lock.json",
  "pom.xml",
  "src/main/resources/liquibase/change.xml",
  "src/main/java/security/Policy.java",
  "frontend/cypress/e2e/login.cy.js",
  "src/test/java/ExampleTest.java",
  ".github/workflows/e2e-tests.yml",
  ".github/ci/e2e-context.cjs",
  "docker-compose.yml",
  ".env.example",
  "scripts/check.sh",
  "docs/../pom.xml",
  "docs\\guide.md",
  "other/README.md",
]) {
  test(`a documentation PR mixed with ${filename} requires full validation`, () => {
    assert.equal(
      classifyFiles([file("docs/guide.md"), file(filename)], 2),
      "full",
    );
  });
}

test("moving code into docs is still a code change; incomplete and ambiguous file lists fail closed", () => {
  assert.equal(
    classifyFiles(
      [
        file("docs/code.md", {
          status: "renamed",
          previous_filename: "src/Code.java",
        }),
      ],
      1,
    ),
    "full",
  );
  assert.equal(
    classifyFiles([file("docs/a.md", { status: "renamed" })], 1),
    "full",
  );
  assert.equal(classifyFiles([file("docs/a.md")], 2), "full");
  assert.equal(
    classifyFiles([file("docs/a.md"), file("docs/a.md")], 2),
    "full",
  );
  assert.equal(classifyFiles([], 0), "full");
  assert.equal(classifyFiles([], 3001), "full");
});

test("classification reads later API pages and cannot miss a code change after 100 docs", async () => {
  const f = fixture({
    files: [
      ...Array.from({ length: 100 }, (_, i) => file(`docs/${i}.md`)),
      file("pom.xml"),
    ],
  });
  assert.equal(await buildScope(f), "full");
  assert.deepEqual(
    f.calls.filter(([name]) => name === "files").map(([, args]) => args.page),
    [1, 2],
  );
});

test("unavailable, truncated, oversized or changing PR data never skips builds", async () => {
  const unavailable = fixture();
  unavailable.github.paginate = async () => {
    throw new Error("rate limit");
  };
  assert.equal(await buildScope(unavailable), "full");
  const truncated = fixture();
  truncated.pr.changed_files = 2;
  assert.equal(await buildScope(truncated), "full");
  const oversized = fixture();
  oversized.pr.changed_files = 3001;
  assert.equal(await buildScope(oversized), "full");
  assert.equal(
    oversized.calls.some(([name]) => name === "files"),
    false,
  );
  const changed = fixture();
  const paginate = changed.github.paginate;
  changed.github.paginate = async (...args) => {
    const files = await paginate(...args);
    changed.pr.head.sha = OTHER;
    return files;
  };
  assert.equal(await buildScope(changed), "full");
});

for (const event of ["push", "release", "workflow_dispatch"]) {
  test(`${event} always requires images and every existing E2E suite`, async () => {
    const f = fixture({ event });
    assert.equal(await buildScope(f), "full");
    const plan = verifyBuildContext(await resolveSource(f), f.metadata, "ghcr");
    assert.equal(plan.execution_mode, "full");
    assert.equal(plan.checkout_ref, HEAD);
    assert.equal(gate(plan).state, "failure");
    assert.equal(gate(plan, "success").state, "success");
  });
}

test("a same-repository PR remains trusted even when its repository is a fork", async () => {
  const f = fixture({ files: [file("frontend/package-lock.json")] });
  const plan = verifyBuildContext(await resolveSource(f), f.metadata, "ghcr");
  assert.equal(sameRepository(repository.toUpperCase(), repository), true);
  assert.equal(plan.is_fork, "false");
  assert.equal(plan.execution_mode, "full");
  assert.equal(plan.checkout_ref, MERGE);
  assert.equal(plan.status_sha, HEAD);
  assert.equal(gate(plan, "success").state, "success");
  assert.equal(gate(plan, "failure").state, "failure");
  assert.equal(gate(plan, "skipped").state, "failure");
});

test("docs-only PR still has a verified checkpoint without images and does not claim suites passed", async () => {
  const f = fixture();
  assert.equal(await buildScope(f), "docs-only");
  const plan = verifyBuildContext(
    await resolveSource(f),
    f.metadata,
    undefined,
  );
  assert.equal(plan.execution_mode, "docs-only");
  const result = gate(plan);
  assert.equal(result.state, "success");
  assert.match(result.description, /Documentation only/);
  assert.doesNotMatch(result.description, /suites passed/);
});

test("artifact claims cannot turn a code PR into a docs-only checkpoint", async () => {
  const f = fixture({ files: [file("src/main/java/Service.java")] });
  f.metadata.scope = "docs-only";
  const plan = verifyBuildContext(
    await resolveSource(f),
    f.metadata,
    undefined,
  );
  assert.equal(plan.execution_mode, "blocked");
  assert.equal(gate(plan).state, "failure");
});

test("cross-repository PRs are blocked even when handoff or metadata claims otherwise", async () => {
  const f = fixture({ fork: true });
  const source = await resolveSource(f);
  f.metadata.is_fork = "false";
  for (const transfer of ["fork-handoff", "ghcr", undefined]) {
    const plan = verifyBuildContext(source, f.metadata, transfer);
    assert.equal(plan.execution_mode, "blocked");
    assert.equal(plan.is_fork, "true");
    assert.match(gate(plan).description, /Cross-repository/);
    assert.equal(gate(plan).state, "failure");
  }
  assert.equal(
    f.calls.some(([name]) => name === "files"),
    false,
  );
});

test("empty workflow PR association can be resolved through the authoritative commit API", async () => {
  const f = fixture();
  f.run.pull_requests = [];
  assert.equal((await resolveSource(f)).pr_number, "42");
});

test("another repository, workflow or stale PR head cannot authorize execution", async () => {
  for (const mutate of [
    (f) => {
      f.run.repository.full_name = "other/repository";
    },
    (f) => {
      f.run.workflow_id = 8;
    },
    (f) => {
      f.run.path = ".github/workflows/forged.yml";
    },
    (f) => {
      f.pr.head.sha = OTHER;
    },
    (f) => {
      f.pr.head.repo.full_name = "other/repository";
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal((await resolveSource(f)).execution_mode, "blocked");
  }
});

test("missing context, changed base/merge SHA or forged identities never pass", async () => {
  const f = fixture();
  const source = await resolveSource(f);
  for (const metadata of [
    undefined,
    {},
    ...[
      ["head_sha", OTHER],
      ["pr_sha", OTHER],
      ["base_sha", OTHER],
      ["pr_number", "43"],
      ["is_fork", "true"],
      ["event_name", "push"],
    ].map(([key, value]) => ({ ...f.metadata, [key]: value })),
  ]) {
    const plan = verifyBuildContext(source, metadata, "ghcr");
    assert.equal(plan.execution_mode, "blocked");
    assert.equal(gate(plan).state, "failure");
  }
});

for (const conclusion of [
  "failure",
  "cancelled",
  "timed_out",
  "skipped",
  "action_required",
  null,
]) {
  test(`a ${conclusion} build never becomes docs-only success`, async () => {
    const f = fixture();
    f.run.conclusion = conclusion;
    const plan = verifyBuildContext(await resolveSource(f), f.metadata, "ghcr");
    assert.equal(plan.execution_mode, "blocked");
    assert.equal(
      gate(plan).state,
      conclusion === "cancelled" ? "error" : "failure",
    );
  });
}

test("context failure and cancelled suites remain non-success", async () => {
  const f = fixture({ files: [file("pom.xml")] });
  const plan = verifyBuildContext(await resolveSource(f), f.metadata, "ghcr");
  assert.equal(gate(plan, "success", "failure").state, "failure");
  assert.equal(gate(plan, "cancelled").state, "error");
});

test("workflow wiring preserves triggers, gate, trusted policy and cross-repository isolation", () => {
  const workflows = path.join(__dirname, "../workflows");
  const build = fs.readFileSync(
    path.join(workflows, "e2e-playwright.yml"),
    "utf8",
  );
  const wrapper = fs.readFileSync(
    path.join(workflows, "e2e-tests.yml"),
    "utf8",
  );
  assert.doesNotMatch(build, /paths-ignore:/);
  assert.match(build, /release:\n\s+types: \[published\]/);
  assert.match(build, /workflow_dispatch:/);
  assert.match(
    build,
    /needs: changes\n\s+if: needs.changes.outputs.scope != 'docs-only'/,
  );
  assert.ok(
    build.indexOf("Upload early build context") <
      build.indexOf("Checkout trusted scope policy"),
  );
  assert.ok(
    build.indexOf("Upload early build context") <
      build.indexOf("Install frontend dependencies"),
  );
  assert.doesNotMatch(build, /head\.repo\.fork/);
  assert.doesNotMatch(
    wrapper,
    /DIGI-UW|fork-image-publish|docker load|docker\/login-action|allow-unsafe-pr-checkout/,
  );
  assert.match(
    wrapper,
    /execution_mode == 'full' && needs.setup.outputs.is_fork == 'false'/,
  );
  assert.match(wrapper, /resolveSource\(\{github, context\}\)/);
  assert.match(wrapper, /verifyBuildContext\(source, metadata,/);
  assert.match(wrapper, /ref: \$\{\{ github.sha \}\}/);
  assert.match(wrapper, /name: Report Status\n\s+if: always\(\)/);
  assert.match(wrapper, /03 Checkpoint - E2E/);
  assert.match(
    wrapper,
    /GATE_RESULT === 'success' && process.env.GATE_STATE === 'success'/,
  );
});
