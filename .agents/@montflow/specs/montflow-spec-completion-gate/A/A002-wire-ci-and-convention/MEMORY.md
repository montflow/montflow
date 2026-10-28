# Memory

## Context

Task A002: wire the completion gate into CI and document the `Spec:` trailer
convention.

## Progress

- 2026-10-28: complete. Workflow YAML parses; specs suite 478 tests; `mf:check`
  clean.

## Findings

### 1. CI job

- `.github/workflows/verify.yml` gains `spec-completion` (`needs: [install]`),
  parallel to `build`: full-history checkout, bun install, then
  `git log --format=%B origin/${BASE_REF}..HEAD | sed -n 's/^Spec: *//p' | sort -u`.
- No trailer prints a notice and exits 0; each name runs
  `bun run --cwd packages/specs cli check --name <name> --require-complete`,
  grouped in the log. A missing spec or a non-complete one fails the job.
- `BASE_REF` is `${{ github.base_ref || 'main' }}`, so pull requests use
  `origin/main` and pushes/merge-queue fall back to `main`.
- The step name is quoted ("Every Spec: trailer …") because a second colon makes
  the YAML scalar invalid — caught by `Bun.YAML.parse`.

### 2. Docs

- `AGENTS.md` gains a "Spec completion gate" section: trailer form, CI job,
  local command, and the "declared specs only" rule.
- `packages/specs/README.md` documents `--require-complete` on `check`.

### 3. Validation

- `Bun.YAML.parse(.github/workflows/verify.yml)` — 4 jobs, 4 steps in the new
  job.
- `bun run mf:check` — all scopes clean (the new spec is in progress, so it is
  not gated until declared).

## Open Questions

- None.

## Handoff

- The phase review verifies the job and the docs; a declared in-progress spec
  must fail the job.

## Deviations

- None.
