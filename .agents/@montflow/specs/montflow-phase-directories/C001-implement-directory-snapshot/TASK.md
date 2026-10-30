---
id: C001
name: implement-directory-snapshot
type: execution
originator: planner:B099
depends-on: B099
related-tasks:
status: complete
---

# Task C001: implement directory snapshot

## Type: execution

## Description

Make the spec snapshot carry directories, inertly: add `kind` to
`SpecFileEntry`, emit directory entries from the store, and derive the
directory set inside the structure module. This task changes no finding, so a
flat tree still verifies exactly as before; C002 spends the new information.

## Requirements

- Add `kind?: 'file' | 'directory'` to `SpecFileEntry` in
  `packages/specs/src/modules/structure/structure.module.ts`, documented as
  optional with `file` as the read default. A directory entry carries empty
  content.
- Add the `kindOf` normalizer and filter both existing walkers to file entries,
  so directory entries change no finding. The directory-set helper (declared
  entries unioned with implied parents) lands in C002, when the walk consumes it.
- Update `SpecStore.snapshot` to push a directory entry for every
  `info.type === 'Directory'` in the recursive listing and `kind: 'file'` for
  files; keep the existing POSIX normalization and stat/read error mapping.
- Add a `dirEntry` (or equivalent) helper to the structure test helpers; keep
  `entry` building files.
- Add tests: a snapshot listing both files and their directories verifies
  identically to the file-only snapshot; a directory entry with a stray path is
  ignored by every existing check; the store snapshot includes nested
  directories once, POSIX-normalized, with empty content and
  `kind: 'directory'`.
- Keep every existing structure test passing unchanged — this task adds
  information, it does not tighten a check.

## Completion

- [x] `bun run --cwd packages/specs test -- src/modules/structure` and the spec-store tests pass
- [x] `bun run --cwd packages/specs ts:check` passes
- [x] A file-only snapshot and one that also lists its existing directories produce identical findings
