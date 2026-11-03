# Review: montflow-spec-standard / 007

## Metadata
- Target: Phase E — E001 parallel execution contract, E002 verification scheduler, E003 parallel authoring guidance
- Round: 007
- Phase: E
- Type: re-review
- Isolation: isolated
- Max Attempts: 3
- Status: open
- Created: 2026-11-03

## Findings

### F4 — `writeRunState` swallows every write error, so the single-flight claim can silently not exist

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:306-329`, `packages/specs/src/modules/scheduler/scheduler.module.ts:628-640`, `packages/specs/src/modules/scheduler/scheduler.module.ts:692-711`
- Status: Resolved
- Attempts: 2
- First Seen: 005
- Problem: `writeRunState` wraps every step in `Effect.orElseSucceed` and its caller yields it as `void`, so a failed `makeDirectory`, temp write, rename, and fallback write all succeed from the scheduler's point of view. `step()` then returns `{ kind: 'run' }` and executes. If the claim write fails (unwritable/read-only `.agents/@montflow/.runtime`, ENOSPC, a directory in place of the run file), no `running` state exists: another requester sees no state, so it also claims and runs the same key. The lane/in-flight counters cannot see the invisible run either. A failed terminal write has the same shape: waiters never get `resultIndex`, the heartbeat has already stopped, the lease expires, and the key is reclaimed and re-run even though the command completed (and may have appended a record).
- Impact: the one guarantee this phase exists to provide — one run per key, bounded heavy lane — disappears silently under an I/O failure, with no diagnostic.
- Suggestion: make `writeRunState` fallible and have `step()` fail with `gate.write-failed`/`gate.scheduler-lock` when the claim write does not land. For `finish`, surface a failed terminal write instead of swallowing it, and keep the outcome record/state consistent so a waiter cannot hang.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Claim and terminal writes are fallible. `packages/specs/src/modules/scheduler/scheduler.module.ts:326-368` adds `SchedulerWriteError` and `writeRunStateChecked` (best-effort `writeRunState` remains for advisory waiter/heartbeat updates); the claim at `:719-731` and the terminal write at `:790-813` use it, and `finish` propagates the failure. `packages/specs/src/apps/cli/cli.gate.run.module.ts:877-897` maps it to `gate.write-failed`, so an unwritable runtime tree fails the request before executing. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (new case `a failed claim write fails the request instead of running unclaimed`).
- [Reviewer] The claim half is fixed: `writeRunStateChecked` is used at `scheduler.module.ts:719-734`, `SchedulerWriteError` maps to `gate.write-failed`, and `a failed claim write fails the request instead of running unclaimed` passes. The terminal half still fails on its second clause. `finish` appends the record first (`scheduler.module.ts:789`) and only then takes the lock and writes the terminal state (`:793-815`), so a failed terminal write leaves a keyed record in `GATE-RESULTS.jsonl`, leaves the state `running` until its lease expires, and still never gives waiters a `resultIndex`. Worse, the CLI then reports `gate.write-failed … no result was recorded` (`cli.gate.run.module.ts:886-891`), which is false — the record is already on disk and the next `check` will read it. Trigger: make the runs directory unwritable between the claim and `finish`; the command ran and recorded, the scheduler claims nothing was recorded, and the key is reclaimed and re-run after the lease.
- [Fixer] The terminal state now lands before the record. `packages/specs/src/modules/scheduler/scheduler.module.ts:771-843` writes the terminal state under the run lock first (`:823`), fails with `SchedulerWriteError` when it cannot land (`:814-822`), then appends the record (`:830`), then sets `resultIndex` best-effort (`:831-839`). A failed terminal write therefore leaves no record, so `gate.write-failed … no result was recorded` is true; a failed append leaves the key terminal and a waiter consumes the attempt's exit fields instead of hanging (`consume` at `:846-876`, waiter guard at `:940-948`). Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (2 files, 32 tests passed, including `lands the terminal state before the record so a failed append leaves no record` and `a waiter consumes a terminal state whose record append failed`), `bun run --cwd packages/specs ts:check`.
- [Reviewer] Confirmed. `writeRunStateChecked` is the only writer for the claim (`scheduler.module.ts:719-734`) and the terminal state (`:810-829`); `writeRunState` remains best-effort for waiter registration and heartbeats (`:678-680`, `:991-1002`). `finish` writes the terminal state before `persist` (`:823`), fails with `SchedulerWriteError` when the state read or write cannot land (`:814-822`), appends the record (`:830`), and only then updates `resultIndex` best-effort (`:831-839`). A failed append leaves the key terminal and `consume` reads the attempt's `exit`/`durationMs` (`:846-877`), so `a failed claim write…`, `lands the terminal state before the record…`, and `a waiter consumes a terminal state whose record append failed` all pass and the CLI's "no result was recorded" is now true. The reordering introduced a distinct race in the post-append pointer write; filed as F16.

### F11 — The generators default every execution task to `write-scope: .`, so two independent execution tasks collide and `check` fails

- Severity: Major
- Location: `packages/specs/src/modules/init/init.module.ts:52-53`, `packages/specs/src/modules/init/init.module.ts:181`, `packages/specs/src/modules/scaffold/scaffold.module.ts:56-57`, `packages/specs/src/modules/scaffold/scaffold.module.ts:164`, `packages/specs/src/modules/structure/structure.parallel.module.ts:122-150`
- Status: Resolved
- Attempts: 1
- First Seen: 006
- Problem: `defaultWriteScope`/`defaultScaffoldWriteScope` return `.` for `execution`/`defect`/`interruptor`, and `.` normalizes to `repo` (`scheduler/scope.module.ts:44-52`). Two unfinished execution tasks in one phase therefore declare the same `repo` scope and `verifyPhaseParallelism` reports `phase.write-scope-overlap` as an **error** unless one depends on the other. Reproduced: `mf-specs init --name demo --tier standard --task A:first:execution --task A:second:execution --review A:required` then `check --dir` → `1 failed`, `phase.write-scope-overlap`, `Tasks 'A002' and 'A001' both write 'repo'`; the same with `mf-specs create --tasks "first:execution,second:execution"`. The generator's clean-tree test (`init.test.ts:77-86`) stays green only because every default tier plan puts a single execution task in a phase.
- Impact: the normal parallel phase — the exact shape C1 asks authors to write — is red the moment it is scaffolded, before the author changes anything. The author must hand-edit every task's scope, which is the field the generator claims to generate, and `mf-specs create`/`init` no longer honour "renders … trees that verify clean immediately".
- Suggestion: do not invent `repo` as a default. Leave `write-scope:` empty (or `none`) and let `task.write-scope-missing` warn, or refuse a plan where a second execution task omits `scope=`. Add a two-execution-task tree to the "verifies clean immediately" test so the default is measured.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] Found while verifying F5 end to end. The rule that catches it is implemented correctly; the default the generators write into every task is what makes the scaffold fail its own verifier.
- [Fixer] Chose the empty-field option over refusing a second execution task: the generator cannot know a task's paths, and a refusal would turn a common parallel plan into a CLI error. `packages/specs/src/modules/init/init.module.ts:51-58` and `packages/specs/src/modules/scaffold/scaffold.module.ts:55-62` return `''` for `execution`/`defect`/`interruptor` (still `none` for review/exploratory/planning), and the TASK renderers emit a bare `write-scope:` (`init.module.ts:693`, `scaffold.module.ts:167-171`, `cli.newtask.module.ts:80-91`). No `repo` default is invented; a two-execution phase now warns `task.write-scope-missing` instead of failing `phase.write-scope-overlap`. The "verifies clean immediately" test asserts no errors for the default tiers and adds a two-execution case (`packages/specs/src/modules/init/tests/init.test.ts:77-103`), with a scaffold twin at `packages/specs/src/modules/scaffold/tests/scaffold.test.ts:35-49`. End to end, `mf-specs init --task A:first:execution --task A:second:execution --review A:required` then `check` reports `0 failed` with two `task.write-scope-missing` warnings. Verified: `bun run --cwd packages/specs test -- src/modules/init src/modules/scaffold src/apps/cli/tests/create.test.ts src/apps/cli/tests/newtask.test.ts`, `bun run --cwd packages/specs lint:check`, `bun run --cwd packages/specs format:check`.
- [Reviewer] Confirmed. `defaultWriteScope`/`defaultScaffoldWriteScope` return `''` for execution/defect/interruptor and `none` otherwise (`init.module.ts:57-58`, `scaffold.module.ts:61-62`), and the three renderers emit a bare `write-scope:` (`init.module.ts:693`, `scaffold.module.ts:169-171`, `cli.newtask.module.ts:91`). End to end, `mf-specs init --task A:first:execution --task A:second:execution --review A:required` then `check` → `1 spec · 0 failed · 0 issues · 4 warnings` (two `task.write-scope-missing`, two `gate.scope-missing`), and the twin cases assert two missing-scope warnings and no overlap error. A fresh task now has no resolvable scope, so `gate run` refuses it as `gate.scope-missing` until the author declares one — the trade-off this finding's suggestion allowed. The advertised `scope=` token that would let the author declare it does not work in its documented position; filed as F17.

### F12 — A keyed mechanical record with no `scope` bypasses freshness, so a hand-written pass still greens a completed owner

- Severity: Major
- Location: `packages/specs/src/modules/gates/gates.freshness.module.ts:77-78`, `packages/specs/src/modules/gates/gates.module.ts:699-708`, `packages/specs/src/modules/gates/gates.module.ts:868-885`
- Status: Resolved
- Attempts: 1
- First Seen: 006
- Problem: `verifyResultFreshness` returns early on `record.scope === undefined || record.command === undefined` before validating the key, and `verifyGateResults` compares a record's scope with the declared stage scope only when `record.scope !== undefined`, while accepting any `command` equal to the stage's. Nothing checks that a `key` is present or that it agrees with a `scope`/`fingerprint`. Trigger: a complete owner's record `{stage,title,kind:"mechanical",command:<copied from GATES.md>,key:"gate-v1:deadbeef",exit:0,verdict:"pass",at,output:""}` with no `scope` and no `fingerprint` on a stage that declares `scope: packages/specs`. Probed against the shipped functions: `verifyResultFreshness` → `valid: true`, no issues; `verifyGateResults` → `valid: true`, no issues. Twenty bytes of copied JSON plus one arbitrary key satisfy `check --require-complete`.
- Impact: C6's "a fabricated green is rejected" does not hold for completed work. The round-005 fix closed the unkeyed variant (F7); the keyed-but-scopeless variant is the same spoof with one field added, and it passes silently because freshness never reads the key it now demands.
- Suggestion: in `verifyResultFreshness`, treat a keyed pass with no `scope`/`fingerprint` as `gate.results-malformed` (or `gate.stale-result`), not a skip; in `verifyGateResults`, require `record.scope` on a stage that resolves a scope.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] Proved with the shipped functions, not by reading the fixer's note: a mechanical pass carrying an arbitrary `key` and no `scope` yields zero issues from both `verifyResultFreshness` and `verifyGateResults`, even with `declaredScope: () => ['packages/specs']` and `complete: true`.
- [Fixer] A keyed pass with no inputs is no longer skipped. `packages/specs/src/modules/gates/gates.freshness.module.ts:77-95` reports `gate.results-malformed` (error) before recomputation when a keyed pass lacks `scope` or `fingerprint`; `packages/specs/src/modules/gates/gates.module.ts:868-891` requires `record.scope` on any mechanical stage that resolves a scope and reports `gate.results-malformed` when it is absent. The arbitrary-key/no-scope record now fails both functions. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new cases `rejects a keyed pass with no scope instead of skipping freshness` and `rejects a mechanical result with no scope on a scoped stage`), `bun run --cwd packages/specs ts:check`.
- [Reviewer] Confirmed against the shipped functions and the CLI. `verifyResultFreshness` pushes `gate.results-malformed` (error) when a keyed pass lacks `scope` or `fingerprint` (`gates.freshness.module.ts:83-96`), and `verifyGateResults` pushes the same when a mechanical record on a stage that declares a scope carries none (`gates.module.ts:870-881`). Appended `{"stage":0,"title":"sub","kind":"mechanical","command":"printf one","key":"gate-v1:deadbeef","exit":0,"verdict":"pass"}` to a task whose stage declares `scope: app/sub`; `mf-specs check --name` now exits 1 with two `gate.results-malformed` errors instead of accepting the green. Every record `gate run` writes carries `scope`, `key`, and `fingerprint` (`cli.gate.run.module.ts:844-863`), so no legitimate record is rejected; the one malformed record is reported once per layer (duplicate diagnostics, harmless).

### F16 — The post-append `resultIndex` write can mark a newer attempt finished and re-open single flight

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:831-839`, `packages/specs/src/modules/scheduler/scheduler.module.ts:796-809`
- Status: In Review
- Attempts: 1
- First Seen: 007
- Problem: `finish` writes the terminal state (state `failed`/`timeout`/`cancelled`) at `:823`, appends the record at `:830`, then rebuilds a terminal state from a *fresh* read and writes it again to add `resultIndex` (`:831-839`). `terminalState` (`:796-809`) always rewrites the **last** attempt to `finishedAt: at` with the owner's `exit`/`durationMs` and resets `state` to the owner's phase. Between the first terminal write and the pointer write the key is terminal, so another requester's `step()` (step 4, `:704-740`) can legitimately claim attempt n+1. The pointer write then marks that live attempt finished and sets the state back to `failed`, dropping its `waiters`. Reproduced with the shipped `scheduleRun`: owner A fails and its append takes 300ms; B claims attempt 2 and runs 400ms; A's pointer write leaves `state: "failed"`, `attempts[1].exit: 1`, and `attempts[1].finishedAt` set while B is still running; requester C then claims attempt 3 and its execute starts (`events: ["B-start","C-start"]`) before B finishes. A waiter registered on attempt 2 also consumes the clobbered state, reads `resultIndex` 0, and reports attempt 1's record as attempt 2's outcome — the F1 class again.
- Impact: two concurrent executions of one key and two heavy commands despite `lanes: 1`, plus a waiter told a previous attempt's failure as its own result. The window is the append plus the lock and write (small, but widened by contention or a slow filesystem) and it sits on the ordinary fail-then-retry path, with no lease expiry involved.
- Suggestion: make the pointer update conditional on the attempt it belongs to — read the state and write only when `state.attempts.length === attempt` and `state.state === phase` (the guard `heartbeatLoop` already uses at `:981-988`); otherwise leave the state alone, because `consume` already falls back to the attempt's exit fields. Alternatively carry the record index from the single terminal write.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] Found by re-deriving F4's ordering from the code. The first terminal write and the record append are outside the same critical section, so a requester that observes the terminal state can start the next attempt before the pointer write lands; `terminalState` has no attempt guard. Proved with `scheduleRun` and a deliberately slow `persist`: attempt 2 is rewritten with attempt 1's exit and the state flips back to `failed` while attempt 2 runs, and a third requester starts concurrently.
- [Fixer] The pointer update is now conditional on the attempt it belongs to. `packages/specs/src/modules/scheduler/scheduler.module.ts:836-845` reads the state under `runs.lock` and writes only when `state.attempts.length === attempt && state.state === phase`; otherwise it leaves the state alone, so a newer live attempt keeps its owner, lease, `running` phase, and waiters. `consume`'s fallback to the attempt's `exit`/`durationMs` (`:854-877`) is unchanged, so a lost pointer still cannot strand a waiter. Trigger addressed: owner A fails with a 300ms append, B claims attempt 2 and runs 400ms; A's pointer write now sees `attempts.length 2 !== attempt 1` and does nothing, so C waits on B's key instead of claiming attempt 3, and the waiter consumes B's own record. Regression test `a slow append cannot mark a newer attempt finished or re-open single flight` (`packages/specs/src/modules/scheduler/tests/scheduler.test.ts:494-536`) drives exactly that race and asserts `started === ['A','B']`, C `reused` with `attempt 2` and output `b-ok`, and the stored state `passed` with two attempts whose second exit is `0`. With the guard deleted the same test fails at `started` (`['A','B','C']`) — C started while B ran — then it passes with the guard restored. No deviation from the suggestion. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (2 files, 34 tests passed), `bun run --cwd packages/specs ts:check`, `bun run --cwd packages/specs lint:check`, `bun run --cwd packages/specs format:check`.

