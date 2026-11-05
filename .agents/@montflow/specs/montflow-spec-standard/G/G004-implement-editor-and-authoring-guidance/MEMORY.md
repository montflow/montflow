# Memory

## Context

- G004 (execution): implement G001's conditional-variable contract on the workspace editor/detail and the authoring guidance.
- Read: phase brief, TASK/GATES, G001 MEMORY, and the scoped source only. No other task records.

## Progress

- Workspace `prompt-editor` (pure): earlier discrete controllers with their offered values, `chooseCondition`, and `validateCondition`/`applyCondition` refusing unknown/later/non-discrete/outside-option conditions.
- Workspace detail: `hiddenVariableNames`/`currentHiddenVariableNames` go through the package predicate; `promptVariableLines` adds controller/value and a `hidden` marker without touching stored values; `PromptDetail` renders them, grid-page supplies the set.
- Tests: save/reopen preserves `when` byte-for-byte, invalid-condition refusal, detail rendering, hidden-state flip, plus a drift test over `authoringRules()` and the packaged skill.
- Guidance: `authoringRules()` documents the union, grammar, earlier-controller rule, guard alignment, hidden branch and one example; README, packaged skill (3.2.0) and CHANGELOG restate; embedded payload regenerated and `.agents/skills/montflow-create-prompts` synced.

## Findings

- The package schema still exposes `type: text|textarea|select`; the editor and docs already support the G001 `confirm`/`truthy` controller, and verification accepts that arm.
- The round-trip needed no new schema: `PromptSummary.variables` already carries the full `Variable` records, so `when` survives `fromPrompt`/`toPrompt`/`savePrompt`.
- Visibility is never re-derived in the workspace: the detail set comes from `Prompts.isVisible` through the loaded runtime.

## Gates

- `bun run --cwd apps/workspace test`: pass (52 files, 264 tests).
- `bun run --cwd apps/workspace ts:check`: pass.
- `bun run --cwd apps/workspace lint:check`: pass.
- `bun run --cwd apps/workspace format:check`: pass.
- `bun run --cwd packages/prompts test`: pass (52 files, 687 tests).
- `bun run --cwd packages/prompts ts:check`: pass.
- `packages/prompts` lint/format fail only on sibling G003 files (`interactive.apps.module.ts`, `prompt-execute` tests); G004 files are clean. Evidence in `/tmp/G004.log`.
- Official task gate and repo-wide `mf:check`/`mf:gate` not run (orchestrator's).

## Open Questions

- Does G002 still owe `confirm` as a `Variable.type` member? `authoringRules()`/the editor support the G001 truthy form, but the current decode rejects `"type": "confirm"`.

## Handoff

- Orchestrator: run the task gate and resolve the confirm-schema question with G002; re-run package lint/format once G003's files are fixed.

## Deviations

- Regenerated `packages/prompts/src/apps/doctor/embedded-payload.generated.ts` and synced `.agents/skills/montflow-create-prompts` — both derived from the in-scope packaged skill, needed to keep the package's byte-identity tests green.
