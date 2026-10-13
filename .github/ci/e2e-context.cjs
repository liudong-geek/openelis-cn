const WORKFLOW_PATH = ".github/workflows/e2e-playwright.yml";
const CHECKPOINT = "03 Checkpoint - E2E";
const SHA = /^[0-9a-f]{40}$/;

const sameRepository = (left, right) =>
  typeof left === "string" &&
  typeof right === "string" &&
  left.toLowerCase() === right.toLowerCase();

function isDocumentationPath(path) {
  return (
    typeof path === "string" &&
    !/[\\\x00-\x1f]/.test(path) &&
    !path.split("/").some((part) => !part || part === "." || part === "..") &&
    (path === "README.md" || path.startsWith("docs/"))
  );
}

function classifyFiles(files, changedFiles) {
  if (
    !Number.isSafeInteger(changedFiles) ||
    changedFiles < 1 ||
    changedFiles > 3000 ||
    !Array.isArray(files) ||
    files.length !== changedFiles ||
    new Set(files.map((file) => file.filename)).size !== changedFiles
  )
    return "full";
  return files.every(
    (file) =>
      isDocumentationPath(file.filename) &&
      (file.status !== "renamed" ||
        isDocumentationPath(file.previous_filename)) &&
      (!file.previous_filename || isDocumentationPath(file.previous_filename)),
  )
    ? "docs-only"
    : "full";
}

async function pullRequestScope(github, repo, pr) {
  if (!Number.isSafeInteger(pr.changed_files) || pr.changed_files > 3000)
    return "full";
  try {
    const files = await github.paginate(github.rest.pulls.listFiles, {
      ...repo,
      pull_number: pr.number,
      per_page: 100,
    });
    // listFiles is live PR data, not a snapshot. Recheck both ends after paging.
    const { data: current } = await github.rest.pulls.get({
      ...repo,
      pull_number: pr.number,
    });
    if (
      current.head.sha !== pr.head.sha ||
      current.base.sha !== pr.base.sha ||
      current.changed_files !== pr.changed_files
    )
      return "full";
    return classifyFiles(files, pr.changed_files);
  } catch {
    // Detection failures cost a full build; they must never skip validation.
    return "full";
  }
}

async function buildScope({ github, context }) {
  if (context.eventName !== "pull_request") return "full";
  const requested = context.payload.pull_request;
  try {
    const { data: pr } = await github.rest.pulls.get({
      ...context.repo,
      pull_number: requested.number,
    });
    if (
      pr.head.sha !== requested.head.sha ||
      pr.base.sha !== requested.base.sha ||
      !sameRepository(
        pr.base.repo.full_name,
        context.payload.repository.full_name,
      )
    )
      return "full";
    return pullRequestScope(github, context.repo, pr);
  } catch {
    return "full";
  }
}

