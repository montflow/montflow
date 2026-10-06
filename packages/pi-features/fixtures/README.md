# Fixtures

Repo-tracked sample features for exercising the CLI and the Pi extension
without touching a real workspace. They live under a realistic root so the
default `.agents/@montflow/features` path works when you `cd` into this
directory.

- `mock-ok` — a fully valid, **pending** phase: execution task with
  `GATES.md`, exploratory task depending on it, and a phase-end `review`
  task. Passes with 0 issues; derived state `pending`.
- `mock-complete` — a finished, consistent feature: `status: complete`,
  phase A locked, every task complete. Passes; derived state `complete`.
- `mock-stale` — a bookkeeping contradiction: all tasks complete and phase
  A locked, but `status: in-progress`. Fails with 1 issue; derived state
  `inconsistent`.
- `mock-bad` — deliberately broken. Surfaces 10 issues across the failure
  classes: unknown task type, missing `MEMORY.md`, table/status drift, a
  forward-phase dependency, a `Gates` column with no `GATES.md`, a
  `MEMORY.md` missing a section, a placeholder `GATES.md`, a table row
  with no task directory, and a phase with no `review` task.

## Standalone binary

```bash
bun run --cwd packages/pi-features build:cli
cd packages/pi-features/fixtures
../dist/mf-features check            # exits 1: mock-bad, mock-stale
../dist/mf-features check --verbose  # also lists the passing features
../dist/mf-features status --name mock-ok        # state pending
../dist/mf-features status --name mock-complete  # state complete
../dist/mf-features status --name mock-stale     # state inconsistent, exit 1
```

## From source

```bash
bun run --cwd packages/pi-features fixtures:check
```

## Automated

`src/apps/cli/tests/fixtures.test.ts` reads these directories and asserts
each fixture's expected verdict.
