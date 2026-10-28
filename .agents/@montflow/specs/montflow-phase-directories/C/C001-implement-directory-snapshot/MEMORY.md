# Memory

## Context

Task C001: make the spec snapshot carry directories, inertly. Contract source:
B001 §2 and C001's own TASK.md. `montflow-spec-standard/C001` keeps `PHASE.md`
and versioning; this task adds no layout rule.

## Progress

- 2026-10-28: complete. Package suite 56 files / 412 tests green; lint, format,
  and typecheck clean; `mf:check:specs` 7 specs / 0 issues.

## Findings

### 1. `SpecFileEntry.kind`

- `packages/specs/src/modules/structure/structure.module.ts`: `SpecFileEntry`
  gains `kind?: 'file' | 'directory'` and the doc says a directory entry carries
  empty content; `SpecSnapshot.files` is documented as files plus optional
  directories.
- `kindOf(entry)` normalizes a missing kind to `'file'`.

### 2. Inertness

- `verifySpecTree` filters `snapshot.files` to file entries once at the top and
  uses that list for the root stray check, the `SPEC.md` lookup, and the task
  directory buckets. Directory entries therefore change no finding in this task.
- The directory-set helper is **not** added here: it has no consumer until C002
  rewrites the walk, so C002 owns `parentOf` / `baseOf` / `directoryPaths`.
  Recorded as a deviation from C001's original wording.

### 3. Store

- `SpecStore.snapshot` pushes `{ path, content: '', kind: 'directory' }` for
  every `info.type === 'Directory'` from the recursive listing and tags files
  `kind: 'file'`. Non-file, non-directory entries are still skipped; POSIX
  normalization and error mapping unchanged.
- The store test now creates `A/A001-implement-login/` plus an empty `B/` and
  asserts the exact `[path, kind]` pairs, including the empty directory with
  empty content.

### 4. Tests

- `structure/tests/helpers.ts` gains `dirEntry(path)`.
- New structure cases: a valid spec that lists its two task directories verifies
  identically; a stray root directory entry is ignored by the file checks (C002
  turns that into F2).
- No existing assertion changed; the same tree with and without directory
  entries produces the same issues.

### 5. Gates

- `bun run --cwd packages/specs test` — 56 files / 412 tests, no type errors.
- `bun run --cwd packages/specs lint:check` — clean.
- `bun run --cwd packages/specs format:check` — clean after `format:fix`.
- `bun run --cwd packages/specs ts:check` — clean.
- `bun run mf:check:specs` — 7 specs, 0 failed, 0 issues.

## Open Questions

- None.

## Handoff

- C002 consumes `kindOf` and adds the directory-set helpers; D002 migrates the
  fixture expectations that C002 moves.

## Deviations

- Directory-set helper deferred from C001 to C002 (no consumer before the walk
  rewrite; adding it unused would fail lint or export dead API).
