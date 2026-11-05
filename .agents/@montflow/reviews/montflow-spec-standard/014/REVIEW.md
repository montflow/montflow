# Review: montflow-spec-standard / 014

## Metadata
- Target: spec montflow-spec-standard phase G
- Round: 014
- Phase: G
- Type: re-review
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Disposition: minor-deferred
- Deferred: F11, F12, F13
- Overflow: user-authorized second round for phase G after the round 013 fix batch
- Overflow-authorized: user
- Created: 2026-11-04

## Findings

### Verdicts on round 013 (F1–F10)

Verified against the working tree, not the `[Fixer]` narrative. `Resolved` means
the fix is in the code and an executed test pins it.

| ID | Verdict | Evidence |
| -- | ------- | -------- |
| F1 | Resolved | Guard loop skips a guarded controller with its own `when` (`packages/prompts/src/modules/prompts/prompts.module.ts:978-989`); two-level `isolated → origin → origin_branch` probes `{ valid: true }`; `verify.test.ts:485` accepts, `:509` still rejects `{{#if isolated}}`. Both are synchronous tests, so both execute. |
| F2 | Resolved | `editPromptCondition` (`apps/workspace/src/grid-page.tsx:416-489`) is bound as `workspace.condition` (`:578`) and reaches `applyConditionByName` (`:465`); the other three helpers have executing `it.effect` tests (`prompt-editor.test.ts:42-113`). The refusal test it cites is inert — tracked as F12 — but the missing caller is gone. |
| F3 | Resolved | `resolveFile` preserves stated `options`/`default`/`required` on a confirm (`prompts.module.ts:201-218`) and `verifyPrompt` emits one issue with a fix per field (`:803-831`); probe returns three issues, and `verify.test.ts:249/264/271` execute (synchronous bodies). |
| F4 | Resolved | `Engines.render` verifies (`packages/prompts/src/apps/cli/engines.apps.module.ts:304-320`); `renderValues`/`renderLoop` verify (`interactive.apps.module.ts:441-471`, `:655-659`); `conditionMatches`/`isVisibleAt` fail closed (`prompts.module.ts:378-408`); `engines.test.ts:357` is `it.effect` and passes. |
| F5 | Resolved | Fixture uses `worktree_name` (`fill-inputs.test.ts:88-108`), and `:245` (synchronous, so it executes) routes `encode` → `verifyPromptFile` → `{ valid: true }`; README:114 and skill SKILL.md:132 use flat names and verify clean when probed. The G001 planning record stays historical. |
| F6 | Resolved | `table` maps every variable and marks hidden rows (`packages/prompts/src/modules/prompt-execute/prompt-execute.module.ts:254-266`); `execute.test.ts:422` is synchronous and asserts `select when isolated=yes (hidden)`; the documented sample still compares byte-for-byte in `skill-docs.test.ts`. |
| F7 | **Open** | Reopened — carried in full below. The counter still includes already-answered visible variables, so a fully answered re-fill says `isolated (1 of 3)` and then asks nothing else; the first pass says `origin (2 of 3)` after already asking `isolated`. |
| F8 | Resolved | Skill lists all four kinds and the confirm contract (`packages/prompts/skills/montflow-create-prompts/SKILL.md:81-95`); installed copy byte-identical; `authoring-rules.test.ts:48` pins every kind token and the confirm sentence. |
| F9 | Resolved | `isVisibleAt` takes no `seen` (`prompts.module.ts:392-408`); the `controllerIndex >= index` guard makes every step strictly backwards and the comment states that invariant. |
| F10 | Resolved | Both module CONTEXT files list the condition surface, `resolveInputs`, the refusal messages, and the hidden-row marker (`prompts/CONTEXT.md:9-33`, `prompt-execute/CONTEXT.md:8-26`). |

### F7 — The question counter counts skipped hidden variables, so it promises questions that never come

- Severity: Minor
- Location: `packages/prompts/src/apps/interactive/interactive.apps.module.ts:551`
- Status: Resolved
- Attempts: 2
- First Seen: 013
- Problem: the denominator is `Prompts.visibleVariables(declared, collected)` computed **before** the current answer, so every already-answered visible variable is counted even though the loop will skip it. Probe against the real `fillInputs`:
  - first pass, yes path: `["isolated (1 of 1)", "origin (2 of 3)", "worktree_name (3 of 3)"]` — `isolated` was already answered, so "2 of 3" counts a question already asked;
  - re-fill from a fully answered yes path (the `renderLoop` "Render again" path): `["isolated (1 of 3)"]` and no further questions — the original symptom, "1 of 3" promising two questions that never come.
