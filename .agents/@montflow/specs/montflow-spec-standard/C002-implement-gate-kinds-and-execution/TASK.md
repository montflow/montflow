---
id: C002
name: implement-gate-kinds-and-execution
type: execution
originator: planner:B002
size: medium
depends-on: C001
related-tasks:
status: pending
---

# Task C002: implement gate kinds and execution

## Type: execution

## Description

Make a gate stage say whether a command or a judgment proves it, and have the CLI run
the mechanical ones and record the result. Gate contents are never executed today,
which is the gap this closes.

## Requirements

- A `GATES.md` stage declares mechanical or subjective; the recognizable stage-plus-checkbox shape stays.
- `gate run` executes a mechanical stage command, captures output, and records pass or fail with the command verbatim, the exit status, and a timestamp.
- A task or phase cannot reach complete while a required mechanical gate has no recorded passing result, and `check` names the unproven gate instead of staying silent.
- Subjective stages are consumed by a reviewer role and record who judged them; the CLI never marks them passing on its own.
- Existing gate-shape checks still pass unchanged on old files, so no gate file must be rewritten to stay valid.

## Completion

- [ ] A mechanical gate runs a real command and records its result, and a subjective gate cannot be auto-passed, shown by runs rather than claimed
- [ ] A phase with an unproven required gate fails verification naming it, and passes once recorded
- [ ] Existing specs gate files verify unchanged
- [ ] Tests cover command-failure, unrecorded, and subjective paths
