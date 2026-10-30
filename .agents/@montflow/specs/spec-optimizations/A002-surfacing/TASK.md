---
id: A002
name: surfacing
type: execution
originator: user
size: small
depends-on: A001
related-tasks:
status: complete
---

# Task A002: surfacing

## Type: execution

## Description

Expose the resolved sizing through the commands an agent already runs. `status`
explains the effective configuration and every task's target, `next` carries the
target for the ready set, `resolve` prints the bare dispatch string, and `sizing`
inspects one task with an optional provenance report. Every sizing failure goes
through one agent-first diagnostic renderer.

## Requirements

- `status --name <spec>` loads the repo and spec config, reports which files were
  found (including a repo-only `.agents/@montflow/specs/sizing.json` with no spec
  file), the effective size -> `model#effort` mapping per phase, and on each task
  line the task's size plus its resolved target and source (`repo`, `spec`,
  `phase`) or `inherit`.
- `next --name <spec>` reports the same size, target, and source for every ready
  task, keeping the existing state/phase header and token-lean layout.
- `status` shows each phase's review-cycle budget and its source sizes, and
  `next` carries the active phase's budget in the header. `sizing --task` shows
  the task's own budget (`tiny` 1, `small` 2, `medium` 3, `large` 3).
- `sizing --human` includes the phase budget and the task's contribution to it,
  next to the model provenance table.
- Add `resolve --name <spec> --task <id>`. It prints exactly
  `provider/model#effort` or `inherit` and nothing else. An unknown spec, unknown
  task, or invalid config exits non-zero with an actionable message.
- Add `sizing --name <spec> --task <id> [--verbose|--human]`. The compact form is
  one line: task id, declared size, effective target or `inherit`, winning source
  layer. `--verbose` and `--human` select the same detailed mode: declared size,
  selected target, winning layer, then a table over all four sizes and every
  config layer (repo, spec, phase) showing each defined value, each missing
  value, and the winner. An unknown spec or task exits non-zero through the same
  diagnostic renderer.
- Route every sizing failure through one `Cause`-aware renderer. It extracts
  expected failures from `Cause`, prints `code`, `path`, `field`, `problem`,
  `expected`, `actual`, `fix`, `cause`, and `next`; unexpected defects are
  labelled internal and omit the stack unless `--verbose`. No command prints a
  thrown exception or a raw JSON error.
- Wire `resolve` and `sizing` through the `/specs` slash form and update the
  server command description; keep `check`, `status`, `state`, `next`, `list`,
  and `create` working unchanged.
- Make `check` aggregate and render every sizing finding through the same
  diagnostic shape, naming the file/task, field, code, and fix; it must not stop
  at the first invalid config or missing task size.
- Update the CLI tests for status, next, resolve, and sizing, including a task
  with an inherited target, a phase override, the detailed provenance table, and
  exact diagnostic output for an invalid config and a missing task.
- Test that `check` reports all sizing errors in one run and that an unexpected
  defect from `Cause` is rendered as internal with no raw stack by default.

## Completion

- [ ] `status`, `next`, `resolve`, and compact `sizing` output is recorded for a repo, spec, and phase override
- [ ] `sizing --human` shows the full four-size, three-layer provenance matrix
- [ ] `status` and `next` show the phase review budget
- [ ] A repo-only config is shown as source `repo` with no spec config present
- [ ] `resolve` prints only the dispatch string and fails on an unknown task
- [ ] Invalid config and unknown task diagnostics are recorded with code, fix, and cause
- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check`, `format:check`, and `ts:check` pass
