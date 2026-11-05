# Memory

## Context

- G100 (execution, tiny): add the `confirm` kind end to end per G001's decided contract.
- Read: phase `## Execution Brief`, `TASK.md`/`GATES.md`, G001 `MEMORY.md`, and the scoped source paths only.
- Baseline: G002-G004 shipped text/textarea/select, so `type: confirm` was rejected and the `ui.confirm` path was unreachable.

## Progress

- Schema: `Variable.type`/`VariableFile.type` and the file-value interfaces now accept `confirm`.
  Decode normalizes a confirm to `required: false`, `default: ""`, `options: []`; encode omits all
  three, so `{"name":"flag","type":"confirm"}` round-trips minimally. Authored options/default/required
  on a confirm are normalized away rather than fatal.
- Verification: existing rows already accepted a confirm controller through the widened local type;
  confirm+truthy now verifies, confirm+equals is still refused.
- Visibility/missing: `missingRequired` never reports an unchecked confirm, even if hand-built with
  `required: true`; `isVisible` already treats a non-empty confirm value as truthy.
- `PromptExecute`: `VariableSummary.type` widened; `resolveInputs` accepts `"yes"`/`""` and refuses
  anything else with `invalidConfirmMessage`; inspect/table expose the confirm kind and truthy condition.
- Interactive fill: a confirm is asked through `ui.confirm` (never `ui.input`/`ui.select`), stores
  `"yes"` or `""`, and clearing dependents still runs after every answer.
- CLI `render`/`execute` inherit confirm validation through `resolveInputs`.
- Workspace editor needed no logic change: `conditionControllers`/`validateCondition`/`chooseCondition`
  were already confirm-aware; acceptance and save/reopen round-trip are now proven by tests.
- Tests added: confirm codec round-trip, truthy visible/hidden (including hidden controller), missing
  required, ui.confirm asked path + clearing, PromptExecute inspect/table/invalid value, CLI render/
  execute accept/reject, workspace editor decode/apply/save/reopen. All existing prompt fixtures pass.

## Findings

- Canonical confirm values are `"yes"` and `""`; `"no"` is not accepted (empty means no), matching G001.
- The editor's `ConditionController.values` stays `["yes"]`; `chooseCondition` maps the checked answer
  to `{ truthy: true }`, so no editor API change was needed.
- No installed or payload prompt uses `confirm`/`when`; unchanged fixtures still verify.

## Gates

- `bun run --cwd packages/prompts test` — pass (723 tests).
- `bun run --cwd apps/workspace test` — pass.
- `bun run --cwd packages/prompts ts:check` / `lint:check` / `format:check` — pass.
- `bun run --cwd apps/workspace ts:check` / `lint:check` / `format:check` — pass.
- Full output: `/tmp/G100.log`. `GATES.md` stages are left to the orchestrator.

## Open Questions

- None.

## Handoff

- Orchestrator: run the two `GATES.md` stages at completion. No spec state, status, or ledger changed.
- Reviewer focus: the normalization choice (authored confirm `required`/`default`/`options` are dropped
  silently) and the `"no"` rejection are the two contract decisions worth confirming.

## Deviations

- No `claim` call: the dispatch already bound G100, and the task directory allows no extra files. No
  spec state was read or written beyond the brief and this record.
