---
id: B008
name: persist-tools-allowlist
type: execution
originator: defect:B007
depends-on: B007
related-tasks: B099
finding-ref: F8
status: complete
---

# Task B008: Persist the tools allowlist across resume

## Type: execution

## Description

Review F8: `RunnerStartInput.tools` is applied on `start` but never persisted,
so `resume` runs with Pi's full default tool set. Add a `tools` field to the
`Run` descriptor (and `Store.create`), persist it on start, and replay it on
resume so a run behaves identically across machines.

## Requirements

- `Run.tools?: string[]` (or equivalent), persisted and preserved by `withExtras`.
- `resume` passes the stored allowlist to the session factory.
- Tests: start with a restricted allowlist → resume replays the same allowlist.
- Gates green.

## Completion

- [ ] F8 resolved with evidence
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
