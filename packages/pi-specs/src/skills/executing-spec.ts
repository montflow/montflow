/**
 * Simplified `executing-spec` skill, aligned with the pi-specs
 * contract (status enum, lifecycle states, CLI) and the pi-runs tools.
 * Injected verbatim into a spec-resume run's prompt — never discovered as
 * a Pi skill.
 */
export const EXECUTING_SPEC = `# executing-spec

Resume the named spec under \`.agents/@montflow/specs/<name>/\` and drive it toward
completion. Work one phase at a time.

## Read the state

- Read \`SPEC.md\` and every \`TASK.md\`. The active phase is the first phase holding any
  \`pending\` or \`in-progress\` task.
- Derived states: pending (idle), in-progress (a live run is bound), blocked, complete,
  inconsistent.

## Execute a phase

- Spawn runs for the phase's pending tasks (\`run_start\`), respecting \`depends-on\`. Tasks whose
  dependencies are all complete may run in parallel.
- A task with \`Gates: Yes\` must run and pass its \`GATES.md\` before it is marked complete.
- Never mark a task \`complete\` while any \`depends-on\` target is pending or in-progress.
- Close the phase with its \`review\` task: spawn an independent run to run \`adversarial-review\`
  over the phase and write \`.agents/@montflow/reviews/<name>/<code>.md\`, then resolve accepted
  findings as \`defect\` or \`execution\` tasks.

## Finish

- Once the phase is approved, append its letter to \`locked-phases\` (comma-separated, prefix
  order) and commit the phase.
- Verify when done: \`bun run --cwd packages/pi-specs cli check --name <name>\` must report
  zero issues.
- Ask the user with \`ask_user\` at phase boundaries and whenever a decision is theirs.`;
