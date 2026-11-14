# Review: montflow-spec-standard / 004

## Metadata

- Target: Phase D — D001 profile discovery, D002 CLI-first authoring verification, D003 lean execution contract
- Round: 004
- Phase: D
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Created: 2026-11-03

## Findings

### F1 — Worker and orchestrator both execute the task gate, so "once per task" is false

- Severity: Major
- Location: `packages/profiles/profiles/spec-worker/PROFILE.md:28`, `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:50`, `packages/specs/prompts/spec-execute.json:4`, `packages/specs/src/apps/cli/cli.gate.module.ts:555`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: Worker step 4 tells the worker to "run its command yourself **once**" and then says "The orchestrator runs the same official gate once at completion." Orchestrator step 4 runs `mf-specs gate run` at completion, and `gate run` executes every selected stage unconditionally (`for (const [index, stage] of selection.stages.entries())` → `executeGateCommand`, `cli.gate.module.ts:555-574`). `claim --close` requires a recorded passing result, so the orchestrator cannot skip its pass after the worker's run. Every GATES.md command therefore executes twice per task.
- Impact: The duplication Phase C paid for is still there: D003's own gate runs `mf-specs:check` and `mf:check` twice per task, and every future phase copies the pattern. The "one gate per task" claim is false as written, and the drift test passes it (see F5).
- Suggestion: Give the gate one owner. Remove command execution from the worker (worker keeps scoped checks, returns a receipt), or let the worker's run be the recorded result (`gate run` reuses a passing record instead of re-executing). Use the same wording in both profiles and the prompt.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Gave the gate one owner. The worker now runs scoped checks only and records them; `packages/profiles/profiles/spec-worker/PROFILE.md` step 4, Lean execution, and Hard limits state that the worker runs no official gate and no repo-wide gate, and that every `GATES.md` stage belongs to the orchestrator. The orchestrator profile and `spec-execute.json` (dispatch and collect) carry the same sentence: the orchestrator runs `mf-specs gate run` once per task at completion and the repo-wide gate once per phase boundary. No command now executes twice per task. Evidence: `packages/specs test` 1893 passed, including the 44 lean-contract tests; `mf-specs check --name montflow-spec-standard` reported 0 issues.

[Reviewer] Re-verified independently. `grep -rn "record the output verbatim\|run its command yourself"` over the worker profile, orchestrator profile, and `spec-execute.json` returns no matches. Worker step 4, Lean execution, and Hard limits all say scoped checks only and "Any stage in `GATES.md` is the orchestrator's to execute"; orchestrator step 4 and the prompt say the orchestrator runs `gate run` once per task. Residual: step 4 in the profile and the prompt still says "do not re-run a matrix the worker already proved" — vestigial now that the worker runs no official gate, but it orders no second execution. Verdict: Resolved.


### F2 — The worker is banned from commands its own GATES.md names, and the skill forbids that gate shape

- Severity: Major
- Location: `packages/profiles/profiles/spec-worker/PROFILE.md:71`, `.agents/@montflow/specs/montflow-spec-standard/D/D003-implement-lean-execution-contract/GATES.md:9`, `.agents/@montflow/specs/montflow-spec-standard/D/D003-implement-lean-execution-contract/GATES.md:19`, `.agents/@montflow/specs/montflow-spec-standard/D/D003-implement-lean-execution-contract/GATES.md:24`, `packages/specs/skills/montflow-create-specs/SKILL.md:225`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: The worker hard limit says "Never run a repo-wide gate (`mf:check`, `mf:gate`, `mf-specs check`)" (`PROFILE.md:71`), while worker step 4 says run every mechanical stage in GATES.md. The phase's own gate file names `bun run mf-specs:check` (stage 1), `bun run mf:check` (stage 3), and the repo-wide `ts:check && lint:check && fmt:check` (stage 4). The skill D003 ships says a gate is "this task's proof, never a copy of the repo-wide suite" (`SKILL.md:225`).
- Impact: A worker cannot comply with both the profile and the gate. It either skips stages (the task closes on incomplete proof) or violates a stated hard limit. The phase's exemplar teaches the exact gate shape the same phase's skill forbids, so the mistake propagates to later phases.
- Suggestion: Make D003's GATES.md task-scoped (the lean-contract test plus the package tests it touches) and leave `mf-specs:check` / `mf:check` / the repo-wide `ts:check` to the orchestrator at the phase boundary. State that rule in the worker profile as well.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Left D003's `GATES.md` and its `GATE-RESULTS.jsonl` untouched, because editing them would break the green stage-number record the verifier matches. Instead the worker hard limit now forbids any official gate and any repo-wide gate (`mf:check`, `mf:gate`, `mf-specs:check`, `ts`/`lint`/`fmt` at repo scope), names the orchestrator as the one runner of the task gate and the per-phase-boundary gate, and says any `GATES.md` stage is the orchestrator's to execute. `montflow-create-specs` now states that a task gate names the task's own commands, with the infrastructure-gate exception that still runs once at the orchestrator's task gate. Evidence: `packages/specs test` 1893 passed; the drift markers for the one-gate and one-repo-gate rules pass in all three agent sources.

