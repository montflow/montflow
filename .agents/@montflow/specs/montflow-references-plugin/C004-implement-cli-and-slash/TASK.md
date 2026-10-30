---
id: C004
name: implement-cli-and-slash
type: execution
originator: user
depends-on: C003, B003
related-tasks:
status: complete
---

# Task C004: Implement the CLI and slash command

## Type: execution

## Description

Build `mf-references` and `/mf-references` over the C002/C003 engines, matching
the other `mf-*` CLIs in structure and style: `list`, `show`, `verify`, `add`,
`update`, `sync`, `status`, and `remove`, with the canonical flags and exit
rules. `doctor` is wired in C006; this task leaves the command tree ready for
it.

## Requirements

- Implement engines that take structured arguments, return data, and fail with a displayable string for every verb: list, show, verify, add, update, sync, status, remove.
- Implement pure renderers with two modes: an agent-first compact default with stable tokens, and `--human` readable tables/prose; `--verbose` stays additive and composes with both; `status` renders one row per entry with its state.
- Implement `binary.apps.module.ts` with the `effect/cli` command tree, `--dir`, `--human`, `--verbose`, `--status`, `--all`, `--clones`, `--name`, `--ref`, `--purpose`, `--force`, `--fetch`, and `--keep-clone`; `main.ts` starts with `#!/usr/bin/env bun`.
- Implement the hand-rolled slash parser in `slash.apps.module.ts` over the same engines and renderers, with `run` and `register`.
- Expose the same verb set on both front ends; keep `sync` with no name and no `--all` a usage error, and `status` with no name an all-entry summary.
- Set non-zero exit inside the handler; never call `process.exit`.
- Cover the engines, the slash parser, both render modes, and the add/update/sync/status/remove edge cases with tests.
- `bun run --cwd packages/references cli --help` and `--version` work; `test` and `ts:check` pass.
- No file outside `packages/references/` and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Eight verbs implemented over shared engines and renderers
- [ ] Binary and slash command expose the same verb set
- [ ] Add/update/sync/status/remove edge cases and exit codes tested
