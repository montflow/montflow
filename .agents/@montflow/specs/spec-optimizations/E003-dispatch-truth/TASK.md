---
id: E003
name: dispatch-truth
type: execution
originator: user
size: small
depends-on: E001
related-tasks:
status: pending
---

# Task E003: dispatch-truth

## Type: execution

## Description

The audit found two truthfulness gaps. `next --name mock-bad` exits 0 while `check` reports 10 issues, and `models --verify --provider alpha` prints a bare success line after checking zero entries.

Make both surfaces state what they actually know.

## Requirements

- `next` exits 1 when tree verification reports any error, not only config or task-size errors; it still prints the ready set and the blocker diagnostics.
- `status` and `next` agree on blockers and exit for the same tree; `execute` keeps refusing before dispatch.
- `/specs next` reports `ok: false` under the same rule.
- `models --verify` always reports the number of entries checked and skipped, split by layer and by the provider filter; a zero-entry run says `0 entries checked` and never prints a bare success line.
- The `spec_models` verify action returns the same counts.
- Tests cover `mock-bad` next exit 1, a valid spec exit 0, the zero-entry provider filter, repo and spec counts, and the slash ok flags.

## Completion

- [ ] `next --name mock-bad` exits 1 and still prints the ready set
- [ ] A valid spec still exits 0 from `next`
- [ ] `models --verify` always prints checked and skipped counts
- [ ] `spec_models verify` matches the binary counts
- [ ] Slash truthfulness and count tests pass