async function resolveSource({ github, context }) {
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const runId = context.payload.workflow_run.id;
  const plan = {
    execution_mode: "blocked",
    scope: "full",
    reason: "E2E source identity could not be verified",
    status_sha: "",
    checkout_ref: "",
    build_run_id: String(runId),
    is_fork: "true",
    pr_number: "",
    artifact_source_mode: "none",
    artifact_map_kind: "base",
    include_plugin_jars: "true",
    checkpoint_context: CHECKPOINT,
  };
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: runId,
  });
  const { data: workflow } = await github.rest.actions.getWorkflow({
    ...context.repo,
    workflow_id: "e2e-playwright.yml",
  });
  if (
    run.id !== runId ||
    run.workflow_id !== workflow.id ||
    run.path !== WORKFLOW_PATH ||
    !sameRepository(run.repository?.full_name, repository) ||
    !SHA.test(run.head_sha || "")
  )
    return plan;
  plan.status_sha = run.head_sha;
  plan.event_name = run.event;
  plan.build_conclusion = run.conclusion;
  if (
    !["pull_request", "push", "release", "workflow_dispatch"].includes(
      run.event,
    )
  )
    return plan;

  if (run.event === "pull_request") {
    let candidates = run.pull_requests || [];
    if (!candidates.length) {
      const { data } =
        await github.rest.repos.listPullRequestsAssociatedWithCommit({
          ...context.repo,
          commit_sha: run.head_sha,
          per_page: 100,
        });
      candidates = data;
    }
    const matches = [];
    for (const candidate of candidates) {
      const { data: pr } = await github.rest.pulls.get({
        ...context.repo,
        pull_number: candidate.number,
      });
      if (
        pr.head.sha === run.head_sha &&
        sameRepository(pr.base.repo?.full_name, repository) &&
        sameRepository(pr.head.repo?.full_name, run.head_repository?.full_name)
      )
        matches.push(pr);
    }
    if (matches.length !== 1) {
      plan.reason = "PR head changed or source identity is ambiguous";
      return plan;
    }
    const pr = matches[0];
    plan.pr_number = String(pr.number);
    plan.is_fork = String(!sameRepository(pr.head.repo.full_name, repository));
    if (plan.is_fork === "true") {
      plan.reason =
        "Cross-repository PR execution is blocked in privileged workflow_run";
      return plan;
    }
    plan.base_sha = pr.base.sha;
    plan.checkout_ref = pr.merge_commit_sha;
    plan.scope = await pullRequestScope(github, context.repo, pr);
  } else {
    if (
      !sameRepository(run.head_repository?.full_name, repository) ||
      (run.event === "push" && run.head_branch !== "develop")
    )
      return plan;
    plan.is_fork = "false";
    plan.checkout_ref = run.head_sha;
  }
  if (!SHA.test(plan.checkout_ref || "")) return plan;
  if (run.conclusion !== "success") {
    plan.reason = `E2E build did not succeed (${run.conclusion || "unknown"})`;
    return plan;
  }
  plan.execution_mode = "verify-context";
  plan.reason = "Waiting for build context verification";
  return plan;
}

function verifyBuildContext(plan, metadata, transfer) {
  if (plan.execution_mode !== "verify-context") return plan;
  const fail = (reason) => ({ ...plan, execution_mode: "blocked", reason });
  if (
    !metadata ||
    metadata.event_name !== plan.event_name ||
    metadata.head_sha !== plan.status_sha ||
    metadata.is_fork !== plan.is_fork ||
    metadata.pr_number !== plan.pr_number ||
    (plan.event_name === "pull_request" &&
      (metadata.pr_sha !== plan.checkout_ref ||
        metadata.base_sha !== plan.base_sha))
  )
    return fail("Missing or mismatched early build context");
  if (plan.scope === "docs-only")
    return {
      ...plan,
      execution_mode: "docs-only",
      reason: "Documentation only; E2E build and suites are not required",
    };
  if (transfer !== "ghcr")
    return fail("E2E build has no verified GHCR image transfer");
  return {
    ...plan,
    execution_mode: "full",
    artifact_source_mode: "cross_run",
    reason: "Full Playwright, Cypress, and analyzer-harness suites required",
  };
}

function checkpointOutcome({ mode, reason, conclusion, setup, executor }) {
  if (conclusion === "cancelled" || executor === "cancelled")
    return {
      state: "error",
      description: "E2E build or execution was cancelled",
    };
  if (setup !== "success")
    return { state: "failure", description: "E2E context verification failed" };
  if (conclusion !== "success")
    return { state: "failure", description: "E2E build did not succeed" };
  if (mode === "docs-only" && executor === "skipped")
    return {
      state: "success",
      description: "Documentation only; E2E build and suites not required",
    };
  if (mode === "full" && executor === "success")
    return {
      state: "success",
      description:
        "All Playwright, Cypress, and analyzer-harness suites passed",
    };
  return {
    state: "failure",
    description:
      mode === "blocked"
        ? reason || "E2E execution was blocked"
        : "One or more E2E suites did not pass",
  };
}

module.exports = {
  buildScope,
  checkpointOutcome,
  classifyFiles,
  isDocumentationPath,
  resolveSource,
  sameRepository,
  verifyBuildContext,
};