- Impact: the dialog still tells the user questions are coming that will never be asked, and overstates the position once a controller has been answered. The fix moved the miscount from hidden variables to answered ones instead of removing it.
- Suggestion: derive position and denominator from the questions this pass will actually ask — visible variables that are unanswered at ask time, plus a controller being deliberately re-asked — rather than from every visible variable; add a test for the fully answered re-fill.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed `packages/prompts/src/apps/interactive/interactive.apps.module.ts:545-553`: each title's position and denominator come from `Prompts.visibleVariables(declared, collected)` computed at ask time; `position` is that variable's index in the visible list plus one. The unused loop-level `index` counter is gone.
- Truthful labels now: yes path `isolated (1 of 1)`, then `origin (2 of 3)`, `worktree_name (3 of 3)`; no path only `isolated (1 of 1)`; confirm path `flag (1 of 1)`, then `child (2 of 2)`.
- Tests updated in `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts` (yes/no/re-fill/provided/confirm cases) to assert those counts.
- Verification: `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014 — reopened**

The new denominator still counts questions the fill will not ask, because it is computed from `visibleVariables(declared, collected)` **before** the current answer and includes every already-answered visible variable. Probe against the real `fillInputs`:

- first pass, yes path: `["isolated (1 of 1)", "origin (2 of 3)", "worktree_name (3 of 3)"]` — the denominator counts `isolated`, which was already answered, so "2 of 3" promises a question the user already answered.
- re-fill from a fully answered yes path (the `renderLoop` "Render again" path): `["isolated (1 of 3)"]` and no further questions — the original symptom, "1 of 3" promising two questions that never come.

Location: `packages/prompts/src/apps/interactive/interactive.apps.module.ts:551-553`. The tests the fixer cites for these counts are registered with plain `Vitest.it(... () => Effect.gen(...))`, which vitest never runs (round 014 F12), so they provide no evidence. Suggested fix: derive position/denominator from the questions this pass will actually ask — visible variables that are unanswered at the moment of asking (plus a controller being re-asked) — not from every visible variable. Keep Open.

**[Fixer] 2026-11-04 — attempt 2**

- Changed `packages/prompts/src/apps/interactive/interactive.apps.module.ts:539-586`: the counter is now derived from `pendingQuestions()` — visible, not caller-provided, not already asked in this pass, and still owing a question (`owesQuestion`, `:544-547`). Position is that set's rank plus the questions already asked in the current run; the denominator is that sum plus the remaining questions. An answer that changes the visible set starts a new run (`:562-573`, `:612-615`), so a controller's answer cannot inflate the branch it just revealed.
- Reviewer probes now: first pass yes path `["isolated (1 of 1)", "origin (1 of 2)", "worktree_name (2 of 2)"]`; fully answered yes re-fill `["isolated (1 of 1)"]` with no further questions.
- Tests: `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:295` pins the fully answered re-fill; counts updated at `:274`, `:321`, `:365`, `:409`; every body now `it.effect` (F12), so all execute.
- Verification: `bun run --cwd packages/prompts test` — 745 passed (54 files); `ts:check`, `lint:check`, `format:check` pass.

### F11 — `fillInputs` asks a controller that has a `default` on the first fill, contradicting its own default rule

- Severity: Minor
- Location: `packages/prompts/src/apps/interactive/interactive.apps.module.ts:545-546`
- Status: Resolved
- Attempts: 1
- First Seen: 014
- Problem: `answered` is `previous !== '' || variable.default !== ''`, but the skip is gated on `!controllers.has(variable.name)`, so any `select`/`confirm` that another variable conditions on is asked even on the first pass. Probe with `[isolated(select yes/no, default "no", required false), origin(when isolated=yes)]`: `fillInputs(ui, prompt, {})` asks `isolated (1 of 1)` and then `origin`. The doc comment immediately above (`:506-508`) states "a variable with a `default` is never asked for when the value is blank — the default is the answer".
- Impact: a defaulted controller can never take effect without an interactive answer, so a prompt that used to render on its defaults now stops for a question; the documented three-rule contract is false for exactly the variables that drive visibility.
- Suggestion: force the ask only when there is a prior answer to change (`previous !== ''`, i.e. a genuine re-fill, or an explicit re-fill flag), not whenever a `default` exists; add a first-pass test with a defaulted controller.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed `packages/prompts/src/apps/interactive/interactive.apps.module.ts:539-547`: `owesQuestion` now asks a variable with a prior answer (`previous !== ''`) only when it is a controller, and asks a blank variable only when it has no `default`. A defaulted controller is therefore skipped on the first fill (the default is the answer) and still re-asked when a genuine re-fill has an answer to change. The `answered && !controllers.has(name)` gate is gone.
- Test: `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:146` — `[isolated(select, default "no", required false), origin(when isolated=yes)]` asks nothing and collects `{}` on the first fill.
- Verification: `bun run --cwd packages/prompts test` — 745 passed; `ts:check`, `lint:check`, `format:check` pass.

### F12 — The interactive fill tests never execute: an Effect-returning body registered with plain `Vitest.it` is not awaited

- Severity: Minor
- Location: `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:108` (through `:380`), `apps/workspace/src/services/prompts/tests/prompt-editor.test.ts:115`
- Status: Resolved
- Attempts: 1
- First Seen: 014
- Problem: in `@effect/vitest`, `it` is vitest's plain `it`; only `it.effect` runs the returned `Effect`. `Vitest.it('…', () => Effect.gen(…))` returns an `Effect` object, which vitest treats as a non-thenable and ignores, so the body never executes. Probe: a plain `it` whose Effect body asserts `1 === 2` passes, while the same body under `it.effect` fails. Every `Effect`-based test in `fill-inputs.test.ts` uses plain `it` (18 of 19 registrations; only the synchronous `:245` executes), including all the yes/no/re-fill/provided/confirm cases the F7 fix cites. `prompt-editor.test.ts:115` is the only test of `applyConditionByName` — the function the `c` editor flow calls — and it never runs either.
- Impact: `bun run --cwd packages/prompts test` reports 737 passing while question order, the counter, stale-answer clearing, and the select/confirm dialogs have no executed coverage; the F7 counter defect shipped green, and `applyConditionByName`'s accept/refuse paths are unverified.
- Suggestion: change every effect-returning body to `Vitest.it.effect` in both files, and add a guard (lint rule or a test that greps for the pattern) so `it(…, () => Effect.*)` cannot land again.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed every Effect-returning body to `Vitest.it.effect`: `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts` now has 20 effect tests (the one synchronous verifier-fixture test at `:266` stays plain `it`), and `apps/workspace/src/services/prompts/tests/prompt-editor.test.ts:115` is `it.effect` (the synchronous `:159` stays plain).
- Guard: new `packages/prompts/src/apps/interactive/tests/effect-test-bodies.test.ts` scans `packages/prompts/src` and `apps/workspace/src/services/prompts` for a plain `it('…', () => Effect.…)` registration and fails with the offending file list. Probed against the old shape (rejects) and `it.effect` (accepts).
- Executed coverage now: `fill-inputs.test.ts` 21 of 21 tests run (was 1 of 19), `prompt-editor.test.ts` 8 of 8.
- Verification: `bun run --cwd packages/prompts test` — 745 passed; `bun run --cwd apps/workspace test` — 268 passed; both packages' `ts:check`, `lint:check`, `format:check` pass.

### F13 — The create-prompts skill's "seven rules it measures" list omits the condition and confirm diagnostics

- Severity: Nit
- Location: `packages/prompts/skills/montflow-create-prompts/SKILL.md:223`
- Status: Resolved
- Attempts: 1
- First Seen: 014
- Problem: the verification section enumerates "The seven rules it measures" and lists only the pre-condition checks. `verifyPrompt` now also rejects a malformed or inseparable `when`, an unknown/later/non-discrete controller, an unoffered `equals` value, a conditional the template never uses, a confirm carrying `options`/`default`/`required`, and a guard on a controller with no condition of its own. The skill has a Conditions section, but the verification contract is presented as exhaustive and is not.
- Impact: an agent that treats the list as the verifier contract cannot predict which condition errors block `mf-prompts verify`; `skill-docs.test.ts:224` pins the seven strings, so the list also cannot grow without editing the test.
- Suggestion: extend the enumeration with the condition and confirm rules and extend `skill-docs.test.ts:224` so the documented list and the verifier's issue families stay in step.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Skill: `packages/prompts/skills/montflow-create-prompts/SKILL.md:223` now lists ten rules. Added the `when` diagnostics (exactly one form; an earlier `select`/`confirm` controller of the matching kind; an offered `equals` value), the confirm field rules (`options`/`default`/`required`), and the guard-on-a-condition-less-controller rule. Version bumped to 3.3.1.
- Changelog: 3.3.1 entry added at `packages/prompts/skills/montflow-create-prompts/CHANGELOG.md:3`; the installed copy `.agents/skills/montflow-create-prompts/{SKILL.md,CHANGELOG.md}` is byte-identical (`diff -r` clean).
- Payload: `bun run --cwd packages/prompts generate:payload` regenerated `packages/prompts/src/apps/doctor/embedded-payload.generated.ts`.
- Test: `packages/prompts/src/apps/cli/tests/skill-docs.test.ts:224` pins the four new fragments, alongside the original seven.
- Verification: `bun run --cwd packages/prompts test` — 745 passed; `ts:check`, `lint:check`, `format:check` pass.

## Summary

- Critical: 0
- Major: 0
- Minor: 3
- Nit: 1
- Open: 0
- In Review: 0
- Resolved: 4
- Won't Fix: 0
- Escalated: 0
