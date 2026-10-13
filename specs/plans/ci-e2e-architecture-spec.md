# E2E CI Architecture — Source of Truth

**Date:** 2026-10-14 (documentation scope and source verification update)

**Owner:** OpenELIS CI maintainers  
**Status:** Active reference

This document is the concise repository-level reference for how OpenELIS runs
PR-facing E2E validation across trusted and fork-originated contributions.

## 1. North Star

- Build once for changes that can affect the application or its validation.
- Only root `docs/**` and `README.md` PR changes may skip E2E builds and suites.
- Changes outside that whitelist, including `frontend/public/docs/**`, code,
  configuration, dependencies, migrations, security and tests, require full E2E.
- Pushes to `develop`, published releases and manual runs always require full E2E.
- Use GHCR as the canonical downstream image contract.
- Never execute cross-repository PR code in the privileged `workflow_run` stage.
- Keep `03 Checkpoint - E2E` as the single required PR-facing E2E status.

## 2. Workflow Topology

- Build workflow:
  [`../../.github/workflows/e2e-playwright.yml`](../../.github/workflows/e2e-playwright.yml)
  - Builds artifacts, plugins, and Docker images.
  - Uploads early identity metadata before checkout or any build dependency.
  - Uses the PR base's scope policy and the complete PR files API to classify
    documentation-only changes. A missing policy during bootstrap runs in full.
  - Publishes GHCR images directly for non-fork runs.
  - Exports a prebuilt image handoff payload for fork runs.
- Wrapper workflow:
  [`../../.github/workflows/e2e-tests.yml`](../../.github/workflows/e2e-tests.yml)
  - Triggered by `workflow_run` from `03 - E2E`.
  - Verifies the triggering repository, workflow, commit and PR with GitHub APIs.
  - Independently reclassifies PR paths using trusted default-branch policy.
  - Reads and checks build context and transfer-state artifacts against that
    identity; artifacts cannot authorize a documentation-only success.
  - Calls the authoritative executor for same-repository code and owns the fixed
    checkpoint status, including documentation-only and blocked outcomes.
  - Cross-repository PRs receive a failed checkpoint. Their images and scripts
    are not published or executed in this privileged workflow.
- Authoritative executor:
  [`../../.github/workflows/e2e-authoritative-reusable.yml`](../../.github/workflows/e2e-authoritative-reusable.yml)
  - Runs the full E2E gate: Playwright core, Playwright harness, and deprecated
    Cypress.
- Post-merge publish flow:
  [`../../.github/workflows/publish-images.yml`](../../.github/workflows/publish-images.yml)
  - Retags and publishes release/develop images outside PR validation.

See the operator runbook for troubleshooting and expectations:
[`./e2e-ci-operator-model.md`](./e2e-ci-operator-model.md).

## 3. Execution Contract

### 3.1 Artifact contract

- `e2e-build-context-core`
  - Early metadata from `03 - E2E`.
  - Includes `event_name`, `is_fork`, `pr_number`, `pr_sha`, `base_sha`, `head_sha`.
  - `pr_sha` is the merge commit actually built; `head_sha` is the PR commit
    receiving the checkpoint. Both must match the independently verified PR.
- `e2e-build-transfer-state`
  - Late-stage metadata describing image transfer mode.
  - Includes `image_transfer` and related event context.
- `e2e-image-map`, `e2e-image-map-base`
  - GHCR image references for downstream execution.
- `e2e-image-handoff`
  - Fork-only prebuilt image archive and source image lists.
- `e2e-plugin-jars`
  - Runtime plugin payload consumed by downstream tests.

### 3.2 Transfer modes

- `ghcr`
  - Build run already published images to GHCR.
- `fork-handoff`
  - Build run exported prebuilt images. Privileged publication is blocked; this
    mode does not satisfy the E2E checkpoint.
- `none`
  - Invalid or failed transfer state; downstream execution must not pretend
    success.

### 3.3 Path behavior

- Same-repository PRs with application changes
  - `03 - E2E` builds and publishes to GHCR.
  - `E2E / Tests` consumes GHCR image maps and runs the executor.
- Same-repository documentation-only PRs
  - The build runs its lightweight context/scope job without building images.
  - The wrapper verifies scope and context, then reports a successful
    `03 Checkpoint - E2E` with an explicit documentation-only explanation.
  - This status does not claim that any test suite ran or passed.
- Cross-repository PRs
  - `03 - E2E` builds once and exports handoff payloads.
    Documentation-only changes can still skip that build.
  - `E2E / Tests` reports a failed checkpoint without executing PR code or
    publishing its image payloads. A separate unprivileged fork execution
    design is deferred; a blocked run is never treated as passing validation.
- Source classification compares `head.repo.full_name` with the current
  repository, not `head.repo.fork`. A repository that is itself a fork can
  still have normal same-repository PRs.

PR file enumeration is paginated and must match `changed_files`. Empty,
incomplete, duplicate, unavailable, changing or over-3,000-file listings cannot
skip builds. Renames must have both old and new paths inside the whitelist.
The wrapper never relies on a build artifact's self-reported scope.

## 4. Trust Boundary Model

