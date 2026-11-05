# Memory

## Context

- G003 (execution, tiny): make the interactive fill and the CLI honour G001/G002 visibility and the declared variable kinds.
- Read: phase brief, `TASK.md`/`GATES.md`, G001 contract, and scoped source only. Write scope: `apps/interactive`, `apps/cli`, `modules/prompt-execute`, this file. Log: `/tmp/G003.log`.

## Progress

- `fillInputs` rewritten: declared order, `ui.select` for `select`, `ui.input` for text/textarea, shared `isVisible` only, hidden answers deleted after every answer, controller always re-asked on a re-fill, `provided` set keeps CLI-supplied values unasked.
- `PromptExecute`: `VariableSummary` gained `condition` and `visible`; `inspect` resolves through `resolveValues`/`missingRequired`; `table` omits hidden rows and appends `when <condition>` to TYPE; new `resolveInputs`, `invalidOptionMessage`, and `invalid-values` plan problem.
- CLI `render` and `execute` both pass values through `resolveInputs`: hidden values dropped, select outside options refused, missing reads only visible required.
- Interactive `renderValues`/`executeFlow` validate supplied values through the same helper before filling.
- Tests added/updated: fill yes path, no path, yes→no→yes clearing, re-fill visibility, select list/default, supplied controller; inspect/table visibility + hidden missing; execute hidden stale + invalid option; CLI render/execute parity and refusal.

## Findings

- G002 left `confirm` out of `Prompts.Variable.type`, so `truthy` stays supported only by the dormant schema/verifier path; no `ui.confirm` branch can be reached without widening `modules/prompts`, which is outside this task's scope. Recorded as accepted dormancy, not a defect.
- A controller must be re-asked on a re-fill (even when answered) or yes→no→yes can never switch; non-controllers still skip answered values, preserving the CLI "supplied values are not asked" rule.
- `renderValues`/`executeFlow` pass non-empty supplied names as `provided`, so a CLI-supplied controller is skipped while a menu re-fill still asks it.
- Table keeps its original five columns; the condition is a TYPE-cell suffix only when present, so the documented skill sample stays byte-identical.

## Gates

- `bun run --cwd packages/prompts test` → exit 0, 52 files / 687 tests passed, typecheck clean.
- `bun run --cwd packages/prompts ts:check` → exit 0.
- `bun run --cwd packages/prompts lint:check` → exit 0.
- `bun run --cwd packages/prompts format:check` → exit 0.
- Full log: `/tmp/G003.log`. Official gate and repo-wide checks intentionally not run.

## Open Questions

- None for this task.

## Handoff

- G004 (editor/authoring) can reuse `PromptExecute.resolveInputs` and `invalidOptionMessage` for the same acceptance message; `table` now hides non-visible variables.

## Deviations

- `confirm` kind deferred (see Findings) because adding it requires widening `Prompts.Variable.type`, outside the declared write scope.
- No spec state, TASK.md checkbox, PHASE.md, or other task file edited; no claim/gate/mail verb called.
