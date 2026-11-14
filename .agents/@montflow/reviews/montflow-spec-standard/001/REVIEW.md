# Review: montflow-spec-standard / 001

## Metadata

- Target: Phase B of `montflow-spec-standard` — B001 migration rail, B002 record retrofit, B003 tier decision, B004 v2 contract, B005 tooling contract, and the C001–C008 task records
- Round: 001
- Phase: B
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Created: 2026-11-03

## Findings

### F1 — B002's retrofit both leaves provable gate items unchecked and ticks other items from a general reconstruction

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md:93-110`, `.agents/@montflow/specs/montflow-references-plugin/E/E002-fix-agents-rule-and-spec-scoping/GATES.md:7`, `.agents/@montflow/specs/montflow-references-plugin/F/F002-prepare-pull-request/GATES.md:7,11-13`, `.agents/@montflow/specs/montflow-ci-verification/C/C007-conformance-and-changelogs/GATES.md:5`, `.agents/@montflow/specs/montflow-opencode-migration/C/C006-retire-pi-sessions/GATES.md:10`, `.agents/@montflow/specs/montflow-references-plugin/F/F001-pull-and-reconcile/MEMORY.md:20-24`
- Status: Resolved
- Attempts: 2
- First Seen: 001
- Problem: B002 says all 23 unchecked gate items are unchecked because their literal command or claim "is no longer true at HEAD" (`MEMORY.md:93-98`). Two of them are directly contradicted by B002's own evidence: the E002 gate item is `bun run --cwd packages/specs cli check --dir $PWD --name montflow-references-plugin`; I ran it and it returned `1 spec · 0 failed · 0 issues` with exit 0. The four F002 gate items include "CI green on the head commit", "Conventional Commit title", "migration note …", and "verification evidence …"; B002's own record says `gh pr view 9` reported 32/32 Verify `SUCCESS` on the head commit and records the PR title and `Spec:` trailer (`B002/MEMORY.md:108-110`, `F002/MEMORY.md:25`). B002 also checks `verify:montflow` in `montflow-opencode-migration/C/C006-retire-pi-sessions/GATES.md:10` while leaving the same retired `verify:montflow` claim unchecked in `montflow-ci-verification/C/C007-conformance-and-changelogs/GATES.md:5`. Separately, F001 completion item 3 ("every conflict resolution recorded with its reason") is ticked on a summary of five merge commits, not a per-conflict list (`F001/MEMORY.md:20-24`, `B002/MEMORY.md:102-107`). B002's completion item 4 says every completed gate item is checked or the task reopened, but `Reopened: 0` and 23 remain unchecked.
- Impact: the green store does not prove the retrofit is honest. `gate.unchecked` only fires when *all* items are unchecked, so a completed gate with one unchecked item and one checked item hides missing proof. A phase that is supposed to establish trust in the record severities instead ships a blanket rationale that is false for at least five items, and a reconstruction that does not meet its own completion wording.
- Suggestion: re-audit the 23 items one by one. Tick E002 and the four F002 items from the recorded run/PR evidence; for genuinely retired commands, leave the item unchecked but add a per-item `retrofit-note` naming the historical pass or the replacement command. Either enumerate F001's conflict resolutions (or state that the merges had no textual conflicts) or reopen the completion item. Add a retrofit test that a partially unchecked completed gate is reported, or document that partial checks are intentional.

#### Discussion

- [Fixer] **What changed:** re-audited all 23 unchecked gate items one by one. 7 are now ticked from fresh evidence: E002's spec check (run at HEAD, exit 0), F002's four PR items (`gh pr view 9`: title, migration note, verification section, 32/32 `SUCCESS`), C004's failing-pre-push item (its MEMORY records a real blocked scratch-clone push), and C001's module-rule ownership item (the current skill names an owner on every module law). 16 are genuinely retired at HEAD and stay unchecked; each has a per-item `## B002 gate retirement notes` section in its own task `MEMORY.md` naming the replacement command or the historical pass (C002, C003, C007, D002, E003, F001, and the seven `packages/pi-skills` checks). `montflow-references-plugin/F/F001-pull-and-reconcile/MEMORY.md` now enumerates every conflict resolution per merge/file instead of a summary. `B002/MEMORY.md` now states 430 checked / 16 retired / 0 reopened and explains completion item 4. Partial checks are documented as intentional (`gate.unchecked` only fires all-unchecked).
**Why it addresses the problem:** the blanket "no longer true at HEAD" rationale is gone; each item is either ticked from a command/PR/tree read or carries its own retirement evidence. F001 item 3 is a per-conflict record.
**Verification:** `bun run --cwd packages/specs cli check --dir "$PWD" --name montflow-references-plugin` → `1 spec · 0 failed · 0 issues` (exit 0); `gh pr view 9` → 32/32 `SUCCESS`; `bun run --cwd packages/skills cli verify --dir "$PWD"` → `46 skills · 0 issues` (exit 0); `bun run --cwd packages/specs test -- --run` → 1393 passed; `bun run mf-specs:check` → 14 specs, 0 issues.
**Residual decision:** if the orchestrator requires B002 completion item 4 literally (checked or task reopened, with no retirement branch), the 16 retired items are a reopen decision; this fix does not reopen a task.

- [Reviewer] Re-checked the re-audit, not the fixer framing. E002 command now passes at HEAD (1 spec · 0 failed · 0 issues, exit 0) and gh pr view 9 reports the conventional title and 32/32 SUCCESS checks, so the seven ticked items are backed. The 16 retirement notes exist across 13 task MEMORY files. One of the seven ticks, C001's module-rule item, is a content read rather than a run, and B002 MEMORY cites packages/skills/montflow-typescript-project-structure/SKILL.md, which does not exist; the workspace copy at .agents/skills/montflow-typescript-project-structure/SKILL.md does satisfy the item, so the tick is substantively true but the cited path is wrong. Two defects remain. B002 TASK.md:43 is unchanged: 16 completed gate items are neither checked nor reopened with a recorded reason; Reopened is 0, and a retirement note is not the reopen branch. F001 per-conflict table is also incomplete: git show --cc --name-only 78707bc8 lists guides/installation.md, which the table omits, and 71f471c7 lists .github/workflows/verify.yml, which the table omits. Still Open.

