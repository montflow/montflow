---
id: I001
name: decide-status-prompt-contract
type: planning
originator: user
size: tiny
depends-on:
related-tasks: I002, I003, I099
status: pending
write-scope: none
---

# Task I001: decide the status prompt contract

## Type: planning

## Description

The standard has a prompt to create a spec, a prompt to execute one, and a
prompt to size it, but no prompt that answers "where does this spec stand?".
`mf-specs status` prints a panel for a caller that already knows the spec name;
it is not a read-only report an agent can run for a human, and it does not turn
the verifier's blockers into a recommended next command. Decide the contract
for the `spec-status` prompt once, so I002 can ship one template and I003 can
expose it without re-deciding what it says.

## Requirements

- **Report sections.** Fix the exact order and content of the report:
  declared status, derived lifecycle state, active phase, locked phases, task
  counts, phase review budgets, ready set, verification result and blocking
  codes, review evidence, and the next command. Name the source command for
  every section. A section with no source is not allowed.
- **Variables.** Fix every prompt variable in first-appearance order. `name` is
  required and uses `source: specs`, so the shared picker preselects the branch
  guess and orders pending specs before complete ones. `focus` is optional.
  Decide whether the caller supplies internal values (`status`, `state`,
  `next`) or the agent runs the commands itself; either way the prompt must not
  ask the user for a value an existing CLI can derive. No variable may duplicate
  a record the verifier owns.
- **One source of truth.** The prompt consumes `mf-specs status`, `state`,
  `next`, `check`, and the review series. It never recomputes readiness, locks,
  phase budgets, ids, or timestamps, and it must not carry a second copy of the
  ready-set or lock rules.
- **Read-only boundary.** State exactly what the prompt may not do: no writing
  `SPEC.md`, `TASK.md`, `MEMORY.md`, or a review record; no status or lock
  transition; no worker dispatch; no git mutation. When work remains it hands
  off to `spec-execute`, and when the spec is complete it says so without
  inventing work.
- **Terminal states.** Fix one explicit closing line for `inconsistent`,
  blocked, complete, no-active-phase, and missing/unreadable `SPEC.md`. Each
  line carries the diagnostic code when one exists and the exact command that
  resolves it. Never print a generic "next steps" list.
- **Entry points.** Decide how a human and an agent reach the prompt: the
  binary verb and flags, the `/specs` slash form, and whether a `spec_status`
  host tool exists. Compare against `mf-specs status`, `mf-specs execute`, and
  `mf-prompts`; do not overload an existing verb if the new mode would change
  its output. Name resolution must reuse the shared `which` rule, with an
  explicit name always winning.
- **Ambiguity.** A detached HEAD, a branch without a prefix, no candidate, or
  two prefix candidates must fail with the branch, every candidate, and the
  exact `--name`. The prompt and every entry point ask the user instead of
  guessing.
- Record the full report contract, variable table, read-only boundary,
  terminal lines, entry-point table, and ambiguity rule in `MEMORY.md`,
  sufficient for I002 and I003 to implement without asking anything.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] The report contract lists every section, its source command, and its order
- [ ] The variable table names each variable with type, required flag, source, and position
- [ ] The read-only boundary and the `spec-execute` handoff are explicit
- [ ] Every terminal state has one closing line with its code and exact next command
- [ ] The binary, slash, and host entry points are fixed, and ambiguous branch resolution asks the user
