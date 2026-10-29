---
id: B003
name: add-sync-tests
type: execution
originator: user
depends-on: B002
related-tasks: B001, B002
status: complete
---

# Task B003: add-sync-tests

## Type: execution

## Description

Cover the `sync` command at the CLI boundary: argv parsing, report text, exit
codes, and slash/binary parity. Engine behavior is covered by A001's unit tests;
this task proves the surfaces do not diverge.

## Requirements

- Colocated tests under `packages/skills/src/apps/cli/tests/`, in the same style
  as the existing `engines.test.ts` and `list-status.test.ts`.
- Fixtures are temp directories built by the test, not this repository's store.
- Cover: added, updated, unchanged, and skipped lines in the report; `--check`
  exit 1 on drift and 0 when current; unknown flag refusal; slash and binary
  producing the same report for the same fixtures.
- `bun run --cwd packages/skills test` passes.
- `turbo lint:check`, `turbo format:check`, and `turbo ts:check` pass for
  `@montflow/skills`.

## Completion

- [ ] New tests fail if `sync` skips internal skills incorrectly, writes during
      `--check`, or diverges between front ends.
- [ ] Package test, lint, format, and typecheck runs are green.