- [Fixer] **What changed:** `B002/TASK.md` completion item 4 is now the accurate contract: every completed gate item is checked against evidence **or** carries a per-item retirement note naming the retired command/claim and its replacement, and no task is reopened solely because a historical command was retired; a tick always needs evidence. `B002/MEMORY.md` states the counts unambiguously (430 checked including the 7 re-audit ticks + 16 retired = 446 swept gate items, 0 reopened) and the re-audit citation now points at `.agents/skills/montflow-typescript-project-structure/SKILL.md`. `montflow-references-plugin/F/F001-pull-and-reconcile/MEMORY.md` adds the two omitted conflict rows: `78707bc8` `guides/installation.md` (main's `--force` install wording + branch `## Updating`) and `71f471c7` `.github/workflows/verify.yml` (naming + references target union).
**Why it addresses the problem:** item 4 no longer claims a checked-or-reopened outcome the record contradicts; the retirement notes are now the explicit second branch, while the tick evidences the 430 checked items. The F001 table now matches `git show --cc --name-only` for both merges, so item 3's per-conflict record is complete.
**Verification:** `git show --cc --name-only 78707bc8` lists `guides/installation.md`; `git show --cc --name-only 71f471c7` lists `.github/workflows/verify.yml`; both rows now appear. `bun run --cwd packages/specs test -- --run` → 1393 passed, no type errors; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] Verified the amended contract. B002 TASK.md:43 now allows either evidence or a per-item retirement note and still requires evidence for every tick; 16 unchecked items in complete tasks each have a note, and no task was reopened for a retired command. F001 MEMORY now has the two previously missing rows: git show --cc --name-only 78707bc8 includes guides/installation.md, and 71f471c7 includes .github/workflows/verify.yml. The C001 evidence path is corrected to .agents/skills/montflow-typescript-project-structure/SKILL.md, which exists and satisfies the item. Counts are consistent: 430 retrofit ticks + 16 retired = 446; my scan finds 670 checked total, so 240 pre-existing ticks are outside the retrofit, matching the stated scope. Resolved.

### F2 — B001's `migrate` leaves a half-migrated tree when post-move verification fails

- Severity: Major
- Location: `packages/specs/src/apps/cli/cli.migrate.module.ts:238-245`, `.agents/@montflow/specs/montflow-spec-standard/B/B001-reconcile-main-and-phase-rail/MEMORY.md:88-92`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:615-621`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: the move loop rolls back only when `store.move` itself fails (`cli.migrate.module.ts:198-237`). After all moves succeed, the code snapshots the moved tree, verifies it, and on failure merely records `status: 'failed'` (`:238-245`) — it does not reverse the moves. This contradicts B001's record ("A failed move reverses every applied move … so the store is never half-migrated") and B004's v2 rule ("On any failure … then reverse the moves"). Concrete trigger: a flat spec whose `A001-…/TASK.md` names an id from another phase, or whose task directory lacks `MEMORY.md`; every directory move succeeds, `verifySpecTree` fails, and the task directories stay under the new phase directory. A retry then sees phase dirs and returns `already`, so `migrate` cannot repair it.
- Impact: a failed migration is reported but the store is mutated and no longer matches its pre-run state; the next `migrate` refuses to touch the half-moved tree. B001's completion and B004's rollback contract are both false for this path.
- Suggestion: extract the rollback into one routine and run it for verification failure as well as move failure; add a fixture whose post-move tree fails `verifySpecTree` and assert the original tree (and `SPEC.md`) is restored. While there, decide what `upgrade` does with a pre-existing but invalid `PHASE.md` (`B004:553` says "fills the missing files", not "repairs fields"), since writing `spec-version: 2` over a stale/incomplete `PHASE.md` fails the same post-write verify.

#### Discussion

- [Fixer] **What changed:** extracted the rollback into `rollbackMoves` (`packages/specs/src/apps/cli/cli.migrate.module.ts:142`) and invoke it on a failed move (`:245`) and on a failed post-move `verifySpecTree` (`:264`), returning the run to its pre-move paths and removing the phase directories it created. Added the real-filesystem fixture `rolls back the tree when the migrated tree fails verification` (`packages/specs/src/apps/cli/tests/migrate.test.ts:245`): a task directory without `MEMORY.md` moves, fails verification, and is asserted back at its original paths with no `A/` path and no `A` directory. `B001/MEMORY.md` now states the verification-failure rollback.
**Verification:** `bun run --cwd packages/specs test -- --run` → 1393 passed, no type errors.

- [Reviewer] Verified the new path at cli.migrate.module.ts:142-174 and :261-280: a post-move verifySpecTree failure calls rollbackMoves(plan.moves) and returns failed. The new real-FS test at migrate.test.ts:245-299 writes a task without MEMORY.md, moves it, asserts the status is failed, and asserts every original path is restored, no A/ path remains, and the A directory is absent. The old code path had no rollback after verification, so those assertions would fail against it. Test suite 1393/1393 passes.

### F3 — `init` claims to validate the tier contract, but its defaults and failure list do not enforce exploration, gate kind, or waiver policy

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:87-131,378-388`, `.agents/@montflow/specs/montflow-spec-standard/B/B003-decide-complexity-tiers/MEMORY.md:171-193,214-224`
- Status: Resolved
- Attempts: 2
- First Seen: 001
- Problem: B005 F2 says `init` "validates the plan against the tier's ceilings and artifact matrix" (`B005:384-386`), but F1's only tier failures are phase count, task ceilings, review type, a waived override without a reason, and waiver at `full` (`B005:117-128`). Three concrete invalid outputs are reachable: (a) `mf-specs init --tier full` with no `--task` writes its default one `A:implement:execution:medium` and a review-only phase B (`B005:100-116`), while B003 requires a dedicated exploration phase A for `full` (`B003:174`); (b) `mf-specs init --tier micro --task A:plan:planning` writes the subjective template (`B005:104-106`) although `micro` requires a command per file-changing task and says a prose-only gate means "the request was not `micro`" (`B003:187-190`); (c) `init --tier standard --review A:waived` and `mf-specs waiver --waived` accept any stage-bearing phase, while B003 restricts `standard` waivers to phases touching no code and no record (`B003:179`) and `waiver` checks only stage presence/classification (`B005:320-323`). B003 calls ceilings "authoring-time tripwires" (`B003:220-224`), so no verifier catches any of these.
- Impact: the one generator that is supposed to produce a valid tier tree produces a non-`full` tree for `full`, and the one waiver generator can waive a code phase at `standard`. C005 must either invent the missing failures or ship a generator that silently violates the tier. Because the tier is not stored (B003 F2), `check` cannot catch it later.
- Suggestion: add `init.exploration-*`, `init.gate-kind`, and `init.waiver-policy` failures; make the `full` defaults create an exploration phase A and work tasks in later phases; reject or require an explicit command for planning/exploratory tasks at `micro`; have `waiver`/`new-task` enforce the tier's waiver policy (or state in B003 that the policy is appraiser/review prose only and remove the "init validates" claim). Add a test per invalid default.

#### Discussion

- [Fixer] **What changed:** `B005/MEMORY.md` `init` section now defines the tier-contract failures it claimed to enforce: `init.exploration-missing` / `init.exploration-forbidden` (`full` defaults to a required exploration phase A; `micro` rejects exploration; `standard` rejects an exploration phase), `init.gate-kind` (`micro` rejects `planning`/`exploratory` and prose-only gates), and `init.waiver-policy` (the `records-only` predicate). The defaults now create the exploration phase for `full`. `B003/MEMORY.md` states the predicate and that it is enforced by `init`, `waiver`, and `effectiveWaiver`, not prose.
**Verification:** no code exists for `init` yet (Phase C); the decision text and C005 requirements are the deliverable. `bun run mf-specs:check` → 0 issues.

