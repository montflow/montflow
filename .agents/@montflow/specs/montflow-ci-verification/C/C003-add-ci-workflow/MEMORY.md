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
  sessions→`verify:montflow:sessions`.
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

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- triggers `push` to `main` only — no longer true: `.github/workflows/verify.yml`
  now triggers on `push`, `pull_request`, `merge_group`, and
  `workflow_dispatch`. The claim was true of the original push-to-main workflow
  in this task's MEMORY; later CI work widened it. Left unchecked, not ticked.
- a deliberately broken artifact fails its cell and names the target — not
  re-run (no safe way to break an artifact from this review); the matrix still
  gives each target its own cell (`target` + `script`, `fail-fast: false`), but
  the behavioural claim has no fresh run evidence. Left unchecked, not ticked.