### F9 — Drift markers are bare tokens that survive deletion of the rule they are meant to protect

- Severity: Minor
- Location: `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:126-158`, `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:403-408`
- Status: Resolved
- Attempts: 2
- First Seen: 005
- Problem: `AUTHORING_MARKERS` matches `/write-scope:/`, `/phase-shared/i`, and `/gate\.shared-check-in-task/` anywhere in the flattened text. `montflow-create-specs/SKILL.md` contains `write-scope:` six times and `phase-shared` six times, including the Reference and self-check sections. Deleting the "Author the Widest Ready Set" rule paragraph (or the two-gate-layer rule, or the code sentence) leaves the other occurrences, so the canonical-marker test and the per-marker mutation test stay green — the mutation only replaces **all** occurrences. The test proves a token exists, not that the rule does.
- Impact: E003's requirement "a test fails when the parallel or scheduler guidance is removed" is met only for a total erasure of the token; the actual rule can silently disappear while the suite stays green, and the test also locks in the unimplemented code claims from F5.
- Suggestion: anchor each marker to a sentence-level phrase that only the rule carries (the `write-scope`/overlap/dependency sentence, the two-gate-layer sentence, the exact code assertion), or assert on the body of a named section rather than a bare token.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Drift markers now anchor to the rule sentence, not a bare token. `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:126-158` matches the write-scope/overlap sentence, the phase-shared "named once, in the phase `GATES.md`" sentence, and the exact `gate.shared-check-in-task` clause; the `serial-reason` marker anchors to "A serial chain is a stated decision". Each mutation rewrites that sentence, so deleting the rule fails the suite. Behavior itself is asserted in the new structure tests from F5, not only the strings. Verified: `bun run --cwd packages/specs test -- src/modules/prompt/tests/lean-contract.test.ts` (86 passed).
- [Reviewer] Partial. The markers are sentence-shaped, but at least one cannot match the rule it is meant to protect: `real-dependency` is `/real data or ordering dependency/`, while the rule at `montflow-create-specs/SKILL.md:178` writes `a **real** data or ordering dependency` — the emphasis breaks the match, so its only match in the skill is the self-check at `:444`. Reproduced: deleting the rule bullet `SKILL.md:178-181` (281 chars) leaves **all six** `AUTHORING_MARKERS` present in the flattened file, so `every canonical source states every marker` stays green, and the per-marker mutation test also passes because `negate(...)` only ever rewrites the self-check copy. Anchor this marker to the emphasised rule sentence (and check the rest the same way).
- [Fixer] `real-dependency` now anchors to the rule phrase, not the token. `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:141-148` matches `only (?:for )?a \*{0,2}real\*{0,2} data or ordering dependency`, which hits the skill rule at `SKILL.md:178` and the prompt's `only for a real data…` sentence but not the self-check at `:444` (`edge names a real data…`); the mutation rewrites that same phrase. Proof: deleting `SKILL.md:178-181` locally made `every canonical source states every marker` fail with `missing lean-contract marker 'real-dependency'` and the per-marker mutation case fail; the file was restored. The other five markers were checked against the skill and prompt and already occur only in their rule (self-check wording differs). Verified: `bun run --cwd packages/specs test -- src/modules/prompt/tests/lean-contract.test.ts` (86 passed after restore).
- [Reviewer] Confirmed. All six `AUTHORING_MARKERS` patterns occur exactly once each in `packages/specs/skills/montflow-create-specs/SKILL.md` and once each in `packages/specs/prompts/spec-create.json` over whitespace-flattened text, so deleting the rule sentence removes the only match and `every canonical source states every marker` fails, while `negate(...)` rewrites that same single copy so the per-marker mutation case fails for the rule and not a self-check echo. `bun run --cwd packages/specs test -- src/apps/cli/tests/gate-scheduler.test.ts src/modules/prompt/tests/lean-contract.test.ts` → 4 files, 108 tests pass.

