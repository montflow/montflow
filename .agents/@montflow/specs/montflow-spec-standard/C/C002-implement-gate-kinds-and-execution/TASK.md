---
id: C002
name: implement-gate-kinds-and-execution
type: execution
originator: planner:B004
size: medium
depends-on: C001
related-tasks:
status: complete
---

# Task C002: implement gate kinds and execution

## Type: execution

## Description

Make a gate stage say whether a command or a judgment proves it, and have the CLI run
the mechanical ones and record the result. Gate contents are never executed today,
which is the gap this closes.

## Requirements

- A `GATES.md` stage declares mechanical or subjective; the recognizable stage-plus-checkbox shape stays.
- `gate run` executes a mechanical stage command, captures output, and records pass or fail with the command verbatim, the exit status, and a timestamp. It accepts `--stage <n>` for one stage and `--all` to continue through every stage after a failure; with neither, it runs every mechanical stage in order and stops at the first failure.
- Only a session holding the spec's orchestrator binding may call `gate run`; a worker caller is `gate.not-orchestrator`. The verb writes only `GATE-RESULTS.jsonl`.
- A task or phase cannot reach complete while a required mechanical gate has no recorded passing result, and `check` names the unproven gate instead of staying silent.
- Subjective stages are consumed by a reviewer role and record who judged them; the CLI never marks them passing on its own.
- Existing gate-shape checks still pass unchanged on old files, so no gate file must be rewritten to stay valid.
- The shipped `spec-execute` prompt stops saying `mf-specs` ships no gate runner and instead names `gate run` as the mechanical proof.

## Completion

- [x] A mechanical gate runs a real command and records its result, and a subjective gate cannot be auto-passed, shown by runs rather than claimed
- [x] A phase with an unproven required gate fails verification naming it, and passes once recorded
- [x] Existing specs gate files verify unchanged
- [x] Tests cover command-failure, unrecorded, and subjective paths, plus the no-`--stage` default (stops at first failure) and `--all` (continues and records every stage)