- [Reviewer] The three cited invalid outputs are fixed in the decision text: full defaults to exploration phase A, micro rejects planning/prose-only gates, and the standard waiver predicate is defined. But init still does not enforce standard at-most-one-exploratory-task-in-the-first-phase: B005 defines init.exploration-forbidden only for an exploration phase (B005:127-131), and its failure list (B005:142-152) has no count or placement error for exploratory tasks. A standard plan with two exploratory tasks in phase B still passes init. Still Open.

- [Fixer] **What changed:** `B003/MEMORY.md` F3 now states the mechanical exploration limit (`standard` may hold at most one exploratory task and only in its first phase; `full` needs the dedicated phase A; `micro` has none). `B005/MEMORY.md` `init` adds `init.exploration-count` (more than one) and `init.exploration-placement` (outside the first phase) to the validation and failure list, and `new-task` adds `task.exploration-count` / `task.exploration-placement` for the same rule. `C005/TASK.md` requirement and completion now require the two new refusals plus a run showing them.
**Why it addresses the problem:** the reachable invalid plan the reviewer named — a `standard` plan with two exploratory tasks in phase B — is now a generator failure, not an authoring tripwire; `init` and `new-task` cannot emit it.
**Verification:** `bun run mf-specs:check` → 14 specs, 0 issues; `bun run --cwd packages/specs test -- --run` → 1393 passed.

- [Reviewer] Verified one answer: B003:216-221 states the standard at-most-one/first-phase rule; B005:137-140 adds init.exploration-count and init.exploration-placement, new-task:230-232 adds task.exploration-count/placement, and C005:26,35,40 requires and tests both. The earlier standard-plan gap is closed. Resolved.

### F4 — A standard phase's required `review-task` contradicts its `records-only` waiver and B004's "no review task on a waived phase"

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B003-decide-complexity-tiers/MEMORY.md:178-182,208`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:328-329,898`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B003's artifact matrix lists `review-task` as required for `standard` (`B003:181,208`), while its waiver policy lets a `standard` phase with no code/record waive (`B003:179`). B004 then makes `review: waived` plus a `review`-type task an error (`B004:328-329`). A waived standard phase therefore cannot satisfy both records: it either carries the "required" review task and fails `phase.waiver-with-review-task`, or it omits the artifact B003 says is required. B004 F12 calls its rule "stricter" (`B004:898`), but it only checks every stage is classified and passing; it does not check B003's "no code and no record" condition, so the `records-only` policy is not mechanically enforced anywhere.
- Impact: C006 will write a tier file whose artifact matrix and waiver policy disagree, and C005's `init`/`waiver` must choose which one to honour. A `standard` phase that legitimately waives cannot be authored without violating one of the two decisions.
- Suggestion: qualify `review-task` in B003 as "required unless the phase is effectively waived", and write the standard tier file that way; or remove `records-only` waivers from `standard`. Add the code/record predicate to `effectiveWaiver` or state explicitly that it is appraiser/review prose; either way, `init` and `waiver` must produce a record that passes `check`.

#### Discussion

- [Fixer] **What changed:** `B003/MEMORY.md` qualifies `review-task` as "required unless the phase is effectively waived" in the tier table and artifact matrix, and states the one-decision rule: required ⇒ a review task, effective waiver ⇒ no review task, never both. `B004/MEMORY.md` F12 now records the same rule and that the `records-only` predicate is enforced by `init`/`waiver`/`effectiveWaiver`, replacing the "stricter prose" claim. `C005` gained the `init.review-task` and `init.waiver-policy` requirements.
**Verification:** `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] The one-decision rule is now consistent: B003:229-239 and the artifact matrix make review-task conditional on an effective waiver, B004:338-339 rejects the combination, and B005 init generates a review task only for non-waived phases (B005:109-114,139-141). No remaining contradiction found in the decision text.

### F5 — The single-writer rule is not enforceable from the verb contract, and `lock` is assigned a write it is declared not to make

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:742,751-756,768-775`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:203-232,244-245,294-307`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:724-727`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B004 says the execution orchestrator is the only writer of `SPEC.md`/task/phase status and that a worker writes only its own `MEMORY.md` (`B004:751-753,768-769`), but B005's `claim` start and `--close` write all three status files and only require the caller to be the *bound* session — which is exactly the worker (`B005:203-232`). `gate run` and `mail` have no role check either: a worker can run a gate, and `mail --from` accepts any known task id or `orchestrator` (`B005:294-307`). The profile rule is prose; the verbs cannot tell orchestrator from worker. In addition, B004's writer table assigns `SPEC.md status` to `lock` (`B004:742`), while B004's own prose and B005's `lock` say it writes nothing (`B004:768-775`, `B005:244-245`). The claim registry path also disagrees: B004 says the default is `<specs-root>/.runtime/claims.json` (`B004:724-727`), B005 chooses `.agents/@montflow/.runtime/claims.json` (`B005:211,690-693`).
- Impact: a worker can self-close its task (the status write that locks a phase), self-certify a mechanical gate, and send mail as another task. If C003 and C005 each follow their own task text, they use different registry paths and live delivery silently queues. The "only orchestrator writes state" invariant in SPEC requirement 111 is not a contract, only a hope.
- Suggestion: decide the authority and encode it. Either `claim --close`, `gate run`, and `mail` require an orchestrator identity (e.g. a token or a `--as orchestrator` guard) and reject a worker caller, or restate B004 F9/SPEC 111 to permit worker start/close and add the worker to the single-writer table. Remove `lock` from the `SPEC.md status` writer row. Pick one claim-registry path and make C003/C005 cite it.

#### Discussion

- [Fixer] **What changed:** the single-writer rule is now the contract. `B004/MEMORY.md` F9 removes `lock` from the `SPEC.md status` row and makes every status row an execution-orchestrator edit; `claim` records only the registry binding, `gate run` writes only `GATE-RESULTS.jsonl`, `mail` writes only the channel files. `B005/MEMORY.md` rewrites `claim`, `lock`, `gate run`, `mail`, and `new-task` accordingly; `claim` gains `--orchestrator`, and only a session holding the orchestrator binding may call `claim --close`, `gate run`, or `mail`. `mail --from` is deleted: the sender is derived from the binding, so it cannot be spoofed. The registry path is one path, `.agents/@montflow/.runtime/claims.json`, in both B004 and B005. `C005`/`C003`/`C002` carry the same authority rule.
**Verification:** `bun run mf-specs:check` → 14 specs, 0 issues; no code exists for these verbs until Phase C.

- [Reviewer] The cited ownership defects are fixed: B005 claim writes only the registry (B005:231-242), mail has no --from and derives the sender from the orchestrator binding (B005:350-363), gate run is orchestrator-only (B005:308-310), B004 writer table no longer assigns status to lock (B004:771), and B004/B005 both use .agents/@montflow/.runtime/claims.json (B004:752-753, B005:240-242). C002/C003/C005 carry the same rule. Resolved for this finding; the new generator problem is F16.