[Reviewer] Verified. Worker Hard limits (`PROFILE.md:74-78`) bans any official and any repo-wide gate and hands every `GATES.md` stage to the orchestrator, which is the finding's stated alternative. D003's `GATES.md` still lists `mf-specs:check`/`mf:check`/`ts`+`lint`+`fmt`, but under that rule the worker is never asked to run them. Skill lines 229-242 make the task gate the task's own commands and keep the infrastructure exception "still runs once, at the orchestrator's task gate". Verdict: Resolved.


### F3 — The orchestrator is told to start the phase review with a command that does not exist

- Severity: Major
- Location: `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:67`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: Step 6 says "Start it with `mf-reviews start <name>` — or `/mf-reviews start <name>` in the OpenCode host". `mf-reviews --help` lists `doctor`, `list`, `show`, `verify`, `create`, `new`, `resume`, `version`; there is no `start`. Reproduced: `bun run --cwd packages/reviews cli start test-x --dir /tmp/brief-fixture` → `Unknown subcommand "start" for "mf-reviews"`. The package README (lines 66-82) says a review is started from inside the session with the `review_create` tool, and that the CLI's `create`/`new` only scaffold.
- Impact: An orchestrator following the profile cannot start the required phase review, so the phase cannot reach a closed round or lock. It must improvise or stall after all task work is done.
- Suggestion: Replace both forms with the real entry point: `review_create name=<series> [target=...] [spec=...] [round=...] [phase=...]` in the host, and `mf-reviews create <name>` only for scaffolding outside it. Update the installed copy and the reference.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Replaced the nonexistent `mf-reviews start` in step 6 and the Review Checklist with the real entry points: `review_create` in the host (`name=`, optional `target=`, `spec=`, `round=`, `phase=`), `mf-reviews create <name> [--round <NNN>]` to scaffold outside it, and `mf-reviews resume <name>` to continue. Confirmed against `bun run --cwd packages/reviews cli --help`, which lists `create`, `new`, and `resume` and no `start`. Installed copy synced by `mf-profiles doctor`; `packages/profiles test` 202 passed.

[Reviewer] `bun run --cwd packages/reviews cli --help` lists `doctor, list, show, verify, create, new, resume, version` — no `start`. Orchestrator step 6 and the Review Checklist use `review_create` (`name=`, `target=`, `spec=`, `round=`, `phase=`) plus `mf-reviews create`/`resume`. `grep -rn "mf-reviews start"` over `packages/profiles`, `packages/specs`, and `.agents/@montflow` hits only `packages/profiles/CHANGELOG.md:26`, which records the removal. Verdict: Resolved.


### F4 — The prompt still sends workers to BOARD.md/MAILBOX.md while the edited worker profile excludes them