### F13 — `gate run --scope` records a scope the freshness check then rejects, so the documented override leaves a permanent `gate.stale-result`

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.gate.run.module.ts:768`, `packages/specs/src/apps/cli/cli.gate.run.module.ts:829-831`, `packages/specs/src/modules/gates/gates.freshness.module.ts:82-98`, `packages/specs/src/modules/gates/gates.module.ts:868-885`
- Status: Resolved
- Attempts: 1
- First Seen: 006
- Problem: `gate run --scope <list>` overrides the stage/owner scope for that invocation and writes the override into the record's `scope` and `key` (`cli.gate.run.module.ts:768,829-831`). F2's fix then requires the record scope to equal the declared scope exactly (`gates.freshness.module.ts:82-98`, `gates.module.ts:868-885`), so **any** override on a stage that resolves a scope produces a `gate.stale-result` error. Both directions fail: a narrowing `--scope app2` on a stage declaring `scope: app` (the sequence recorded by `gate-scheduler.test.ts:436-441`), and a widening `--scope packages/specs,packages/core` on a stage declaring `packages/specs`, which covers the declared scope but is not equal. Probed: declared `['repo']`, record `['packages/specs']`, key already matching the recomputation → one `gate.stale-result` ("stage declares 'repo'").
- Impact: the documented override (C4, README `--scope`) leaves the spec's `check` red — an error, not a warning — until the heavy command is run a second time without the override, and a pass that proves more than the stage asked for is rejected. F2's own suggestion allowed "equal (or cover)".
- Suggestion: accept a record whose scope covers the declared scope (`scopeContains(record.scope, declared)`), and either refuse a narrowing override at run time as `gate.invalid-scope` or record the declared scope separately and treat the override as a non-proof. Add a `check` assertion to the `honors --scope` test.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] The exact-equality comparison is the cause; the key recomputation itself is correct, so this can never be fixed by re-running the same override. The repo's own gate-scheduler test records exactly such an override and never checks the resulting spec.
- [Fixer] A covering scope is now accepted and a narrowing override is refused before it can record. `packages/specs/src/modules/scheduler/scope.module.ts:55-78` hosts `scopeContains`/`scopesOverlap` (structure re-exports them); `packages/specs/src/modules/gates/gates.freshness.module.ts:104` and `gates.module.ts:882` use `scopeContains(record.scope, declared)`; `packages/specs/src/apps/cli/cli.gate.run.module.ts:768-822` resolves the declared scope separately and fails a non-covering `--scope` as `gate.invalid-scope` before fingerprinting. The `honors --scope` test now records a widening `app` over a stage declaring `app/sub`, asserts `check` has no `gate.stale-result`, and asserts a disjoint override is refused (`packages/specs/src/apps/cli/tests/gate-scheduler.test.ts:425-456`). Verified: `bun run --cwd packages/specs test -- src/apps/cli/tests/gate-scheduler.test.ts` (22 passed).
- [Reviewer] Confirmed end to end. Freshness accepts a record that covers the declared scope (`gates.freshness.module.ts:102-118`) and `verifyGateResults` repeats the rule (`gates.module.ts:882-893`); `gate run` refuses a non-covering `--scope` as `gate.invalid-scope` (`cli.gate.run.module.ts:807-824`). Reproduced on a stage declaring `scope: app/sub`: `gate run --scope app` records `scope:["app"]` and `check` is clean; editing `app/sub/x.txt` then makes `check` exit 1 with `gate.stale-result`; `--scope app2` is refused. The refusal is evaluated inside the per-stage loop, so a later stage can fail after earlier stages already ran and recorded; filed as F18.

### F14 — The Phase E records still describe the pre-fix verifier

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/E/E001-decide-parallel-execution-contract/MEMORY.md:27`, `.agents/@montflow/specs/montflow-spec-standard/E/E002-implement-verification-scheduler/MEMORY.md:41`, `.agents/@montflow/specs/montflow-spec-standard/E/E002-implement-verification-scheduler/MEMORY.md:58-61`, `.agents/@montflow/specs/montflow-spec-standard/E/E003-teach-parallel-phase-authoring/MEMORY.md:47`
- Status: Resolved
- Attempts: 1
- First Seen: 006
- Problem: E001's normative C6 still says `gate.result-unkeyed` is a warning and "a complete owner is exempt", while `gates.freshness.module.ts:62-74` now reports an error for a complete owner whose stage resolves a scope. E002's findings repeat "complete owners exempt" (`:41`) and its Open Questions still say the C2 checks and `write-scope` generation "are not implemented here" (`:58-61`), although F5 shipped both. E003's last Finding says "only `gate.scope-missing` exists in current `check`" (`:47`).
- Impact: the phase's decision record contradicts the code it governs, so the next implementer reads C6 and believes a completed owner can carry an unkeyed pass, and reads E002/E003 and believes four of the five contract codes are still missing. `packages/specs/README.md:465-472` already describes the shipped behaviour, so the records are the only stale truth.
- Suggestion: amend C6, E002's unkeyed bullet and open question, and E003's last Finding to the shipped behaviour (error on a scoped complete owner; all five codes implemented; generators write `write-scope:`).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] Found by diffing the phase records against the shipped code paths cited in F5/F7; `check` itself does not read these prose records, so nothing flags the drift.
- [Fixer] Applied by the orchestrator, not by this fixer: no `.agents/@montflow/specs/**` path was edited in this attempt. The records now describe the shipped behaviour at `.agents/@montflow/specs/montflow-spec-standard/E/E001-decide-parallel-execution-contract/MEMORY.md` (C6: `gate.result-unkeyed` is an error on a complete owner whose stage declares a scope, legacy unscoped stage exempt; `gate.stale-result` also covers a recorded scope that no longer matches the stage's declared scope), `E/E002-implement-verification-scheduler/MEMORY.md` (the "complete owners exempt" wording is gone and the Open Question records that all five C2 codes and `write-scope:` generation shipped), and `E/E003-teach-parallel-phase-authoring/MEMORY.md` (all five codes fire). No code or test change was needed for this finding.
- [Reviewer] Confirmed the three cited claims are amended: E001 C6 now says the unkeyed pass is an error on a complete owner whose stage declares a scope, E002 repeats it (`:39-43`) and its Open Question records that all five C2 codes and `write-scope:` generation shipped (`:62-67`), and E003 names all five codes as firing (`:45-49`). `mf-specs check --name montflow-spec-standard` still reports the two stale E002/E003 stage-3 passes the record describes (2 errors), so that note remains truthful. One residual imprecision in the amended C6 is filed as F19.

### F17 — The documented `scope=` task token is rejected by `init` and silently ignored by `create`

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.init.module.ts:64-92`, `packages/specs/src/apps/cli/cli.create.module.ts:284-325`, `packages/specs/src/apps/cli/cli.init.module.ts:431`, `packages/specs/src/apps/cli/cli.create.module.ts:485`
- Status: In Review
- Attempts: 1
- First Seen: 007
- Problem: both parsers split on `:` and treat `scope=` as the last positional, but `init` names position 5 `after=` and `create` names position 3 `gates`. The help advertises `PHASE:name:type[:size][:after=…][:scope=…]` / `name[:type[:gates[:size]]][:scope=…]`, which reads as "append `:scope=`". `mf-specs init --task A:first:execution:medium:scope=app` fails with `'scope=app' must read after=<name,name>` (`cli.init.module.ts:86-87`) — a message naming the wrong token — and `mf-specs create --tasks first:execution:scope=app` parses `gates=scope=app`, which is neither `gates` nor `true`, so the scope is dropped with no diagnostic and the task renders a bare `write-scope:` (verified: `write-scope:` empty, `task.write-scope-missing` warning). The tests only exercise the full forms (`create.test.ts:287`, `build:execution:gates::scope=…`) and never the short documented form.
- Impact: an author who follows the documented grammar either gets a misleading error or believes a scope was declared when the generated task carries an empty one, so `phase.write-scope-overlap` cannot protect that task. Workarounds exist (`medium::scope=app`, `gates:medium:scope=app`) but are undocumented.
- Suggestion: recognize a `scope=` token by prefix anywhere after the type (pull it out of the positional list) and reject any other unknown trailing token loudly; add tests for `A:first:execution:medium:scope=app` and `first:execution:scope=app`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] Found while exercising F11 end to end: the empty default is fine, but the documented way to supply a real scope on the same command fails. Confirmed both the loud-but-wrong `init` error and the silent `create` drop.
- [Fixer] Both parsers now pull a `scope=` token out of the positional list by prefix, wherever it appears after the type. `packages/specs/src/apps/cli/cli.init.module.ts:72-125` filters `scope=` out of the tokens after the type and classifies the rest as blank, a size, or `after=`; anything else fails with `'<token>' is not a known task token — use a size (…), after=<name,name>, or scope=<path[,path]>.`, and a duplicate `scope=`/`after=`/size is its own error. `packages/specs/src/apps/cli/cli.create.module.ts:283-330` does the same, so `gates` must now be `gates`, `true`, or blank instead of silently reading `false`. Trigger addressed: `mf-specs init --task A:first:execution:medium:scope=app` writes `write-scope: app` (real CLI on a temp dir, `A/A001-first/TASK.md:8`), the same command with `:typo=1` exits 1 naming `'typo=1'`, and `mf-specs create --tasks first:execution:scope=lib` writes `write-scope: lib`. Tests: `Cli.parseScaffoldTask > accepts the documented scope short form and refuses another trailing token` (`packages/specs/src/apps/cli/tests/create.test.ts:301`) covers `first:execution:scope=app`, a five-field scoped form, and the loud unknown-gates rejection; `init accepts the documented scope= short form and refuses another token` (`packages/specs/src/apps/cli/tests/run-slash.test.ts:751`) drives the full `init` command and asserts the rendered `write-scope: app` plus the loud `typo=1` diagnostic. Deviation: none; token order after the type is now flexible (a bare size or `after=` in either order) rather than strictly positional. Verified: `bun run --cwd packages/specs test -- src/apps/cli/tests/create.test.ts src/apps/cli/tests/run-slash.test.ts` (8 files, 212 tests passed), `bun run --cwd packages/specs ts:check`, `bun run --cwd packages/specs lint:check`, `bun run --cwd packages/specs format:check`.

### F18 — A non-covering `--scope` is detected per stage, after earlier stages already ran and recorded

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.gate.run.module.ts:767-824`, `packages/specs/src/apps/cli/cli.gate.run.module.ts:828-863`
- Status: In Review
- Attempts: 1
- First Seen: 007
- Problem: the override's covering check lives inside the per-stage loop (`:807-824`), after owner/scope resolution and before that stage's fingerprint and run. Stages ahead of the offending one have already executed and appended their records. Reproduced: a task gate with stage 0 `scope: app/sub` and stage 1 `scope: app`, run `gate run --task A001 --scope app/sub --all` → stage 0 runs and appends a pass record, then stage 1 fails `gate.invalid-scope` ("--scope 'app/sub' does not cover the stage's declared scope 'app'").
- Impact: a usage error has side effects — a heavy command is wasted, the results file gains a partial record set, and the operator learns the override is invalid only after work has run.
- Suggestion: resolve every selected stage's declared scope and validate the explicit override (and its grammar) against all of them before the loop runs any stage, so a bad override fails before the first execution.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] Found by re-deriving F13's refusal from the loop structure. Verified with the shipped CLI on a two-stage task gate: stage 0's record is on disk when stage 1 raises `gate.invalid-scope`.
- [Fixer] The override is now validated before the loop. `packages/specs/src/apps/cli/cli.gate.run.module.ts:765-787` resolves every selected stage's declared scope (`stageScope(stage) ?? fallbackScope`) into `declaredScopes` and, when `--scope` is given, fails `gate.invalid-scope` for the first stage whose declared scope it does not cover — naming that stage — before any stage is fingerprinted or run; the loop then reads `declaredScopes[index]` and the old per-stage coverage check is deleted. Trigger addressed: the finding's two-stage task gate (stage 0 `scope: app/sub`, stage 1 `scope: app`) run as `--scope app/sub --all` now fails before stage 0, so no command executes and `GATE-RESULTS.jsonl` stays absent. Regression test `refuses a non-covering --scope before any stage runs or records` (`packages/specs/src/apps/cli/tests/gate-scheduler.test.ts:457-476`) asserts `executions === 0` and zero records; with the pre-pass disabled to emulate the old ordering the same test fails with `expected 1 to be +0`, proving it catches the side effect. No deviation from the suggestion. Verified: `bun run --cwd packages/specs test -- src/apps/cli/tests/gate-scheduler.test.ts` (2 files, 24 tests passed), `bun run --cwd packages/specs ts:check`, `bun run --cwd packages/specs lint:check`, `bun run --cwd packages/specs format:check`.

### F19 — C6, the README, and E002 still describe an exact scope match, not the shipped covering rule

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/E/E001-decide-parallel-execution-contract/MEMORY.md:27`, `.agents/@montflow/specs/montflow-spec-standard/E/E002-implement-verification-scheduler/MEMORY.md:48`, `packages/specs/README.md:455-474`
- Status: In Review
- Attempts: 1
- First Seen: 007
- Problem: after F13 the check is `scopeContains(record.scope, declared)` — a wider scope is accepted and only a non-covering one is refused (`gates.freshness.module.ts:102-118`, `gates.module.ts:882-893`) — while the normative records still say `gate.stale-result` fires when "the recorded scope no longer matches the stage's declared scope" (E001 C6) and "a record's scope differs from what the stage declares" (README `:472`). E002's resolution sentence (`:48`) also omits the new `gate.invalid-scope` refusal of a narrowing `--scope`, which README `:411-414` documents.
- Impact: a reader implementing or auditing against C6 and the README would treat a widening `--scope` pass as stale — the opposite of the shipped rule — and would not know the override is validated at all. This is the same records-describe-a-different-verifier class as F14, in the other direction.
- Suggestion: say "does not cover" in C6 and the README, and add the narrowing `--scope` refusal to E002's scope sentence.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] Found by comparing F13's shipped rule with the text the F14 amendment wrote into C6 and the README. The code is correct; the prose states a stricter rule than the verifier enforces.
- [Fixer] The README now states the shipped covering rule and the pre-run refusal. `packages/specs/README.md:411-417` says a `--scope` override "must cover every selected stage's declared scope; it may widen but not narrow, and a narrower override is `gate.invalid-scope`, refused before any stage runs", and `:467-471` says `gate.stale-result` fires when "a record's scope does not cover the stage's declared scope" instead of "differs from what the stage declares". No `.agents/@montflow/specs/**` file was edited in this attempt. Verified against the orchestrator's amended records: E001 C6 (`.agents/@montflow/specs/montflow-spec-standard/E/E001-decide-parallel-execution-contract/MEMORY.md:27`) already reads "whose recorded scope does not cover the stage's declared scope", and E002 (`.agents/@montflow/specs/montflow-spec-standard/E/E002-implement-verification-scheduler/MEMORY.md:48-52`) already reads "a run-time `--scope` that does not cover the stage's declared scope is refused `gate.invalid-scope` before any stage runs, and a recorded scope that covers the declared scope satisfies freshness while a non-covering one is `gate.stale-result`". Both agree with the new README wording, and F18 makes E002's "before any stage runs" literally true. Verified: `bun run --cwd packages/specs format:check` (README included in the 285-file check), `bun run --cwd packages/specs lint:check`, `bun run --cwd packages/specs ts:check`. No deviation from the suggestion.

### F15 — A stray JSDoc swallows a duplicated `gateExitCode` and documents it as the subjective-verdict recorder

- Severity: Nit
- Location: `packages/specs/src/apps/cli/cli.gate.run.module.ts:929-939`
- Status: Resolved
- Attempts: 1
- First Seen: 006
- Problem: the `recordGateVerdict` doc block ("Record one subjective verdict … `@returns the recorded verdict`") at `:929-933` is never closed; the `*/` on line 937 closes it, so the first `export const gateExitCode` (`:934-935`) is dead text inside the comment and the live declaration at `:938` is undocumented while its hover shows the other function's doc.
- Impact: a duplicated exported-looking declaration and a comment that describes a different module. `tsc`, oxlint, and the tests all stay quiet because the duplicate is inert, so the next reader edits the dead copy.
- Suggestion: delete `:929-936` (the stray comment and the dead declaration) and keep one documented `gateExitCode`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Reviewer] `tsc --noEmit` and the gate tests pass precisely because the first declaration is commented out; the doc above it still claims to document a subjective-verdict writer that lives in `cli.gate.record.module.ts`.
- [Fixer] The stray JSDoc and dead duplicate are gone. `packages/specs/src/apps/cli/cli.gate.run.module.ts:948-951` now keeps one documented `gateExitCode`; the unclosed `recordGateVerdict` block and the commented-out first declaration were deleted. Verified: `bun run --cwd packages/specs ts:check`, `bun run --cwd packages/specs test -- src/apps/cli/tests/gate.test.ts` (passed).
- [Reviewer] Confirmed. `cli.gate.run.module.ts:949-951` holds one documented `gateExitCode`, and `grep -n 'gateExitCode|recordGateVerdict'` finds no second declaration and no unclosed block; `bun run --cwd packages/specs test -- src/apps/cli/tests/gate-scheduler.test.ts src/modules/prompt/tests/lean-contract.test.ts` and `ts:check` pass.

## Summary

- Critical: 0
- Major: 4
- Minor: 6
- Nit: 1
- Open: 0
- In Review: 4
- Resolved: 7
- Won't Fix: 0
- Escalated: 0
