/**
 * Simplified `executing-spec` skill, aligned with the pi-specs
 * contract (status enum, lifecycle states, CLI) and the pi-sessions tools.
 * Injected verbatim into a spec-resume session's prompt — never discovered as
 * a Pi skill.
 */
export const EXECUTING_SPEC = `# executing-spec

Resume the named spec under \`.agents/@montflow/specs/<name>/\` and drive it toward
completion. Work one phase at a time.

## Read the state

- Read \`SPEC.md\` and every \`TASK.md\`. The active phase is the first phase holding any
  \`pending\` or \`in-progress\` task.
- Derived states: pending (idle), in-progress (a live session is bound), blocked, complete,
  inconsistent.

## Execute a phase

- Spawn sessions for the phase's pending tasks (\`session_start\`), respecting \`depends-on\`. Tasks whose
  dependencies are all complete may run in parallel.
- A task with \`Gates: Yes\` must run and pass its \`GATES.md\` before it is marked complete.
- Never mark a task \`complete\` while any \`depends-on\` target is pending or in-progress.
- Close the phase with its \`review\` task by spawning one independent reviewer session **per expected
  review series**. The expected series are the spec's own \`<name>\` series (the general reviewer,
  always present) plus one \`<name>-<profile>\` series per slug the task's \`reviewer-profiles\` list
  declares. Call \`review_create\` once per series, passing \`spec: <name>\`, that series' \`profile\`
  (omit it for the spec's own series), and the **same** \`round\` and \`phase\` on every call.
- Rounds are attributed to a phase, not ranked by it. Target \`roundForPhase(phase)\` (\`A\` → \`001\`,
  \`B\` → \`002\`) when it is free in **every** expected series, else the smallest round
  \`>= roundForPhase(phase)\` free in every series, so the phase is reviewed at one identical round
  across all of them. Each reviewer runs \`montflow-adversarial-review\`, writes
  \`.agents/@montflow/reviews/<series>/<round>/REVIEW.md\` recording \`- Phase: <phase>\` in its
  metadata, and keeps the series ledger in step. Then resolve accepted findings as \`defect\` or
  \`execution\` tasks.

## Finish

- Once the phase is approved, append its letter to \`locked-phases\` (comma-separated, prefix
  order) and commit the phase.
- Verify when done: \`bun run --cwd packages/pi-specs cli check --name <name>\` must report
  zero issues.
- Ask the user with \`ask_user\` at phase boundaries and whenever a decision is theirs.`;