- `pull_request` build stage is untrusted execution.
  - Prefer read-only behavior.
  - Avoid non-essential writes and shared-cache blast radius.
- `workflow_run` follow-up stage is privileged execution.
  - Runs only same-repository code, and posts checkpoint statuses in separate
    jobs with status-write permission.
  - Policy code is checked out at the wrapper's trusted `github.sha`, never at
    an artifact-supplied or cross-repository PR ref.
  - Repository/workflow/PR identity and complete file scope come from GitHub
    APIs. Artifact fields are untrusted evidence checked against that identity.

This replaces the earlier accepted privileged fork execution risk. No
cross-repository test platform or wider publishing permission is introduced.

## 5. Status and Identity Rules

- `03 Checkpoint - E2E` is the only required PR-facing E2E status.
- The wrapper workflow owns pending and terminal status reporting.
- In `workflow_run`, two identities exist:
  - run identity: what GitHub shows in Actions UI for the triggered run
  - validation identity: the code ref and commit actually validated downstream
- For PR gating, `status_sha` must equal the API-verified run and PR head SHA;
  `checkout_ref` must equal the merge SHA recorded by the build and current PR.
- Missing or mismatched context, failed/cancelled builds, missing image transfer,
  failed/skipped required suites and unverified sources remain non-success.
- The wrapper runs for every build conclusion, so cancelled builds can receive
  a terminal error instead of being left without a checkpoint result.

Operational rule: when debugging parity or "wrong SHA" reports, trust the
commit/PR status surface plus verified `checkout_ref` and `status_sha`,
not the Actions list label by itself.

`workflow_run` uses the default-branch workflow. These changes must reach that
branch before cloud runs use the new wrapper. Local contract tests are not
evidence of a successful hosted E2E run. Run the dependency-free policy tests
with `node --test .github/ci/e2e-context.test.cjs`.

## 6. What This Architecture Fixes

- Removes the old duplicate privileged fork rebuild as a steady-state design.
- Avoids image builds for verified documentation-only PRs while keeping the
  same required checkpoint name.
- Binds the full same-repository executor to the commit actually built.
- Prevents untrusted cross-repository payloads from reaching privileged jobs.

## 7. Remaining Limitations

Full E2E runs can still fail because of:

- Non-deterministic E2E tests.
- Runtime timing sensitivity across containers, DB readiness, plugins, and
  browser startup.
- Comparing the wrong audit surface when diagnosing runs.

Cross-repository contributions currently require a separate safe execution
design before they can satisfy this checkpoint. They are explicitly blocked,
not equivalent to same-repository validated runs.

## 8. Determinism Changes Landed With This Remediation

- `frontend/playwright/helpers/accept-results.ts`
  - Added full-load settling and a stable post-navigation check before polling.
- `frontend/playwright/helpers/create-analyzer-from-profile.ts`
  - Added bounded analyzer API readiness polling before save and after mock
    network creation.
  - Added safer mock cleanup to reduce teardown races.
- `frontend/playwright/tests/foundational/core/sidenav.spec.ts`
  - Changed refresh navigation waiting from `domcontentloaded` to `load`.

Policy decision: CI `retries` remains `0`; stability must come from
deterministic tests and helper behavior, not retry masking.

## 9. Decision Log

### Earlier decisions (2026-04-04)

- Mutually exclusive fork and non-fork image publication paths (superseded for
  privileged cross-repository publication in the 2026-10-14 update).
- GHCR as the canonical downstream image contract (retained for same-repo runs).
- Fork image handoff plus privileged publish instead of second rebuild
  (privileged publication is now blocked).
- Separate early build context from late transfer-state artifacts.

### Rejected

- Full privileged fork rebuild as normal behavior.
- Inferring fork/non-fork mode primarily from `workflow_run` display metadata.
- Fragile control flow that depends on artifact overwrite timing.

### Deferred

- Larger trigger-model redesign beyond this remediation.

## 10. References

### Repository references

- [`../../.github/workflows/e2e-playwright.yml`](../../.github/workflows/e2e-playwright.yml)
- [`../../.github/workflows/e2e-tests.yml`](../../.github/workflows/e2e-tests.yml)
- [`../../.github/workflows/e2e-authoritative-reusable.yml`](../../.github/workflows/e2e-authoritative-reusable.yml)
- [`../../.github/workflows/publish-images.yml`](../../.github/workflows/publish-images.yml)
- [`./e2e-ci-operator-model.md`](./e2e-ci-operator-model.md)

### Relevant PR history

- [#3298](https://github.com/DIGI-UW/OpenELIS-Global-2/pull/3298)
- [#3299](https://github.com/DIGI-UW/OpenELIS-Global-2/pull/3299)
- [#3301](https://github.com/DIGI-UW/OpenELIS-Global-2/pull/3301)
- [#3305](https://github.com/DIGI-UW/OpenELIS-Global-2/pull/3305)

### Platform references

- [GitHub workflow permissions model](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#how-permissions-are-calculated-for-a-workflow-job)
- [GitHub `workflow_run` event semantics](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#workflow_run)
- [Docker BuildKit `type=gha` cache backend](https://docs.docker.com/build/cache/backends/gha/)