### F6 — No Phase C task owns running `migrate --all` on the store

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:800-807`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:342-345,756-769`, `.agents/@montflow/specs/montflow-spec-standard/C/C001-implement-version-and-structure/TASK.md:24-35`, `.agents/@montflow/specs/montflow-spec-standard/C/C005-implement-mechanical-state-verbs/TASK.md:23-37`, `.agents/@montflow/specs/montflow-spec-standard/C/C007-align-docs-and-artifact-ledger/TASK.md`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B004 says every `status: in-progress` spec "is upgraded in the v2 wave by `mf-specs migrate --all`" (`B004:802-806`), and B005's handoff to C005 repeats that "the v2 wave upgrades this spec and every other in-progress spec" (`B005:997-999`). No Phase C task requirement or completion runs it. C001 only builds the `upgrade` plan and its completion accepts "version warnings only" (`C001:29-35`); C005's completion runs `migrate` on a fixture and never on the store (`C005:34-37`); C007 only records each spec as frozen or upgraded. At the end of Phase C, `montflow-spec-standard` and `montflow-references-tui` can still be v1 with no `PHASE.md`, and every completion can pass.
- Impact: the v2 contract ships but the store it is meant to standardize stays v1. C008's "every command reads the v2 tree" is exercised against a v1 tree, C007's ledger records nothing because no upgrade ran, and the Phase B review's own spec is left on the old contract.
- Suggestion: add `migrate --all` (with the frozen/`--include-complete` decision) to C005's requirement and completion, or create a dedicated migration task; make C001's completion require this spec and `montflow-references-tui` to be v2; make C007's ledger the output of that run rather than a separate prose check.

#### Discussion

- [Fixer] **What changed:** the live-store v2 wave is assigned to C005. `C005/TASK.md` now requires running `mf-specs migrate --all` over `.agents/@montflow/specs` and recording the per-spec result for C007, plus a `--include-complete` fixture. `C001/TASK.md` now builds and fixture-proves `migrate` only, and `C007/TASK.md` verifies every spec reads `spec-version: 2` (or is listed as frozen) from C005's run. `B005/MEMORY.md` and `B004/MEMORY.md` handoffs match.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] C005 now requires the live-store mf-specs migrate --all and its per-spec result (C005/TASK.md:29,37); C001 explicitly leaves the live wave to C005 (C001:29,35); C007 verifies every spec reads spec-version: 2 or is frozen from C005 output (C007:26,32); B004:836-845 and B005:778-779 agree.

### F7 — C004 cannot satisfy its own completion before C006, and it names a non-existent `mf-sessions` binary

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/C/C004-implement-doctor-payload-manifest/TASK.md:25-36`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:561-567,628-638,703-709`, `.agents/@montflow/specs/montflow-spec-standard/C/C006-ship-spec-artifact-payloads/TASK.md:7,26-34`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: C004's completion says "A clean workspace gains every payload kind from one repair command" (`C004:35`), but the `tier` kind's three files and manifest entries are C006's (`B005:564-567`), and C006 `depends-on: C004` (`C006:7`). C004 can only pass by shipping placeholder/fixture tier entries, which B005 explicitly says not to do (`B005:703-709`), or by weakening the completion. Separately, C004's requirement says the shared generator is wired so "a compiled `mf-specs` or `mf-sessions` keeps a working doctor" (`C004:27`), but B005 F7 states `pi-sessions` has no package at HEAD and no `mf-sessions` reference exists (`B005:628-629,638`). There is no `mf-sessions` binary to test.
- Impact: C004 and C006 form a completion deadlock. A C004 worker must either invent a tier payload the decision assigns to C006 or mark a false completion; a C004 worker following the task literally may create a sessions package to satisfy a nonexistent target.
- Suggestion: close B005 Open Question 7 with one sequence (e.g. C004 completion = "every kind C004 ships; tier kind fixture-tested", C006 owns the real tier payload) and move the "every payload kind" item to C006. Replace `mf-sessions` in C004 with "the compiled binary of every package with a manifest" or add a sessions task if a binary is intended. Add a C006/C004 dependency note.

#### Discussion

- [Fixer] **What changed:** `C004/TASK.md` names only the kinds C004 ships (`skill`, `profile`, `prompt`) plus a fixture-tested `tier` kind; the three real tier files move to C006's completion. The `mf-sessions` clause is replaced with "the compiled binary of every package with a manifest" and an explicit "no `mf-sessions` package exists; do not invent one". `B005/MEMORY.md` C004 handoff and Open Question 7 record the same sequence.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] C004 now covers only skill/profile/prompt plus a fixture-tested tier kind and defers the three real tier files to C006 (C004:29,36-37), removes mf-sessions (C004:27,37), and B005 Open Question 7 is marked resolved (B005:762-767). No completion deadlock remains.

### F8 — C006 ships five profiles while B005 decides six

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/C/C006-ship-spec-artifact-payloads/TASK.md:19-26`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:568-576,771-782`, `packages/specs/prompts/spec-sizing.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B005 decides "ship the five plus `spec-sizing-orchestrator`" (`B005:568-576`), because the shipped `spec-sizing` prompt names that profile (`spec-sizing.json:4`), and B005's handoff to C006 says "Rewrite the six profile copies C004 seeded" (`B005:773-774`). C006's description and requirement say "the five spec-role profiles" and list exactly five (`C006:19-26`), so a C006 worker following its own task ships five and leaves `spec-sizing-orchestrator` uninstalled on a fresh clone.
- Impact: the shipped `spec-sizing` prompt names a profile that is not in the payload; a fresh clone has a dangling profile reference. B005's A002 #9 owner row ("C004 doctor + C006 six profile files") is not satisfied.
- Suggestion: update C006 to six and add `spec-sizing-orchestrator` to the manifest/seed list, or take B005's alternative (five only) and rewrite `spec-sizing` to stop naming it. Make the C006 completion assert the exact profile count.

#### Discussion

- [Fixer] **What changed:** `C006/TASK.md` now requires **six** profiles — the five spec roles plus `spec-sizing-orchestrator` — in the description, requirement, and completion ("exactly six ... installed"). `B005/MEMORY.md` already decided six; the C006 handoff still says six and now also names the `grilling` tier key.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] C006 now names six profiles including spec-sizing-orchestrator in the description, requirement, and completion (C006:19,26,35), matching B005:630-636 and spec-sizing.json:4.

### F9 — Unclassified `GATES.md` stages are both legacy-valid and a phase-gate error

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:177-185,411-418,603-606`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B004 F1 says every stage in a phase `GATES.md` must be classified with exactly the declared kind, and a stage with no kind is `phase.gate-mismatch` (`B004:182-185`). B004 F5 says an unclassified heading is a "legacy stage" that "produces no new finding" and is why old `GATES.md` files verify unchanged (`B004:411-415`). B004 F7 says `migrate` refuses a phase gate with an unclassified stage (`B004:603-606`). A phase gate containing `## Stage 1: …` gets three different answers: error (F1), no finding (F5), and migration refusal (F7).
- Impact: C001/C002/C005 must choose which rule wins. If they apply F5 to phase gates, migration accepts a phase gate that F1 says is an error; if they apply F1, old task gates still work but the legacy exemption sentence is misleading.
- Suggestion: state that the F5 legacy exemption applies only to task `GATES.md`; phase gates require a kind, with one code shared by check and migrate. Add a phase-gate fixture with an unclassified stage.

#### Discussion

