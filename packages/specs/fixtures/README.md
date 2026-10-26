# Fixtures

Repo-tracked sample specs for exercising the CLI and the Pi extension
without touching a real workspace. They live under a realistic root so the
default `.agents/@montflow/specs` path works when you `cd` into this
directory.

- `mock-ok` — a fully valid, **pending** phase: execution task with
  `GATES.md`, exploratory task depending on it, and a phase-end `review`
  task. Passes with 0 issues; derived state `pending`.
- `mock-complete` — a finished, consistent spec: `status: complete`,
  phase A locked, every task complete. Passes; derived state `complete`.
- `mock-stale` — a bookkeeping contradiction: all tasks complete and phase
  A locked, but `status: in-progress`. Fails with 1 issue; derived state
  `inconsistent`.
- `mock-bad` — deliberately broken. Surfaces 10 issues across the failure
  classes: unknown task type, missing `MEMORY.md`, table/status drift, a
  forward-phase dependency, a `Gates` column with no `GATES.md`, a
  `MEMORY.md` missing a section, a placeholder `GATES.md`, a table row
  with no task directory, and a phase with no `review` task.
- `sizing.json` at this root — a repo-only sizing config (`tiny`, `small`)
  proving the repo file is a root config and never a spec.
- `mock-ok/sizing.json` — the spec layer plus a phase A override, so the
  fixtures prove repo < spec < phase precedence, whole-entry replacement,
  and `inherit` fallback. Its task sizes exercise every source: `A001` is
  `tiny` (phase override), `A002` is `small` (spec layer), the review task
  is `medium` (`inherit`).
- `mock-complete` has no spec config and its `A001` is `small`, so the repo
  layer is the winning source there.

## Standalone binary

```bash
bun run --cwd packages/specs build:cli
cd packages/specs/fixtures
../dist/mf-specs check            # exits 1: mock-bad, mock-stale
../dist/mf-specs check --verbose  # also lists the passing specs
../dist/mf-specs status --name mock-ok        # state pending, sizing sources
../dist/mf-specs status --name mock-complete  # state complete, repo-only source
../dist/mf-specs status --name mock-stale     # state inconsistent, exit 1
../dist/mf-specs next --name mock-ok          # ready set with target and budget
../dist/mf-specs resolve --name mock-ok --task A001   # fixture/phase-model#high
../dist/mf-specs sizing --name mock-ok --task A001 --human  # provenance matrix
```

## From source

```bash
bun run --cwd packages/specs fixtures:check
```

## Automated

`src/apps/cli/tests/fixtures.test.ts` reads these directories and asserts
each fixture's expected verdict.
