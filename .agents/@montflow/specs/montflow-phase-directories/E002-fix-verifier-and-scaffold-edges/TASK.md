---
id: E002
name: fix-verifier-and-scaffold-edges
type: defect
originator: defect:D099
depends-on: D004
related-tasks: C002
status: complete
---

# Task E002: fix verifier and scaffold edges

## Type: defect

## Description

Close the verifier edge cases found in rounds 003–004: declared directories
deeper than one level slipping past the task-directory check, a non-task
directory in a phase reporting the wrong finding, and the scaffold accepting an
invalid phase.

## Requirements

- `directoryPaths` adds the parents of every declared directory, so a declared
  `sub/deep` inside a task directory is visible as `sub`.
- A directory inside a task directory is always F6, even when it also holds a
  file (the deep file keeps its own F8 finding).
- A directory in a phase that is not task-shaped reports
  `Unexpected directory in a phase directory; a phase holds task directories only.`
- `renderSpecScaffold` throws on a phase that does not match `PHASE_PATTERN`.
- `SpecFileEntry`'s doc example uses the nested path.

## Completion

- [x] New structure cases for the deep declared directory and the non-task phase directory pass.
- [x] The scaffold rejects `phase: 'ab'`.
- [x] `bun run --cwd packages/specs test` passes.