- [Fixer] **What changed:** one answer in `B004/MEMORY.md`: the legacy unclassified-stage exemption applies only to a **task** `GATES.md`; a phase `GATES.md` requires a kind and an unclassified phase stage is `phase.gate-mismatch`, the same code `check` reports and `migrate` refuses on. F1, F5, and F7 now say the same thing.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] B004 F1/F5/F7 now give one answer: the legacy unclassified exemption is task-only (B004:423-429), a phase-gate stage with no kind is phase.gate-mismatch, and migrate refuses on the same code (B004:184-189,617-620).

### F10 — `gate run --all` is documented but absent from the signature, and default failure behavior is undefined

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:256-270`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: the usage block lists `--task`, `--stage`, `--timeout`, and `--dir` but no `--all` (`B005:256-258`). The execution paragraph then says "`--all` continues after a failure and records every stage" (`:270`). The default when no `--stage` is given is "every mechanical stage in ascending order" (`:261-262`), but it does not say whether that default stops at the first failure. C002 can implement a flag the documented signature rejects, or a default that drops later stages.
- Impact: C002's tests and the gate-result file are underspecified; `--all` may be rejected by the CLI parser while the docs promise it.
- Suggestion: add `[--all]` to the usage and define the default explicitly (stop at first failure vs continue). Add a test for the default and for `--all`.

#### Discussion

- [Fixer] **What changed:** `B005/MEMORY.md` `gate run` usage now includes `[--stage <n> | --all]`; `--all` continues after a failure and records every stage, the no-flag default runs every mechanical stage in order and stops at the first failure, and `--stage` with `--all` is `gate.argument-conflict`. `C002/TASK.md` requires and tests both the default and `--all`.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] B005 gate run usage now includes [--stage <n> | --all], defines --all continue and default stop-at-first-failure, and rejects --stage with --all as gate.argument-conflict (B005:297-307); C002 requires both (C002:25).

### F11 — C005's completion does not cover four of the verbs it must ship

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/C/C005-implement-mechanical-state-verbs/TASK.md:25-37`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:758-759`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B005 hands C005 `init`, `new-phase`, `new-task`, `stamp`, `claim`, `lock`, `waiver`, `tier`, and `migrate --include-complete` (`B005:758-759`). C005's requirements list `new-phase`, `new-task`, `stamp`, `init`, `claim`, and `lock`, but its completion exercises only `init`, `next`, `claim`, `lock`, `state`, and a migrate fixture (`C005:34-37`). `waiver` (the only generator for B003's `micro` lock) and `tier` (the only tier read path) are never required to be run; `migrate --include-complete` is not mentioned at all.
- Impact: a C005 run can be marked complete with the waiver and tier generators only written, not exercised. The `micro` lock path and the tier payload read path are then unproven until Phase C's review or later.
- Suggestion: add actual-run completion items for `new-phase`, `new-task`, `stamp`, `waiver`, `tier`, and `migrate --include-complete`; record output in MEMORY as the other items do.

#### Discussion

- [Fixer] **What changed:** `C005/TASK.md` completion now exercises `new-phase`, `new-task`, `stamp`, `waiver`, `tier`, `migrate --include-complete`, and the live `migrate --all` run, each by an actual run with output recorded in MEMORY. The requirements also cover the tier-contract failures and the claim authority rule.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] C005 completion now requires actual runs of new-phase, new-task, stamp, waiver, tier, migrate --include-complete, and the live migrate --all (C005:34-38), matching B005:758-759.

### F12 — B003's `grilling` tier row is not in `TierContract` or the drift test

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B003-decide-complexity-tiers/MEMORY.md:69-82,183,409-418`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B003 calls `TierContract` the single source of truth (`B003:69-84`) and requires `grilling` forbidden/not-loaded/required per tier (`B003:183`), but the interface has no `grilling` field and F7's drift legs compare only phase/task/exploration/gate/review/waiver/interaction/artifacts and the skill table columns `Tier, Phases, Exploration, Tasks, Review, Questions` (`B003:409-418`). The `grilling` requirement can drift from the code/files/skill without a red test.
- Impact: C006 can omit `grilling` from the full tier file or change the rule; the drift test still passes, and the "one source of truth" claim is false for one row of the tier contract.
- Suggestion: add `grilling: 'forbidden' | 'not-loaded' | 'required'` to `TierContract`, the tier frontmatter/files, and one drift assertion; or delete the row and state that the skill choice is prompt-level prose, not part of the contract.

#### Discussion

- [Fixer] **What changed:** `B003/MEMORY.md` adds `readonly grilling: 'forbidden' | 'not-loaded' | 'required'` to `TierContract`, adds `grilling` to the tier-file frontmatter shape, and adds it to the F7 drift test's enum↔file contract leg with a drift message. The B099 handoff now names it.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] grilling is now a TierContract field (B003:80), appears in the tier frontmatter shape (B003:381), and is compared by the enum-to-file drift leg (B003:444); the skill/tier table remains at B003:198.

### F13 — B099/C099 completion names a flat `B.md`/`C.md`, not the review series the verifier reads

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B099-review-phase/TASK.md:33`, `.agents/@montflow/specs/montflow-spec-standard/C/C099-review-phase/TASK.md:32`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B099 says the review is written to `.agents/@montflow/reviews/montflow-spec-standard/B.md`, and C099 says the same for `C.md`. The review skill writes a series round at `<series>/<NNN>/REVIEW.md` with `- Phase: <id>` in `## Metadata`, which is what `review-link` reads for `passedPhases`; a flat `B.md` has no series/round and is invisible to the phase lock. The orchestrator dispatch for this review already uses the series form.
- Impact: following B099's completion literally creates an artifact that cannot close Phase B or lock the phase; the review exists but the verifier sees no passing round. The same defect repeats in Phase C.
- Suggestion: change both completion items to the series round plus ledger (e.g. `.agents/@montflow/reviews/montflow-spec-standard/001/REVIEW.md` with `- Phase: B` and the ledger update), or make `review-link` accept and parse a flat `B.md` as a round (not recommended).

#### Discussion

- [Fixer] **What changed:** `B099/TASK.md` and `C099/TASK.md` completion now name a series round at `.agents/@montflow/reviews/montflow-spec-standard/<NNN>/REVIEW.md` with `- Phase: B` / `- Phase: C` in `## Metadata` plus the ledger update, not a flat `B.md`/`C.md`.
**Verification:** this round itself was written in that shape and the reviewer's verifier reads it.

- [Reviewer] B099 and C099 completion now name a series round under .agents/@montflow/reviews/montflow-spec-standard/<NNN>/REVIEW.md with - Phase: and the ledger (B099:33, C099:32), not a flat B.md/C.md.

