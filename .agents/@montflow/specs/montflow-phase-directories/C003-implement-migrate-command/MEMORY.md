# Memory

## Context

Task C003: add the one-shot `mf-specs migrate` verb that rewrites a flat spec
into `<PHASE>/<PHASE><NNN>-<name>/` without editing a file. Contract source:
B002 §3. D001 runs it over the six repository trees; D003 deletes the legacy
warning once none is left.

## Progress

- 2026-10-28: complete. Package suite 446 tests green; lint, format, typecheck
  clean; fixtures keep their documented verdicts.

## Findings

### 1. Plan (`planMigration`)

- `rootDirsOf` collects root-level directories, declared or implied by file
  paths, so a file-only snapshot still plans.
- `planMigration(snapshot)` returns `migrate` with one `{ from, to }` per root
  task directory (phases in `phaseRank` order, then id), `already` when phase
  directories exist and no flat ones do, and `refused` with the exact B002 §3
  message for a mixed tree or a tree with no task directories.
- Pure; it never touches the store.

### 2. Store (`SpecStore.move`)

- `move(root, name, from, to)` creates the destination's parent, refuses an
  existing destination with `Cannot move '<from>': '<to>' already exists.`, and
  renames. Errors map to `StoreError` with operation `SpecStore.move`.
- Real-filesystem test: moves `A001-implement` to `A/A001-implement`, asserts
  the snapshot lists `A`, the nested task dir, and the file; a second move onto
  itself fails with `already exists`.

### 3. CLI

- `migrate --name <spec> | --all [--dry-run] [--dir]`; using neither selector is
  a user error. `--dry-run` prints `would move '<from>' -> '<to>'` and writes
  nothing; a real run prints `moved '<from>' -> '<to>'`.
- After moving, the spec is snapshotted and verified; a non-clean result marks
  the spec `failed` and the command exits non-zero. A refusal or failure also
  exits non-zero; an already-migrated spec prints
  `'<name>' is already in the phase layout — nothing to migrate.` and exits 0.
- Slash form: `migrate` is a first-class command, accepts `--name`, `--dir`,
  `--all`, `--dry-run`, and returns the same report.
- `SPEC.md` is never touched; only task directories are renamed.

### 4. Tests (`migrate.test.ts` + store test)

- Plan: one phase, two phases ordered by rank, mixed refusal, already, no tasks.
- Engine: migrate + verify clean, dry-run leaves the map identical, no-op on a
  migrated spec, refusal moves nothing, `--all` migrates both specs.
- `renderMigrate` shows the planned/moved verb and the summary.
- The CLI test stub gained `move`, and the inline stub in `list.test.ts` too.

### 5. Gates

- `bun run --cwd packages/specs test` — 56 files / 446 tests, no type errors.
- `bun run --cwd packages/specs lint:check` — clean.
- `bun run --cwd packages/specs format:check` — clean after `format:fix`.
- `bun run --cwd packages/specs ts:check` — clean.
- `bun run --cwd packages/specs fixtures:check` — 4 specs, 2 failed
  (`mock-bad` 10, `mock-stale` 1), as documented.

## Open Questions

- None.

## Handoff

- D001 runs `migrate --all` over `.agents/@montflow/specs`; D002 exercises it on
  `mock-legacy`; D003 removes the warning branch.

## Deviations

- None.
