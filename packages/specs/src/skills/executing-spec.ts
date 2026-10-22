/**
 * Simplified `executing-spec` skill, aligned with the pi-specs
 * contract (status enum, lifecycle states, CLI) and the native subagent tool.
 * Injected verbatim into a spec-resume session's prompt — never discovered as
 * a Pi skill.
 */
export const EXECUTING_SPEC = `# executing-spec

Resume the named spec under \`.agents/@montflow/specs/<name>/\` and drive it toward
completion. Work one phase at a time.

## Read the state

- Read \`SPEC.md\` and every \`TASK.md\`. The active phase is the first phase holding any
  \`pending\` or \`in-progress\` task.
- Derived states: pending (idle), in-progress (work has started), blocked, complete,
  inconsistent.

## Execute a phase

- Dispatch one subagent per pending task (the \`subagent\` tool), respecting \`depends-on\`. Tasks whose
  dependencies are all complete may run in parallel.
- A task with \`Gates: Yes\` must run and pass its \`GATES.md\` before it is marked complete.
- Never mark a task \`complete\` while any \`depends-on\` target is pending or in-progress.
- Close the phase with its \`review\` task: dispatch an independent subagent to run \`montflow-adversarial-review\`
  over the phase and write round \`<NNN>/REVIEW.md\` of the review series that shares the spec's name
  (\`.agents/@montflow/reviews/<name>/<NNN>/REVIEW.md\`, phase \`A\` → \`001\`, \`B\` → \`002\`, …), keeping the
  series ledger in step, then resolve accepted findings as \`defect\` or \`execution\` tasks.

## Finish

- Once the phase is approved, append its letter to \`locked-phases\` (comma-separated, prefix
  order) and commit the phase.
- Verify when done: \`bun run --cwd packages/pi-specs cli check --name <name>\` must report
  zero issues.
- Ask the user with \`ask_user\` at phase boundaries and whenever a decision is theirs.`;