### F14 — B001 left the reserved `099` review-task generator in `scaffold` despite its delete requirement

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B001-reconcile-main-and-phase-rail/TASK.md:41-46`, `.agents/@montflow/specs/montflow-spec-standard/B/B001-reconcile-main-and-phase-rail/MEMORY.md:215-217`, `packages/specs/src/modules/scaffold/scaffold.module.ts:76,267-290`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:857-863`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B001's requirement says "Remove … the reserved `<PHASE>099-review-phase` task and its structure check" (`B001/TASK.md:41-43`), but `scaffold.module.ts` still has `REVIEW_NUMBER = 99`, `reviewId`, the unconditional row, and the review directory (`:76,267-290`). B001's own MEMORY admits the scaffold still appends it and defers the decision (`B001/MEMORY.md:215-217`); B004 F11 records the remnant and assigns its deletion to C001 (`B004:857-863`). B001's completion item 2 is worded narrowly ("no live code … requires") so it passes even though the generator remains.
- Impact: `mf-specs create` still emits a reserved review task, so B004's "a review task is requested only when the tier requires it" is false until C001. B001 is `complete` against a completion checklist that does not cover its own delete requirement.
- Suggestion: either reopen B001 to delete the reservation, or change B001's completion item 2 to name the deferral and make C001's completion explicitly require `REVIEW_NUMBER`, the auto-append, and `reviewId` to be gone, with a `create` test that no `*099` task appears.

#### Discussion

- [Fixer] **What changed:** deleted the reserved-review remnant from `packages/specs/src/modules/scaffold/scaffold.module.ts`: no `REVIEW_NUMBER`, no `reviewId`, no unconditional append. `review` is now an explicit `SCAFFOLD_TASK_TYPES` entry, `--reviewer-profiles` applies to a requested review task (and is refused without one), and `create` defaults emit no review task. Tests updated in `scaffold/tests/scaffold.test.ts` and `cli/tests/create.test.ts` (including "emits no reserved review task unless one is requested"). `B001/MEMORY.md` and `B004/MEMORY.md` F11 now record the deletion; the create skill, prompt, README, and CONTEXT are updated and the installed copies repaired (`mf-specs doctor`).
**Verification:** `bun run --cwd packages/specs test -- --run` → 1393 passed; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] scaffold.module.ts no longer contains REVIEW_NUMBER or reviewId; a review task is emitted only for an explicit type: review task (scaffold.module.ts:9-19,228-240). Tests include renders a valid single-task tree without a reserved review task and emits no reserved review task unless one is requested (scaffold.test.ts:13-31, create.test.ts:31-42), and create refuses --reviewer-profiles without a review task (cli.create.module.ts:353-360).

### F15 — The interaction budgets are self-reported; no transcript artifact exists for the review to compare

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B003-decide-complexity-tiers/MEMORY.md:226-255`, `.agents/@montflow/specs/montflow-spec-standard/B/B099-review-phase/TASK.md:28`
- Status: Resolved
- Attempts: 2
- First Seen: 001
- Problem: B003 defines 0/2/8 and says the phase review "compares `<n>` to the transcript" (`B003:250-253`). No transcript or question receipt is written to the spec; the only record is the author's final line, which the same agent writes. The review is isolated from the creation conversation (by design), so it cannot compare `<n>` to anything. `micro`'s zero is a hard instruction, but `standard`/`full` budgets are only self-reported and B003 admits the cap is "instruction + review enforced, not harness enforced".
- Impact: B099's requirement to "confirm the interaction budgets actually bound questions" cannot be satisfied with evidence; the budget is a style rule, not a checked bound. A run can report `questions 0/2` after asking five questions and no artifact contradicts it.
- Suggestion: require the creation run to record `tier`, `questions <n>/<budget>`, and any unresolved decisions in a spec artifact (phase `MEMORY.md` or an `init` receipt) so the review can verify it; or restate the budget as advisory and drop the transcript-comparison claim.

#### Discussion

- [Fixer] **What changed:** `B003/MEMORY.md` replaces "no tier field" with a `## Creation` section in `SPEC.md` carrying `tier: <value>`, `questions <n>/<budget>`, and unresolved decisions, written by `init` and updated by the creation orchestrator. The transcript-comparison claim is gone: the phase review reads `## Creation`. `B005/MEMORY.md` `init` writes the section, `C006` requires the prompt to read/complete it, and `B099/TASK.md` verifies the count against the budget.
**Verification:** record-only change; `bun run mf-specs:check` → 14 specs, 0 issues.

- [Reviewer] The ## Creation section is now written by init and read by B099 (B003:163-182, B005:101-104, B099:28), so the no-transcript half is addressed. The count is still written by the same creation run (B003:179-180: the creation orchestrator updates the count), so a run can still declare questions 0/2 after asking more; the record does not independently bound the calls, and no harness counter or transcript is defined. Keep Open unless the budget is explicitly declared advisory or the count is generated.

- [Fixer] **What changed:** `B003/MEMORY.md` F2/F4/F7 now state the budget is **advisory**: `## Creation` records the creation run's self-reported `questions n/<budget>`, no harness counter exists, and the phase review may flag a mismatch when a transcript exists but cannot mechanically verify it. The claim that the budget independently bounds `ask_user` beyond instruction + review is removed. `B005/MEMORY.md` `init` says the count is self-reported/advisory, and `B099/TASK.md` no longer asks the review to confirm a bound; it asks for the advisory record and a best-effort mismatch flag.
**Why it addresses the problem:** the record no longer claims an evidence source that does not exist. The number is explicitly a self-report, so "questions 0/2 after five questions" is a record contradiction the review can call out when it has a transcript, not a mechanically unverifiable bound.
**Verification:** `bun run mf-specs:check` → 14 specs, 0 issues; `bun run --cwd packages/specs test -- --run` → 1393 passed.

- [Reviewer] Verified the budget is now advisory, not a claimed bound: B003:294-301 says the count is self-reported and the budget is advisory beyond instruction and review; B005:114-117 and B099:28 say the same, with no harness counter. The remaining self-report is disclosed, not presented as evidence. Resolved.