- Severity: Major
- Location: `packages/specs/prompts/spec-execute.json:4`, `packages/profiles/profiles/spec-worker/PROFILE.md:23`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: The prompt's dispatch section says "Workers read the phase `BOARD.md` and their own `MAILBOX.md` at task start and again before their receipt" (template line 26; the JSON stores the whole template on line 4). The worker profile's step 2, rewritten by D003, reads only `TASK.md`, `GATES.md`, the phase `## Execution Brief`, and scoped source, and explicitly bans other tasks' records; it never names the board or mailbox. The lean read budget in the brief repeats the narrower list.
- Impact: A worker that follows the profile never sees mail or steering, so the orchestrator's `mail` protocol silently stops working. A worker that follows the prompt exceeds the read budget the contract claims to enforce.
- Suggestion: Pick one read set and use it in all three places. If channels are in, add `BOARD.md`/`MAILBOX.md` to the profile and the brief; if they are out, delete the prompt sentence and state that mail reaches a worker only through the orchestrator's receipt/dispatch.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Deleted the prompt sentence that sent workers to the phase `BOARD.md` and their own `MAILBOX.md`. The dispatch now says steering reaches a worker through the dispatch and its receipt and the orchestrator owns the channels; `mail` stays orchestrator-only. The worker profile step 2 carries the same statement, so the read set stays the brief plus `TASK.md`/`GATES.md` and the scoped source. Updated the `mail.test.ts` boundary assertion to check the new sentence and reject the old one. Evidence: `packages/specs test` 1893 passed; prompt bytes match the installed copy.

[Reviewer] A `bun -e` read of the `spec-execute.json` template reports `prompt tells worker to read board/mailbox: false` and `steering sentence: true`; the worker profile step 2 carries the same sentence (wrapped across lines). The only `BOARD.md`/`MAILBOX.md` mentions in the worker profile are the write ban (`PROFILE.md:60`), not a read set. Verdict: Resolved.


### F5 — The drift test asserts phrase presence, so a contradicted contract stays green

- Severity: Minor
- Location: `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:25`, `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:94`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: The markers are bare phrases (`/once per task/`, `/80 lines/`, `/lockfiles?/`, `/one fixer attempt/`) and `problemsIn` only asks whether each regex matches after whitespace flattening. It never checks the direction of the rule. In a temp copy I negated every marker phrase ("never once per task", "well over 80 lines", "broad-grep ... and read lockfiles freely", "one fixer attempt per finding", "no need for one re-review"), and all nine regexes still matched: `matched: execution-brief,broad-grep-ban,lockfile-ban,one-gate-per-task,one-repo-gate-per-phase,memory-80-lines,one-fixer-attempt,one-re-review,review-decide` / `missing: (none)`. The shipped F1 contradiction ("once per task" beside two executions) also passes the test as written.
- Impact: A future edit can invert the contract ("read lockfiles", "exceed 80 lines", "one fixer per finding") and the guard reports success. The task's claim that the contract "cannot silently disappear" is only true for literal deletion, not for corruption.
- Suggestion: Assert the rule sentences (e.g. `no broad grep over [^.]*lockfiles`, `at or under 80 lines`, `one fixer attempt .* one re-review`) or snapshot the exact bullet blocks and fail on any change. Add one mutation per marker, not only `once per task`.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Rewrote `packages/specs/src/modules/prompt/tests/lean-contract.test.ts`: every marker now asserts the rule's direction (`no broad[- ]grep`, `never ... lockfiles`, `worker runs no official gate ... orchestrator runs the task gate once per task`, `repo-wide gate once per phase boundary`, `at or under 80 lines`, `one fixer attempt`, `one re-review`, `review decide`, `## Execution Brief`, `command appears exactly once`). Every marker now has its own temp-copy inversion that must produce `missing lean-contract marker '<id>'`, and each source keeps its own installed-copy byte-equality test. Proved pass-to-fail live twice: inverting `at or under 80` to `well over 80` and `once per task` to `once per stage` in the worker profile each made the suite fail on `memory-80-lines` / `one-gate-per-task`, then the file was restored. The file runs 44 tests; full `packages/specs test` 1893 passed.

