/**
 * Simplified `authoring-feature-spec` skill, aligned with the pi-features
 * contract (frontmatter, status enum, tree verifier, CLI). Injected verbatim
 * into a feature-author run's prompt — never discovered as a Pi skill.
 */
export const AUTHORING_FEATURE_SPEC = `# authoring-feature-spec

Create exactly one feature spec under \`.agents/@montflow/features/<kebab-name>/\`, then stop.
Author the spec; do not execute it.

## Files

- \`FEATURE.md\`: frontmatter \`name\` (kebab-case, equals the directory), \`status: in-progress\`,
  \`workspace-type: in-place\`, \`author\`, \`created\` (YYYY-MM-DD), \`locked-phases:\` (empty).
  Body sections: \`## Description\`, \`## Requirements\`, \`## Tasks\`.
- \`## Tasks\` is a table \`| ID | Name | Type | Status | Gates |\` with \`Gates\` either \`Yes\` or \`No\`.
- One directory per task: \`<PHASE_LETTERS><NNN>-<kebab-name>/\` containing \`TASK.md\` and
  \`MEMORY.md\`, plus \`GATES.md\` when \`Gates\` is \`Yes\`.

## TASK.md

Frontmatter: \`id\` (\`<LETTERS><NNN>\`, matches the directory), \`name\` (matches the directory
name after the id), \`type\`, \`originator\`, \`depends-on\`, \`related-tasks\`, \`status\`.
Body sections: \`## Type: <type>\`, \`## Description\`, \`## Requirements\`, \`## Completion\`.

- \`type\`: exploratory | execution | planning | interruptor | defect | review.
- \`status\`: pending | in-progress | complete | blocked (\`defect\` is a type, never a status).
- \`originator\`: \`user\`, \`defect:<task-id>\`, or \`planner:<task-id>\`.
- \`depends-on\` may reference only tasks in the same phase or an earlier phase.

## Rules

- A phase is the leading letters of a task id (\`A001\` is phase \`A\`). End every phase with
  exactly one \`review\` task named \`<PHASE>099-review-phase\`.
- Leave \`locked-phases:\` empty and the feature \`status: in-progress\`.
- Ask the user with \`ask_user\` only when the decision is theirs (scope, naming, ambiguity);
  otherwise decide and proceed. Use \`notify_user\` for progress the user should see.
- Verify before finishing: \`bun run --cwd packages/pi-features cli check --name <name>\` must
  report zero issues.
- Touch nothing outside \`.agents/@montflow/features/\`.`;