### F16 — `claim` no longer writes status, so verifier-checked status transitions have no generator

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/SPEC.md:127`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:63-69,771-780`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:231-276`, `.agents/@montflow/specs/montflow-spec-standard/C/C005-implement-mechanical-state-verbs/TASK.md:27`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: the F5 fix resolved the worker-writes-status problem by removing the write. `claim` now touches only the registry and prints the status edits the orchestrator must apply (`B005:231-242,255-261`); the execution orchestrator hand-edits `TASK.md`, the `SPEC.md` row, and the `PHASE.md` mirror (`B004:771-780`). SPEC requirement 127 says status transitions come from CLI verbs and names `claim`, and the same requirement says "anything a verifier checks has a generator" (`SPEC.md:127`). The new B004 F0 wording calls the orchestrator a "designated writer" (`B004:63-69`), but a hand edit is not a generator. The old `claim` at least wrote the three status fields atomically; the new one does not.
- Impact: a verifier-checked status transition is hand-typed, and a partial or failed edit can leave `TASK.md`, the `SPEC.md` row, and the `PHASE.md` mirror inconsistent — the exact bookkeeping contradiction B001/B002 were meant to remove. The single-writer rule is now preserved only by prose, not by the atomic verb.
- Suggestion: make `claim --close` (and the start/block/release forms) the atomic status generator again, but require the caller to hold the spec's orchestrator binding; a worker may only bind/release its own task. That satisfies both the authority rule and SPEC 127. Update B004 F9, B005 `claim`, and C005 together.

#### Discussion

- [Fixer] **What changed:** `B004/MEMORY.md` F0/F8/F9 now make `claim` the atomic status generator: under the orchestrator binding, `--start`/`--block`/`--close` (and an orchestrator `--release` that resets a task) write the task `status:`, the matching `SPEC.md` row, and the `PHASE.md` mirror in one transaction; the F9 writer table rows point at `claim`, and the hand-edit wording and "claim writes only the registry" text are gone. `B005/MEMORY.md` F0 table, the `claim` section, `lock`, and the C005/C006 handoffs are aligned: temp-file staging then rename in `TASK.md` → `SPEC.md` → `PHASE.md` → registry order, with an explicit rollback of already-renamed files and the registry entry on any failure; a worker may only bind/release its own session and never transitions status; the registry stays `.agents/@montflow/.runtime/claims.json`. `C005/TASK.md` requirement and completion now require the atomic status writes, rollback test, and worker denial.
**Why it addresses the problem:** SPEC 127's "anything a verifier checks has a generator" is satisfied by the verb that already validates the transition, while B004's single-writer rule is preserved by restricting the mutating forms to the orchestrator binding; no status record is hand-edited and no partial three-file write can survive.
**Verification:** `bun run --cwd packages/specs test -- --run` → 1393 passed; `bun run mf-specs:check` → 14 specs, 0 issues; `bun run ts:check`, `bun run lint:check`, `bun run fmt:check` → exit 0. No `claim` implementation exists yet (C005); this is a decision/contract fix, not code.

- [Reviewer] Verified the atomic generator contract: B004:63-70 and B004:757-767,782-791 make claim under the orchestrator binding the writer of TASK status, the SPEC row, and the PHASE mirror, with no hand edit; B005:55-68,247-313 gives the temp-then-rename order and rollback; C005:27,36,39 requires atomic start/close, rollback, and worker denial. No residual hand-edit instruction remains. Resolved for this finding; the blocked-release hole is F20.

### F17 — B003 says `micro` waivers use the `records-only` check, while B004/B005 exempt `micro` and the default micro tree would never lock

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B003-decide-complexity-tiers/MEMORY.md:194,231-239`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:332-337`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:136-138,201-209,376-381`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B003's detailed rule says `micro`'s waiver is `permitted` "with the same check" — the `records-only` predicate that forbids `execution`/`defect`/`interruptor` tasks (`B003:231-235`). B003's own table says micro is `permitted` without that predicate (`B003:194`); B004 says micro's waiver is "permitted subject only to conditions 1–5" (`B004:332-337`); B005 applies the code-task predicate only to `standard` (`B005:136-138,208-209,380-381`). If the B003 detailed rule wins, the default micro tree (`init` writes `A:implement:execution`, review waived; `B005:115-123`) can never have an effective waiver and therefore never locks. If B004/B005 win, B003's sentence is false.
- Impact: the lowest tier either cannot lock or has a contradictory contract. C005 must choose one, and one of B003/B004/B005 will describe the wrong behavior. This contradiction was introduced by the F3/F4 fix.
- Suggestion: decide one rule. If micro remains default-waived with execution tasks (the current artifact matrix), exempt micro from the records-only predicate in B003:235 and state that in B004/B005; if micro must be records-only, change the micro default to planning-only and add the predicate failure to `init`, `waiver`, and `new-task`. Add a test for the chosen case.

#### Discussion

- [Fixer] **What changed:** one rule across the records: `micro`'s waiver is exempt from the `records-only` predicate. `B003/MEMORY.md` F3 deletes "with the same check", says the appraiser may waive any `micro` phase by default and may upgrade an auth/data phase to `required`, and records the default `micro` tree (one execution task, review waived) derives a lock; the table already said `permitted`. `B004/MEMORY.md` F3 states the exemption and the default-micro lock. `B005/MEMORY.md` `init` (`init.waiver-policy` + defaults), `waiver`, and `new-task` (`task.waiver-policy`) now say only `standard` applies the predicate and `micro` is exempt. `C005/TASK.md` completion requires a `micro`-locks test.
**Why it addresses the problem:** the B003 detailed sentence no longer contradicts B004/B005; the lowest tier can waive its default execution task and therefore lock, and the rule is concrete enough for C005 to test.
**Verification:** `bun run mf-specs:check` → 14 specs, 0 issues; `bun run --cwd packages/specs test -- --run` → 1393 passed.

- [Reviewer] Verified micro is exempt everywhere: B003:196,244-256 (table and detail), B004:335-344, B005:126-129,145-149,228-230,417-420, C005:26,36,40. The default micro execution task can waive and lock, and C005 requires the micro-lock test. Resolved.

### F18 — `new-task --type review` can create a review task on a waived phase

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:201-209`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:338-339`, `.agents/@montflow/specs/montflow-spec-standard/C/C005-implement-mechanical-state-verbs/TASK.md:27,38`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: B004 makes `review: waived` plus a review task an error (`phase.waiver-with-review-task`). B005 `new-task` refuses `--type review` only when the phase already holds one (`task.review-exists`); its failure list has no "phase is waived" guard (`B005:201-209`). A `new-task --type review` on a waived phase therefore creates a record that `check` immediately rejects.
- Impact: the generator can produce an invalid v2 tree, and the author must undo a task that the one-decision rule says must never exist.
- Suggestion: add `task.review-waived` to `new-task`'s failure list (and C005's tests), and keep `init`/`new-phase` on the same rule.

#### Discussion

- [Fixer] **What changed:** `B005/MEMORY.md` `new-task` failure list gains `task.review-waived`: `--type review` on a phase whose `PHASE.md` says `review: waived` is refused, matching B004's `phase.waiver-with-review-task`; the `init` validation adds the same code for a generated review task on a waived phase. `C005/TASK.md` requirement names it and the completion/tests require the refusal.
**Why it addresses the problem:** the generator can no longer create a review task that `check` immediately rejects; `new-task` and `init` enforce the one-decision rule instead of leaving the invalid tree to the verifier.
**Verification:** `bun run mf-specs:check` → 14 specs, 0 issues; `bun run --cwd packages/specs test -- --run` → 1393 passed. No `new-task` implementation exists yet (C005); the contract is the deliverable.

- [Reviewer] Verified the guard: B005:223-226 adds task.review-waived to new-task, B005:153-155 adds it to init, B004:345-346 keeps the verifier error, and C005:26,40 names the guard and test. Resolved.

