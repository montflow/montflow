/**
 * Simplified `authoring-spec` skill, aligned with the pi-specs
 * contract (frontmatter, status enum, tree verifier, CLI). Injected verbatim
 * into a spec-author session's prompt — never discovered as a Pi skill.
 */
export const AUTHORING_SPEC = `# authoring-spec

Create exactly one spec under \`.agents/@montflow/specs/<kebab-name>/\`, then stop.
Author the spec; do not execute it.

## Files

- \`SPEC.md\`: frontmatter \`name\` (kebab-case, equals the directory), \`status: in-progress\`,
  \`workspace-type: in-place\`, \`author\`, \`created\` (YYYY-MM-DD), \`locked-phases:\` (empty).
  Body sections: \`## Description\`, \`## Requirements\`, \`## Tasks\`.
- \`## Tasks\` is a table \`| ID | Name | Type | Status | Gates |\` with \`Gates\` either \`Yes\` or \`No\`.
- One directory per task: \`<PHASE_LETTERS><NNN>-<kebab-name>/\` containing \`TASK.md\` and
  \`MEMORY.md\`, plus \`GATES.md\` when \`Gates\` is \`Yes\`.

## Scaffold

Start from the mechanical scaffold — one model-free command that writes a tree which
already passes \`check\`:

\`bun run --cwd packages/specs cli create --name <name> [--description "<line>"] [--author "<name>"] [--tasks "<name>[:<type>[:gates]],…"] [--reviewer-profiles "<a>,<b>"]\`

Each task is \`name[:type[:gates]]\` (type defaults to \`execution\`); the command appends
\`<PHASE>099-review-phase\` and refuses to overwrite an existing spec. \`--reviewer-profiles\`
seeds the review task's profile list. Then edit the rendered files to carry the real
requirements.

## TASK.md

Frontmatter: \`id\` (\`<LETTERS><NNN>\`, matches the directory), \`name\` (matches the directory
name after the id), \`type\`, \`originator\`, \`depends-on\`, \`related-tasks\`, \`reviewer-profiles\`,
\`finding-ref\`, \`status\`.
Body sections: \`## Type: <type>\`, \`## Description\`, \`## Requirements\`, \`## Completion\`.

- \`type\`: exploratory | execution | planning | interruptor | defect | review.
- \`status\`: pending | in-progress | complete | blocked (\`defect\` is a type, never a status).
- \`originator\`: \`user\`, \`defect:<task-id>\`, or \`planner:<task-id>\`.
- \`depends-on\` may reference only tasks in the same phase or an earlier phase.
- \`reviewer-profiles\` (\`review\` tasks only): comma-separated ordered reviewer profile
  slugs (\`reviewer-profiles: effect-reviewer, generic-reviewer\`). Empty or absent keeps the
  single general reviewer; each entry adds a \`<spec>-<profile>\` review series, and the phase's
  review round is written to every expected series (the spec's own plus one per profile) at the
  same round. Declare \`effect-reviewer\` on **code phases** — any phase holding an \`execution\`
  or \`defect\` task; exploration and planning phases stay empty.
- \`finding-ref\` (\`defect\` tasks only): a fully-qualified finding locator,
  \`<series>/<round>/F<n>\` (e.g. \`ship-login/002/F2\`).

## Rules

- A phase is the leading letters of a task id (\`A001\` is phase \`A\`). End every phase with
  exactly one \`review\` task named \`<PHASE>099-review-phase\`.
- Leave \`locked-phases:\` empty and the spec \`status: in-progress\`.
- Ask the user with \`ask_user\` only when the decision is theirs (scope, naming, ambiguity);
  otherwise decide and proceed. Use \`notify_user\` for progress the user should see.
- Verify before finishing: \`bun run --cwd packages/specs cli check --name <name>\` must
  report zero issues.
- Touch nothing outside \`.agents/@montflow/specs/\`.`;