[Reviewer] `bun run --cwd packages/specs test -- src/modules/prompt/tests/lean-contract.test.ts` → `Tests 44 passed (44)`; the file holds 34 per-marker inversions (27 agent + 7 skill), one per marker. Independent live inversion: replaced `at or under 80` with `well over 80` in both the canonical and installed worker profile → `Tests 10 failed | 34 passed` with `missing lean-contract marker 'memory-80-lines'`; restored from a `/tmp` backup and confirmed `sha256 d980c09…` on both copies and 44/44 green again. Verdict: Resolved.


### F6 — The brief check is an empty-heading check, and completion and lock never consult it

- Severity: Minor
- Location: `packages/specs/src/modules/structure/structure.module.ts:677`, `packages/specs/src/modules/verify/verify.module.ts:169`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: The condition is only `!hasSection(memory, 'Execution Brief')`, and `hasSection` is `^## Execution Brief\s*$`; no content is required. Reproduced in a temp store: `init --tier micro`, `claim --start`, then appending just `## Execution Brief` makes `mf-specs check --name demo` print `1 spec · 0 failed · 0 issues`. A phase with no brief at all can still complete and lock: after closing the only task, `mf-specs lock --name demo --phase A` printed `locked A · demo`, and the complete-phase exemption removes the warning. Neither `claim --close` nor `lock` reads `EXECUTION_BRIEF_MISSING_CODE`.
- Impact: The only mechanical gate on the brief is satisfied by a bare heading, and a phase can ship with none at all. The phase's "enforced path" is advisory.
- Suggestion: Require the five brief bullets (or a non-empty body) in the check, and make `lock` / `claim --close` fail for an in-progress phase without a valid brief. Keep complete/frozen phases exempt.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Added `executionBriefStatus` in `structure.module.ts`: it extracts the `## Execution Brief` body and requires the five labelled bullets (Read, Write scope, Gate, Record, Review), so a heading alone, a stub, or a partial brief fires `phase.execution-brief-missing`. `lockPhase` now refuses a started v2 phase (in-progress, or pending with an in-progress task) with the same code and a fix line; complete/frozen and non-started phases stay exempt, and `waiver`/`new-task` pass `{ requireBrief: false }` so they never fail early. Tests: `verify-spec-tree.test.ts` covers heading-only/stub/partial/valid, and `state.test.ts` covers the lock refusal plus the restored valid brief. `packages/specs test` 1893 passed.

[Reviewer] Temp store under `/tmp`: `init --tier micro`, `claim --orchestrator`, `claim --task A001 --start`. (a) reducing the section to a bare `## Execution Brief` → `check` prints `! phase.execution-brief-missing × 1`. (b) deleting the heading → `lock --phase A` exits non-zero with `code phase.execution-brief-missing` and `fix Write the phase execution brief with the five labelled bullets (Read, Write scope, Gate, Record, Review)...`. `claim --close` still does not consult the brief, but the probe's required lock path holds. Verdict: Resolved.


### F7 — Scaffolded phase and task memories omit the brief and two of the fixed sections

- Severity: Minor
- Location: `packages/specs/src/modules/phase/phase.module.ts:243`, `packages/specs/src/modules/scaffold/scaffold.module.ts:184`
- Status: Resolved
- Attempts: 2
- First Seen: 004
- Problem: `renderPhaseMemory` writes Context, Progress, Open Questions, Handoff, Deviations only — no `## Execution Brief`. `renderMemory` writes the same set for tasks — no `Findings` and no `Gates`, although the skill and both profiles mandate "Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations". Reproduced with temp stores: `init --tier micro` and `init --tier standard` both produce no `Execution Brief` (grep finds none); the first `claim --start` flips the phase to in-progress and `check` prints `! phase.execution-brief-missing × 1`.
- Impact: A freshly scaffolded spec violates the contract it ships, and its first worker is told to read a brief that does not exist. Every author must hand-add the brief and the two missing sections.
- Suggestion: Generate a brief skeleton and the full fixed section set in `renderPhaseMemory`/`renderMemory` (update the fixture test to strip the generated brief when testing the warning), or accept a brief during `init`/`create`.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] `renderPhaseMemory` now emits a `## Execution Brief` skeleton with the five labelled bullets, and the scaffold `renderMemory` emits the full fixed set (Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations). `check-execution-brief.test.ts` asserts a fresh `init` tree is clean, strips the generated brief before asserting the warning on absent, heading-only, and stub shapes, and restores a valid brief; `scaffold.test.ts` asserts a fresh `create` tree carries the five bullets and the seven task sections and verifies clean. `packages/specs test` 1893 passed.

