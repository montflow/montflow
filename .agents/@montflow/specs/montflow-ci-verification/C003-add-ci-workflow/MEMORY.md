# Memory

## Context

Task C003: author `.github/workflows/verify.yml` as a push-to-main matrix of
per-artifact verifications plus repo checks (B001 decisions 1–2).

## Progress

- 2026-10-07: complete.

## Findings

### Workflow

`.github/workflows/verify.yml`, name `Verify`:

- `on: push: branches: [main]` only.
- Top-level `permissions: {}`; the job uses `contents: read`.
- `concurrency: { group: verify-${{ github.ref }}, cancel-in-progress: true }`.
- `timeout-minutes: 15`; `strategy.fail-fast: false`.
- One matrix job, nine `include` cells, each `target → exact script`:
  lint→`lint:check`, format→`format:check`, typecheck→`ts:check`, test→`test`,
  skills→`verify:montflow:skills`, prompts→`verify:montflow:prompts`,
  specs→`verify:montflow:specs`, profiles→`verify:montflow:profiles`,
  runs→`verify:montflow:runs`.
- Job `name: ${{ matrix.target }} (${{ matrix.script }})`.
- Each cell repeats the release.yml preamble: checkout, setup-bun `1.3.13`,
  cache `~/.bun/install/cache` on `bun.lock`, `bun install --frozen-lockfile`.
- Header comment records the `release.yml` boundary and the push-to-main-only
  limitation.

### Verification

- Every referenced root script exists (`node -e` over `package.json`).
- The workflow is 82 lines, `permissions`/`triggers` match B001.
- YAML parse was not run (no yaml lib in the toolchain); GitHub validates on
  push. The document is plain mapping/sequence YAML.

## Open Questions

- Whether to add a `pull_request` trigger or a required `Verify` status check
  (accepted limitation, recorded in the header).

## Handoff

- Feeds C005 verify-release-boundary.

## Deviations

- Dropped the plan's separate `setup` job: it would have no outputs to feed the
  matrix, and its cache is not shared across runners (release.yml documents
  this). Each cell installs with the warm store cache instead.
