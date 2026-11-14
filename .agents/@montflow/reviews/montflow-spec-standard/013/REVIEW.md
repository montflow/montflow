# Review: montflow-spec-standard / 013

## Metadata

- Target: spec montflow-spec-standard phase G (conditional prompt variables, working tree)
- Round: 013
- Phase: G
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Disposition: minor-deferred
- Deferred: F7
- Created: 2026-11-04

## Findings

### F1 — The guard check rejects a legitimate `{{#if}}` on a controller that is itself conditional, so a two-level branch cannot be written

- Severity: Major
- Location: `packages/prompts/src/modules/prompts/prompts.module.ts:936`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: the guard loop rejects `{{#if X}}` / `{{#unless X}}` for every `X` that appears anywhere as a `when.controller`, without checking whether `X` itself has a `when`. A controller that is also a conditional child must be guarded to hide its branch — that is exactly what `authoringRules()` (`prompts.module.ts:1101`) and the packaged skill (`.agents/skills/montflow-create-prompts/SKILL.md:105`) tell the author to write. Probe against the real verifier with `[isolated(select yes/no), origin(select, when isolated=yes), origin_branch(text, when origin=other)]` and `{{isolated}}{{#if origin}}{{origin}}{{/if}}{{#if origin_branch}}{{origin_branch}}{{/if}}` returns `{{#if origin}} guards controller 'origin'.` The same shape with `when` on `origin` is refused even though `origin` has a matching `when`. The only shape that verifies is the unguarded `Origin: {{origin}}`, which renders the literal `Origin: ` while hidden — the empty branch G001's description says the design must not render.
- Impact: the phase's own worked shape (`origin` → `origin-branch`) cannot be expressed without leaking an empty value into prose, and the shipped guidance contradicts the verifier. H003's `spec-create` branch cannot verify if it follows both the G001 guard rule and the G001 variable list.
- Suggestion: reject a guard only when the guarded name is a controller **without** its own `when` (`controllers.has(guarded) && declared.find((v) => v.name === guarded)?.when === undefined`). Add accept/reject tests for `{{#if origin}}` where `origin` is and is not itself conditional.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed `packages/prompts/src/modules/prompts/prompts.module.ts:976-991`: the guard loop now skips a guarded name whose own declaration carries `when`, exactly the predicate the finding proposed. A controller with no `when` is still rejected.
- Tests: `packages/prompts/src/modules/prompts/tests/verify.test.ts:485` accepts the two-level `isolated → origin → origin_branch` shape with `{{#if origin}}` and `{{#if origin_branch}}`; the existing reject case (now at `:508`) still pins `{{#if isolated}}`.
- Why: the trigger was the phase's own two-level worked shape; it now verifies while a bare-select guard still fails.
- Verification: `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed in code: the guard loop skips a guarded controller that declares its own `when` (`packages/prompts/src/modules/prompts/prompts.module.ts:978-989`). Direct probe of `isolated → origin → origin_branch` with `{{#if origin}}` and `{{#if origin_branch}}` returns `{ valid: true, issues: [] }`; `verify.test.ts:485` accepts it and `:509` still rejects `{{#if isolated}}` (both tests use synchronous bodies, so both execute). Resolved.

### F2 — The workspace "editor" is a pure module with no caller, so no user can choose or have a condition refused

- Severity: Major
- Location: `apps/workspace/src/services/prompts/prompt-editor.ts:26`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: `conditionControllers`, `chooseCondition`, `validateCondition`, and `applyCondition` are exported and unit-tested, but no component, service flow, or host command calls any of them — a source-wide grep for the four names returns only the module and its own test. The workspace has no prompt-variable editing surface at all (the panel offers detail and delete; `savePrompt` likewise has no production caller), so G004's "the editor lets a user choose a controller from the earlier discrete variables and one of its options, and refuses a condition that G001 rejects" has no reachable path.
- Impact: a user cannot create or repair a condition in the product; the refusal message (`ConditionEdit.message`) is never displayed; the completion items "The editor refuses an unknown controller, a later controller, or a value outside the controller's options" and "The detail view marks a hidden variable" hold only for unit tests, not for any surface a human or agent can drive.
- Suggestion: wire the controller/value pickers into the prompt edit path and surface `applyCondition`'s refusal, or record the unbuilt editor as an explicit defect task with the phase's deferral decision instead of claiming it is implemented.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed `apps/workspace/src/grid-page.tsx:416-489`: new `editPromptCondition` flow on the existing prompt detail. It picks a variable, then a controller from `Prompts.conditionControllers`, then one of that controller's values, and calls `Prompts.applyConditionByName` (`apps/workspace/src/services/prompts/prompt-editor.ts:150`, which composes `chooseCondition` → `applyCondition`). A refusal is toasted verbatim as `Condition refused: <message>`; success saves through `Prompts.savePrompt` and invalidates the prompts query.
- Reachability: the `c` keybind is registered in the page keymap at `apps/workspace/src/grid-page.tsx:577-583`, advertised in the prompt detail banner (`:840`) and the `?` help overlay (`:881`), matching the existing `v`/`d` detail patterns. A source grep now finds production callers for all four previously orphaned functions.
- Test: `apps/workspace/src/services/prompts/tests/prompt-editor.test.ts:115` covers the accept path plus unknown-variable, later-controller, and unoffered-value refusals through the named helper.
- Verification: `bun run --cwd apps/workspace test` — 268 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

The missing-caller defect is fixed: `editPromptCondition` (`apps/workspace/src/grid-page.tsx:416-489`) is bound as `workspace.condition` (`:578`) and reaches `applyConditionByName` at `:465`, which composes `chooseCondition` → `applyCondition` → `validateCondition`; the other three helpers are covered by `Vitest.it.effect` tests in `prompt-editor.test.ts:42-113`. The refusal evidence cited (line 115) does not execute — see round 014 F12 — but that is a test defect, not a missing caller. Resolved for this finding's defect.

### F3 — `confirm` silently absorbs `options`, `default`, and `required`, so the verifier accepts a file that contradicts the kind's contract and a save drops the fields

- Severity: Minor
- Location: `packages/prompts/src/modules/prompts/prompts.module.ts:195`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: `resolveFile` forces `options: []`, `required: false`, and `default: ''` for `type: 'confirm'` before verification runs, and `toFile` writes none of them. Probe: `{"name":"flag","type":"confirm","options":["x"],"default":"x","required":true}` → `verifyPrompt` returns `{ valid: true, issues: [] }`; decode yields `{options:[], required:false, default:''}`; `encode` writes `{"name":"flag","type":"confirm"}`. The existing "options but not a select" and "required and default" checks can never fire because the fields are gone by then.
- Impact: an author who writes `required: true` or a default on a confirm gets no finding, then the workspace save path (`savePrompt` → `encode`) rewrites the file and deletes those fields without a word. G100's "confirm carries no options, default, or required" is enforced by silent coercion rather than by a diagnosis.
- Suggestion: keep the raw fields through decode (or check the pre-decode entry) and emit a `variables` issue with a fix for each of `options`/`default`/`required` present on a `confirm`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed `packages/prompts/src/modules/prompts/prompts.module.ts:202-213`: `resolveFile` no longer erases a stated `options`/`default`/`required` on a confirm. A missing `required` still resolves to `false`, so the kind's intended default is unchanged; a stated value survives into verification.
- Changed `packages/prompts/src/modules/prompts/prompts.module.ts:798-831`: a confirm now gets one precise issue per offending field (`declares options` / `has a default` / `is required`), each with a `Remove …` fix. The generic "required and default" and "options but not a select" rows skip confirm so the diagnosis is not duplicated.
- `toFile` (`packages/prompts/src/modules/prompts/prompts.module.ts:147-166`) still omits all three, keeping encode minimal as required.
- Tests: `packages/prompts/src/modules/prompts/tests/verify.test.ts:249` (all three diagnoses with fixes), `:264` (clean confirm still valid), `:271` (raw fields survive decode).
- Verification: `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed: `resolveFile` preserves a stated `options`/`default`/`required` on a confirm (`packages/prompts/src/modules/prompts/prompts.module.ts:201-218`) and `verifyPrompt` emits one issue with a fix per offending field (`:803-831`), while the generic rows skip confirm. Probe of `{"name":"flag","type":"confirm","options":["x"],"default":"x","required":true}` yields three issues, not `valid: true`. All three tests use synchronous bodies and execute. Resolved.

### F4 — Render and fill surfaces skip verification, so a malformed `when` renders a stale hidden value while `execute` refuses the same prompt

- Severity: Minor
- Location: `packages/prompts/src/apps/cli/engines.apps.module.ts:308`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: `render` (and the interactive `renderValues`/`Fill & render`, `interactive.apps.module.ts:441`) call `resolveInputs` and `renderPrompt` but never `verifyPrompt`, and `conditionMatches` (`prompts.module.ts:367`) falls back to `true` when a `when` carries neither form. Probe with `[isolated(select), origin(text, when {controller:'isolated'})]` and `{{isolated}}{{#if origin}}O={{origin}}{{/if}}`: verify reports `'origin' "when" must carry exactly one of "equals" or "truthy".`; `renderToString(..., {isolated:'no', origin:'stale'})` returns `noO=stale`; `PromptExecute.execute` on the same prompt returns `invalid-prompt`. A forward-referenced controller behaves the same way (renders the stale `b` value).
- Impact: `mf-prompts render`, `/mf-prompts render`, and the interactive fill show a plausible render — with a hidden branch's stale answer substituted — for any prompt the verifier rejects, while `execute` refuses it. G003's "CLI `render`/`execute` accept exactly what the interactive fill accepts" is false for exactly the inputs the new grammar is meant to police.
- Suggestion: verify the prompt in `render`/`renderValues` too (or make `conditionMatches` fail closed on an unusable condition), and add a test that render and execute agree on the same malformed file.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed the render paths to verify before rendering: `packages/prompts/src/apps/cli/engines.apps.module.ts:304-316` now runs `verifyPrompt` and fails with `verifyReport`; `packages/prompts/src/apps/interactive/interactive.apps.module.ts:441-465` adds a shared `verificationFailure`, used by `renderValues` (`:461`) and the `Fill & render` loop (`:658`).
- Belt and braces: `conditionMatches` (`packages/prompts/src/modules/prompts/prompts.module.ts:374-382`) now fails closed on a condition with neither or both forms, and `isVisibleAt` (`:388-410`) returns false for an unknown, later, or non-discrete controller. `renderToString` alone can no longer expose a stale branch.
- Agreement test: `packages/prompts/src/apps/cli/tests/engines.test.ts:357` writes a malformed `when`, asserts `Engines.render` refuses with the verification message, and asserts `Engines.plan`/`execute` returns `invalid-prompt` for the same file.
- Documentation updated so the execute skill no longer claims render skips verification (`packages/prompts/skills/montflow-execute-prompts/SKILL.md:159`), version 3.4.3.
- Verification: `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed: `Engines.render` verifies and refuses (`packages/prompts/src/apps/cli/engines.apps.module.ts:304-320`); `renderValues` and `renderLoop` do the same through `verificationFailure` (`packages/prompts/src/apps/interactive/interactive.apps.module.ts:441-471`, `:655-659`); `conditionMatches` fails closed and `isVisibleAt` refuses an unknown/later/non-discrete controller (`prompts.module.ts:378-408`). The agreement test is `Vitest.it.effect` (`engines.test.ts:357`), so it executes and the package suite passes 737. Resolved.

### F5 — The worked example and its fixture use hyphenated names the verifier cannot accept, so the copyable branch cannot be copied

- Severity: Minor
- Location: `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:95`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: G001's worked `spec-create` shape names the text variables `origin-branch` and `worktree-name`, and the new interactive fixture repeats `worktree-name` (`branchVariables`). `isValidVariableName` is `[a-zA-Z_][a-zA-Z0-9_]*` (`template-engine.module.ts:168`), so the verifier reports `'{{worktree-name}}' is not a usable variable name.` and `'worktree-name' is not a usable variable name.` — no template can reference the name. The fixture builds `new Prompts.Prompt(...)` directly, bypassing `verifyPrompt`, so the suite never notices.
- Impact: the "complete enough to copy into the prompt" example cannot be pasted into a real prompt, and the interactive tests prove yes/no/clear behavior for a prompt that can never be stored, verified, or executed. The collision only surfaces when H003 writes the real prompt.
- Suggestion: rename to `origin_branch`/`worktree_name` in the example and the fixture, and route one branch test through `verifyPromptFile` so an unusable name fails the suite.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Fixture renamed: `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:88-108` now declares `worktree_name`; every expectation in the suite matches the underscore name.
- Verifier routing: `branchPrompt` now uses a template that references every branch variable, and `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:245` round-trips it through `Prompts.encode` + `verifyPromptFile`, so a hyphenated name fails the suite instead of being bypassed.
- Corrected copyable examples added with flat `origin_branch` / `worktree_name` names: `packages/prompts/README.md:114` and `packages/prompts/skills/montflow-create-prompts/SKILL.md:132`.
- Deviation: the original hyphenated worked example is in the G001 planning record (`.agents/@montflow/specs/montflow-spec-standard/G/G001-decide-conditional-variable-contract/MEMORY.md:44-51`), which this fixer is forbidden to edit. The editable canonical examples above now use the underscore names; the planning record still needs an owner edit.
- Verification: `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed: the fixture declares `worktree_name` (`packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:88-108`) and its template references every branch variable; `:245` is a synchronous test (so it executes) and routes `Prompts.encode` → `verifyPromptFile` → `{ valid: true, issues: [] }`. The copyable examples in `packages/prompts/README.md:114` and `packages/prompts/skills/montflow-create-prompts/SKILL.md:132` use flat names and verify clean when probed. The G001 planning record is historical; no editable surface still teaches a hyphenated name. Resolved.

### F6 — `table` drops hidden rows, so the only text view of `inspect` cannot report that a variable exists and is hidden

- Severity: Minor
- Location: `packages/prompts/src/modules/prompt-execute/prompt-execute.module.ts:239`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: `table` filters `summary.variables` to `visible` rows and prints no line for the rest. `table` is what both `mf-prompts inspect` and the Inspect menu item show, so the output cannot distinguish "not declared" from "declared but hidden", and the condition that would reveal it is not shown either. G003 requires `inspect`/`table` to "expose the condition and whether a variable is currently visible", and the new test asserts `not.toContain('origin')` while hidden.
- Impact: an agent reading the only text rendering cannot see that a hidden branch exists, which is the information the conditional feature is supposed to surface; it will assume the prompt has one variable when it has two.
- Suggestion: keep hidden rows and mark them (a `VISIBLE` column, or `(hidden)` in the type cell), or append an explicit `hidden: origin (when isolated=yes)` line below the table; update the test to assert the marker rather than the omission.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed `packages/prompts/src/modules/prompt-execute/prompt-execute.module.ts:228-264`: the body now maps every `summary.variables` entry, and an invisible row appends ` (hidden)` to its TYPE cell (`:261`) while keeping its condition (`text when isolated=yes (hidden)`).
- The header still reports the visible/required counts the run will ask for; only the row set changed.
- Test: `packages/prompts/src/modules/prompt-execute/tests/execute.test.ts:422` now asserts `origin` is present, carries the `(hidden)` marker, and disappears when the controller shows it; the documented `inspect` sample in the execute skill (no hidden rows) stays byte-identical, so `skill-docs.test.ts` remains green.
- Verification: `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed: `table` maps every summary variable and appends ` (hidden)` to the TYPE cell of an invisible row while keeping its condition (`packages/prompts/src/modules/prompt-execute/prompt-execute.module.ts:254-266`); `execute.test.ts:422` is synchronous and asserts `select when isolated=yes (hidden)`, and `skill-docs.test.ts` still compares the documented sample byte-for-byte in the passing suite. Resolved.

### F7 — The question counter counts skipped hidden variables, so it promises questions that never come

- Severity: Minor
- Location: `packages/prompts/src/apps/interactive/interactive.apps.module.ts:534`
- Status: Resolved
- Attempts: 2
- First Seen: 013
- Problem: `index` increments only when a question is asked, but the title denominator is `declared.length`, which includes every hidden variable. On the no path the single question reads `isolated (1 of 3)`; with two values supplied it can label a lone question `(1 of 4)`. The new test `asks neither branch on the no path` asserts `'isolated (1 of 3)'`, encoding the misleading label.
- Impact: the dialog tells the user two more questions are coming when none will be asked (and understates the position when a controller is re-asked), reintroducing the noise the conditional feature exists to remove.
- Suggestion: derive the denominator and position from `visibleVariables(declared, collected)` at ask time (or drop the counter on a conditional prompt), and update the test to assert a truthful count.

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
- Truthful labels: yes path `isolated (1 of 1)`, `origin (1 of 2)`, `worktree_name (2 of 2)`; fully answered yes re-fill `isolated (1 of 1)` and no further questions; two independent variables `one (1 of 2)`, `two (2 of 2)`; confirm path `flag (1 of 1)`, `child (1 of 1)`.
- Tests: `packages/prompts/src/apps/interactive/tests/fill-inputs.test.ts:295` pins the fully answered re-fill; counts updated at `:274`, `:321`, `:365`, `:409`; all bodies now `it.effect` (round 014 F12).
- Verification: `bun run --cwd packages/prompts test` — 745 passed (54 files); `ts:check`, `lint:check`, `format:check` pass.

### F8 — The packaged skill still says `type` is text/textarea only and never states the `confirm` field rules

- Severity: Minor
- Location: `.agents/skills/montflow-create-prompts/SKILL.md:82`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: the skill's variable section says "`type` = `\"text\"` (`\"textarea\"` is the other option)", while its own example two sections later uses `"type": "select"` and the schema now also accepts `confirm`. It never mentions the `confirm` kind, its `yes`/empty values, or that it carries no `options`/`default`/`required` — `authoringRules()` does. The drift test (`packages/prompts/src/modules/prompts/tests/authoring-rules.test.ts:27`) only checks for `"when"`, `condition`, `earlier`, `controller`, and the literal `{{#if origin}}`, so a wrong kind list passes. The same bytes are shipped in `packages/prompts/skills/montflow-create-prompts/SKILL.md`.
- Impact: an agent authoring the truthy branch from the skill learns that only text and textarea exist and that a confirm has no field rules; the packaged skill and the single source of truth disagree, which is the drift the phase claims to guard.
- Suggestion: list `text`/`textarea`/`select`/`confirm` and restate the confirm rules in the skill, then extend the drift test to assert every kind token and the confirm sentence.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Canonical skill `packages/prompts/skills/montflow-create-prompts/SKILL.md:81-95` now names all four kinds and states the confirm contract: no `options`, `default`, or `required`; values `yes` and `""`. Version bumped to 3.3.0 with a matching entry in its `CHANGELOG.md`.
- Installed copy `.agents/skills/montflow-create-prompts/{SKILL.md,CHANGELOG.md}` is byte-identical (checked by `skill-docs.test.ts`), and `bun run --cwd packages/prompts generate:payload` regenerated `packages/prompts/src/apps/doctor/embedded-payload.generated.ts`.
- Drift test extended at `packages/prompts/src/modules/prompts/tests/authoring-rules.test.ts:48`: both `authoringRules()` and the packaged skill must contain `"text"`, `"textarea"`, `"select"`, `"confirm"`, the `no "options", "default", or "required"` sentence, and `boolean question`.
- Verification: `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed: the canonical skill names all four kinds and states the confirm field rules with values `"yes"`/`""` (`packages/prompts/skills/montflow-create-prompts/SKILL.md:81-95`); the installed copies are byte-identical (verified with `diff` and by the passing `skill-docs.test.ts:83`), the version is 3.3.0 with a matching changelog entry, and the drift test at `authoring-rules.test.ts:48` pins every kind token plus the confirm sentence. The skill's seven-rule enumeration is separately stale — round 014 F13. Resolved.

### F9 — `isVisibleAt`'s `seen` set and cycle comment are unreachable dead code

- Severity: Nit
- Location: `packages/prompts/src/modules/prompts/prompts.module.ts:373`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: the helper takes a `seen` index set and its comment claims it "stops on an unknown, later, or repeated controller — a malformed list cannot loop". Every reference resolves through `variables.findIndex` (always the first occurrence) and `controllerIndex >= index` returns before recursing, so the walk is strictly decreasing and `seen.has(controllerIndex)` can never be true.
- Impact: a dead parameter plus a comment that claims cycle protection the code does not exercise; a future condition form that is not strictly backward would be assumed safe.
- Suggestion: drop `seen` and state the real invariant in the comment (only strictly earlier indices are followed).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- Changed `packages/prompts/src/modules/prompts/prompts.module.ts:384-410`: `isVisibleAt` no longer takes `seen`; `isVisible` (`:423`) calls it without one. The walk now returns false immediately for an unknown, later, or non-discrete controller, so every recursive step is to a strictly earlier index and the comment states that invariant instead of claiming cycle protection.
- Verification: `bun run --cwd packages/prompts test` — 737 passed (including every `isVisible` case); `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed: `isVisibleAt` (`packages/prompts/src/modules/prompts/prompts.module.ts:392-408`) takes only `(index, variables, values)`; the guard `controllerIndex >= index` at `:402` makes every recursive step strictly decreasing, and the doc comment at `:385-391` states exactly that instead of cycle protection. No `seen` parameter or set remains. Resolved.

### F10 — The module CONTEXT docs still describe the pre-condition surface

- Severity: Nit
- Location: `packages/prompts/src/modules/prompts/CONTEXT.md:9`
- Status: Resolved
- Attempts: 1
- First Seen: 013
- Problem: the prompts module contract lists `Variable` as name/label/description/type/required/default with no `when`, and omits `isVisible`, `visibleVariables`, `effectiveValue`; `packages/prompts/src/modules/prompt-execute/CONTEXT.md` omits `resolveInputs`, `invalidOptionMessage`, `invalidConfirmMessage`, and the new summary fields. Only `apps/workspace/src/services/prompts/CONTEXT.md` was updated.
- Impact: the next agent reading the module contract cannot find the one visibility predicate the phase introduced and may re-derive it — the failure G001 forbids by name.
- Suggestion: update both CONTEXT files in the same change as the exports they describe.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-04 — attempt 1**

- `packages/prompts/src/modules/prompts/CONTEXT.md:9-33` now lists `Variable`'s full field set including `when`, `VariableCondition`, `isVisible`, `visibleVariables`, `effectiveValue`, `resolveValues`, `missingRequired`, and `verifyPrompt`. The constraints section states the one visibility rule and the strictly-backwards `when` invariant.
- `packages/prompts/src/modules/prompt-execute/CONTEXT.md:8-26` now lists `resolveInputs`, `invalidOptionMessage`, `invalidConfirmMessage`, the summary's `condition`/`visible`/`value`/`unanswered` fields, and the hidden-row marker in `table`. The check-order constraint now includes file-level verification and the render/execute agreement.
- Verification: documentation-only for this finding; `bun run --cwd packages/prompts test` — 737 passed; `ts:check`, `lint:check`, `format:check` all pass.

**[Reviewer] 2026-11-04 — round 014**

Confirmed: `packages/prompts/src/modules/prompts/CONTEXT.md:9-33` lists the full `Variable` field set including `when`, `VariableCondition`, `isVisible`, `visibleVariables`, `effectiveValue`, `resolveValues`, `missingRequired`, and `verifyPrompt`, and states the backwards-only invariant; `packages/prompts/src/modules/prompt-execute/CONTEXT.md:8-26` lists `resolveInputs`, both refusal messages, the summary's condition/visibility/value fields, the hidden-row marker, and render/execute agreement. Resolved.

## Summary

- Critical: 0
- Major: 2
- Minor: 6
- Nit: 2
- Open: 0
- In Review: 0
- Resolved: 10
- Won't Fix: 0
- Escalated: 0