[Reviewer] Not fixed for `init`. Fresh `init --tier micro` in a `/tmp` store: `grep -n "^## " …/A/A001-implement/MEMORY.md` → `Context, Progress, Open Questions, Handoff, Deviations, Execution Brief` — `Findings` and `Gates` are absent, and `check` is still clean because `MEMORY_SECTIONS` (`packages/specs/src/modules/memory/memory.module.ts:4-10`) lists only the old five. Cause: `init.module.ts:800` writes task `MEMORY.md` with `renderPhaseMemory()`, not the fixed `renderMemory()`. `create` is correct (seven sections); its check carries the by-design `phase.review-task-missing` warning (`scaffold.test.ts:30-32`). `packages/specs test` 1893 passed because no test asserts the init task section set. Verdict: Open (Minor). Still fails: a freshly scaffolded `init` task memory omits `Findings` and `Gates`.

[Fixer] Moved the task-memory renderer into `packages/specs/src/modules/memory/memory.module.ts` as `renderTaskMemory`; `scaffold` and `init` now both import it, and `init.module.ts` writes task `MEMORY.md` with the seven-section template while `renderPhaseMemory` stays phase-only. `init.test.ts` asserts a fresh micro tree's task memory carries Context, Progress, Findings, Gates, Open Questions, Handoff, Deviations and no `## Execution Brief`, while the phase memory keeps the brief. Probe: `bun run --cwd packages/specs cli init --name f7probe --tier micro --dir /tmp/f7probe` exit 0; task memory headings are the seven sections (no brief), phase memory adds `Execution Brief`; `cli check --name f7probe` reported 0 issues, exit 0. `packages/specs test` 1895 passed; `ts:check`, `lint:check`, `format:check`, and `mf-specs:check` (0 issues, 13 warnings) clean.


### F8 — `mf-profiles verify` only warns on an uninstalled skill, but both skills say it validates every skill

- Severity: Minor
- Location: `.agents/skills/montflow-create-profiles/SKILL.md:72`, `.agents/skills/montflow-create-profiles/SKILL.md:85`, `.agents/skills/montflow-modify-profiles/SKILL.md:67`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: The skills say "Run the mechanical check first — it validates the file shape and every skill declared in `skills:`" and "It already covers ... every declared skill." Reproduced in a temp workspace with `skills: [definitely-not-a-skill]`: `mf-profiles verify bogus` prints `bogus: ✓ verified — 1 warning` plus `skills: Skill 'definitely-not-a-skill' is not installed`, and exits 0. `mf-prompts verify bad` behaves the same (`✓ 'bad' matches the standard format — 1 warning`, exit 0).
- Impact: A mandatory "verify" gate passes a profile or prompt whose declared skill does not exist. An author who runs it and reads the check mark stops before fixing the warning.
- Suggestion: Make an uninstalled skill an error (exit 1) for `mf-profiles verify` / `mf-prompts verify`, or change both skills to say the check *warns*, list the warning as a fix item, and add the warning to the gate.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Updated `.agents/skills/montflow-create-profiles` and `.agents/skills/montflow-modify-profiles` (and both CHANGELOGs) to say `mf-profiles verify` / `mf-prompts verify` warn (`1 warning`, exit 0) when a declared skill is not installed, that every warning is a fix item before the gate passes, and that a check mark alone does not validate a declared skill. No CLI behavior change. `packages/profiles test` 202 passed; `mf-profiles doctor --check` is clean.

[Reviewer] `grep` over `.agents/skills/montflow-create-profiles/SKILL.md:86-89` and `.agents/skills/montflow-modify-profiles/SKILL.md:80-83` shows both now say an uninstalled declared skill is a **warning** (`1 warning`, exit 0) and that "a check mark alone does not validate a declared skill". `grep "validates every\|already covers"` over both SKILL.md files returns no match. Verdict: Resolved.