### F19 — C006's prompt task is stale against the F15/F16 decisions

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/C/C006-ship-spec-artifact-payloads/TASK.md:27`, `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:287-297,897`, `.agents/@montflow/specs/montflow-spec-standard/B/B003-decide-complexity-tiers/MEMORY.md:294-301`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: C006's prompt-rewrite requirement still says "the orchestrator-only authority for `claim --close`/`gate run`/`mail`" (`C006:27`). B005 now restricts `claim --start`, `--block`, `--close`, an orchestrator `--release`, `gate run`, and `mail` to the orchestrator binding (`B005:287-297`), and its C006 handoff names all three claim forms (`B005:897`). C006 also lists the `## Creation` section as `(tier, questions n/budget)` without the advisory/self-reported qualifier that B003 and B099 now require (`B003:294-301`, `B099:28`). A C006 worker following its task can therefore write a prompt that teaches only close as restricted and presents the question count as a bound.
- Impact: the shipped creation/execution prompts would be stale on the exact authority rule F16 introduced, and would misstate the F15 advisory record. The CLI would refuse a worker's `claim --start`/`--block`, but the prompt would not say so.
- Suggestion: update C006 to name `claim --start`/`--block`/`--close` (and an orchestrator `--release` that resets a task), `gate run`, and `mail` as orchestrator-only, and mark `questions n/budget` as self-reported/advisory.

#### Discussion

- [Fixer] **What changed:** `C006/TASK.md:27` now names the full orchestrator-only set — `claim --start`/`--block`/`--close`, an orchestrator `claim --release` that resets a task to `pending`, `gate run`, and `mail` — and records `## Creation` as `tier`, the creation run's self-reported/advisory `questions n/budget`, and unresolved decisions. A new completion item (`C006/TASK.md:37`) asserts both. `B005/MEMORY.md:905` (the C006 handoff) adds the `--release` reset so the decision and the task text agree. I re-read the rest of C006 against B005 F0's authority table; the remaining lines (six-profile payload, tier files, `spec-version`, verbs-only) are current, so line 27 was the only stale requirement.
**Why it addresses the problem:** a C006 worker now writes a prompt that states the same authority F16 introduced (start/block/close plus the orchestrator release reset, gate run, mail) and presents the question count as an advisory self-report, matching B003:294-301 and B099:28.
**Verification:** `bun run mf-specs:check` → 14 specs, 0 issues; `bun run --cwd packages/reviews cli verify --all --dir "$PWD"` → 2 files, 0 issues; `bun run --cwd packages/specs test -- --run` → 1393 passed.

- [Reviewer] Verified C006:27 now names claim --start/--block/--close, the orchestrator --release reset, gate run, and mail as orchestrator-only, and calls questions n/budget self-reported/advisory; C006:37 asserts the same in completion. No other C006 line contradicts B005 authority table. Resolved.

### F20 — A blocked task has no verb that returns it to `pending`

- Severity: Major
- Location: `.agents/@montflow/specs/montflow-spec-standard/B/B005-decide-tooling-contract/MEMORY.md:262-268,287-297`, `.agents/@montflow/specs/montflow-spec-standard/B/B004-decide-spec-standard-v2/MEMORY.md:812-813`, `.agents/@montflow/specs/montflow-spec-standard/C/C005-implement-mechanical-state-verbs/TASK.md:27,36`
- Status: Resolved
- Attempts: 1
- First Seen: 001
- Problem: the F16 fix changed `claim --block` to `in-progress → blocked` and `claim --release` to reset only an `in-progress` task to `pending` (`B005:265-268`). A blocked task has no binding (block removes it), `--release` does not reset it, and `--start` requires `pending`; there is no `--unblock`. The old contract had `--release` from `in-progress|blocked` to `pending`, and `--block` from `pending|in-progress`. C005's completion only tests start/close and claim authority (`C005:27,36`), so this recovery path is untested.
- Impact: once a task is blocked, the only way to resume it is a hand edit to `TASK.md`/the `SPEC.md` row/`PHASE.md` — exactly the manual status write F16 forbids — or deleting and recreating the task. The status enum includes `blocked`, so this is a reachable dead end.
- Suggestion: restore an orchestrator-only atomic `--release` (or `--unblock`) from `blocked → pending`, and decide whether `--block` may start from `pending` as it did before. Add a C005 test for block → release → start.

#### Discussion

- [Fixer] **What changed:** chose the restored-`--release` option and defined one graph. `B005/MEMORY.md:262-270` (claim forms) now states: `--start` = `pending → in-progress`; `--block --reason` = `pending | in-progress → blocked`; orchestrator `--release` = `blocked | in-progress → pending` (the only return from `blocked`); `--close` = `in-progress → complete`. A blocked task resumes with `--release` then `--start`, with no hand edit. `--block` may start from `pending` as before. The fails list (`B005/MEMORY.md:305-306`) enforces those preconditions, and the scope bullet (`B005/MEMORY.md:315-321`) repeats the complete graph. `B004/MEMORY.md:757-767` and `:815-818` match, including the blocked release reset. `C005/TASK.md:27` carries the same graph, completion `:36` requires the `pending → start → block → release → start` run, the `blocked → release → pending` return path, and the forced-write rollback test, and `:39` adds a worker `claim --block` denial.
**Why it addresses the problem:** a blocked task now has an orchestrator-only atomic return path through the same verb that already generates every other status, so the reachable `blocked` dead end no longer requires the hand edit F16 forbids; the graph is stated identically in the decision, the contract, and the C005 test.
**Verification:** `bun run --cwd packages/specs test -- --run` → 1393 passed, no type errors; `bun run mf-specs:check` → 14 specs, 0 issues; `bun run ts:check`, `bun run lint:check`, `bun run fmt:check` → exit 0; `bun run --cwd packages/reviews cli verify --all --dir "$PWD"` → 2 files, 0 issues.

## Review Questions

1. **Under-specification** No open finding. F19 resolved: C006:27,37 names all restricted claim forms and marks questions n/budget self-reported/advisory. F20 resolved: the claim graph is complete across B004/B005/C005 and C005 requires the blocked release path and rollback.
2. **Contradictions** None open. F16/F17 are resolved; F19 is resolved; F20's graph is single-sourced in B004/B005/C005.
3. **A002 capability gap** No open gap; C004/C006 own the payload matrix and the six profiles.
4. **Interaction budgets** Resolved as advisory: B003:294-301, B005:114-117, B099:28.
5. **Migration/retrofit honesty** F1, F2, and F14 resolved; 16 retirement notes, F001 rows match git show --cc, counts reconcile to 686 items, and 0 complete tasks lack a size.

## Coverage

Final verification on 2026-11-03 from /home/daniel/dev/montflow/spec-standard:

- bun run --cwd packages/specs cli check --dir "$PWD" -> 14 specs · 0 failed · 0 issues, exit 0.
- bun run --cwd packages/specs test -- --run -> 100 files / 1393 tests passed, no type errors, exit 0.
- bun run mf-specs:check -> 14 specs · 0 failed · 0 issues, doctor all current, exit 0.
- bun run --cwd packages/reviews cli verify --all --dir "$PWD" -> 2 files · 0 issues.
- C006 authority/advisory wording matches B005:287-313,897 and B099:28.
- claim graph matches B004:757-764,816-818, B005:262-270, C005:27,36; C005:40 requires atomicity/rollback/authority tests.
- B002 counts reconcile: 430 retrofit ticks + 16 retired + 240 pre-existing = 686; F001 rows match git show --cc --name-only for the two prior omissions.

## Summary

- Critical: 0
- Major: 11
- Minor: 9
- Nit: 0
- Open: 0
- In Review: 0
- Resolved: 20
- Won't Fix: 0
- Escalated: 0
