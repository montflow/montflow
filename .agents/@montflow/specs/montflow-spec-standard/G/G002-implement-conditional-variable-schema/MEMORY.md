# Memory

## Context

- G002 implements G001's conditional-variable contract in `@montflow/prompts` only.
- Read: phase `## Execution Brief`, TASK/GATES, G001 `MEMORY.md`, `packages/prompts/src/modules/prompts/` source and tests. No BOARD.md or MAILBOX.md exists for phase G.
- Scope: schema, pure resolution/rendering, verification, colocated tests. No UI/CLI/editor work (G003/G004).

## Progress

- `VariableCondition` struct (`controller`, optional `equals` / literal `truthy`) added; `Variable.when` optional.
- `VariableEntry` decodes/encodes conditions minimally; a variable without `when` emits no key and the old-shape fixture encodes byte-identically.
- Exported `isVisible(name, variables, values)` and `visibleVariables(...)`; `resolveValues`, `missingRequired`, `renderToString`/`renderPrompt` all route through `isVisible` (hidden => `''`, never missing, stale supplied answer dropped).
- `verifyPrompt` gained: unknown controller, later controller, non-discrete controller, kind mismatch, `equals` not an option, both/neither form, unused conditional, guard-on-controller. Existing bijection/order/required-default checks retained.
- Tests added for codec round-trip, effective value, nested hidden, hidden required, hidden rendering, stale clearing, and each verify reject; existing repo prompt fixture (`commit`) still verifies.

## Findings

- `confirm` is not yet a member of `Variable.type`: the declared write scope excludes `modules/prompt-execute`, whose `VariableSummary.type` is a narrower literal union and would fail `ts:check` if widened here. `truthy` verification is implemented structurally, but no valid `confirm` controller can exist until a consumer task adds that kind and widens `prompt-execute`.
- `isVisible` walks backwards only and bounds recursion, so a malformed later/cyclic controller cannot loop; the verifier rejects it first.
- Guard rule reports `{{#if <controller>}}`; a select's `"no"` is non-empty, so such a guard is always true.

## Gates

- `bun run --cwd packages/prompts test`: 50 files, 643 tests passed, no type errors.
- `bun run --cwd packages/prompts ts:check`: pass.
- `bun run --cwd packages/prompts lint:check`: pass.
- `bun run --cwd packages/prompts format:check`: pass.
- Full output: `/tmp/G002.log`. Official task/phase gate not run (orchestrator-owned).

## Open Questions

- Should `confirm` (and the `truthy` accept path) land in G003 with the `prompt-execute` widening? G001 decided `confirm`; G002 cannot add it inside its write scope without breaking typecheck.
- G001 left "warn vs silently drop a supplied hidden value" open; G002 follows the decided silent drop.

## Handoff

- G003/G004 can rely on `isVisible`, `visibleVariables`, and `resolveValues` for hidden handling; do not re-derive conditions.
- When adding `confirm`, extend `Variable.type`/`VariableFile`/`ResolvedVariableFile`, widen `VariableSummary.type` in `modules/prompt-execute`, and add a truthy accept fixture.

## Deviations

- `confirm` kind not added (write-scope conflict noted above). No spec state, TASK checkboxes, SPEC.md, or PHASE.md touched.