### F9 — The brief/gate "name it once" rule is circular

- Severity: Minor
- Location: `packages/specs/skills/montflow-create-specs/SKILL.md:182`, `packages/specs/skills/montflow-create-specs/SKILL.md:233`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: The brief bullet says "**Gate**: the one official command that proves this phase ... Do not restate a command the task's `GATES.md` already names." The gate paragraph says "Never duplicate a command the phase `## Execution Brief` or another stage already names: name it once in the gate and point at that line." Each forbids naming a command the other names. If the brief names the command, GATES.md cannot carry it — but `gate run` only executes `command:` lines, so the brief's command is unrunnable. If GATES.md names it, the brief has no "one official command"; the shipped D brief does exactly that ("run each command in GATES.md once", `D/MEMORY.md:30`).
- Impact: Authors get contradictory instructions, and the brief is prose rather than a command the executor can run. The claimed single source of the gate command does not exist.
- Suggestion: Make GATES.md the sole owner of executable commands and have the brief point at the gate file (delete "the one official command"), or let the brief own one command and have stages reference it.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] `montflow-create-specs` now makes `GATES.md` the sole owner of executable commands: a command appears exactly once on the `command:` line of the gate that runs it, the brief's Gate bullet points at the task/phase `GATES.md`, and the brief never carries a runnable command. Deleted "the one official command that proves this phase" and the mutual "name it once" phrasing, and added the infrastructure-task exception. The phase D brief already points at `GATES.md`, so its record was left unchanged. The drift marker `command appears exactly once` passes; `packages/specs test` 1893 passed.

[Reviewer] `grep -n "one official command\|name it once\|Never duplicate a command"` over the canonical and installed `montflow-create-specs/SKILL.md` → none. Lines 182-186 now make `GATES.md` the sole owner; lines 229-242 add "A command appears exactly once, in a `command:` line ... the phase `## Execution Brief` never carries a runnable command and only points at the gate", with the infrastructure-task exception. Verdict: Resolved.


### F10 — D001's memory says Phase D has no review task, but D004 is required

- Severity: Nit
- Location: `.agents/@montflow/specs/montflow-spec-standard/D/D001-wire-profile-discovery/MEMORY.md:39`
- Status: Resolved
- Attempts: 1
- First Seen: 004
- Problem: D001's Open Questions says "Phase D has no review task by design: D001 is small and gated", while `D/PHASE.md:5` says `review: required` and `D004-review-phase` exists as an in-progress review task.
- Impact: A worker reading D001's memory can conclude no review is owed and skip D004; the record contradicts the phase record.
- Suggestion: Replace the paragraph with the actual state (D004 reviews the phase) or label it as a superseded authoring note.

#### Discussion

<!-- Append-only. [Reviewer] / [Fixer] / [Human] turns. -->

[Fixer] Replaced D001's Open Question with the actual state: Phase D is a required, reviewed phase and D004 reviews it and closes the round; the "no review task by design" note is marked superseded. No task status or gate record changed. `mf-specs check --name montflow-spec-standard`: 0 issues.

[Reviewer] `D001-wire-profile-discovery/MEMORY.md:39-41` now reads "Phase D is a required, reviewed phase: D004 (`D004-review-phase`) reviews the phase and closes its round. The earlier note that Phase D had no review task by design is superseded." No task status or gate record changed. Verdict: Resolved.


## Summary

- Critical: 0
- Major: 4
- Minor: 5
- Nit: 1
- Open: 0
- In Review: 0
- Resolved: 10
- Won't Fix: 0
- Escalated: 0
- Regression evidence: `packages/specs test` 1895 passed, `packages/profiles test` 202 passed, `mf-specs:check` clean for this spec, `mf-reviews verify montflow-spec-standard` 5 files verified, and the four payload `doctor --check` runs (skills, prompts, specs, profiles) are clean. `mf:gate` was not run by design.
