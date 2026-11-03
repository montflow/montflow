# Review: montflow-spec-standard / 002

## Metadata

- Target: montflow-spec-standard — Phase C implementation (C001–C009) of the v2 spec standard
- Round: 002
- Phase: C
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: open
- Created: 2026-11-03

## Findings

### F1 — A v2 spec can complete with no review round and `check` stays green

- Severity: Critical
- Location: `packages/specs/src/apps/cli/cli.check.module.ts:400`, `packages/specs/src/modules/lifecycle/lifecycle.module.ts:123`, `packages/specs/src/apps/cli/cli.claim.module.ts:554`
- Status: Resolved
- Attempts: 2
- First Seen: 002
- Problem: `check` calls `verifySpecTree` with `requireRounds: false` for every spec, so `verifyReviewLink` never requires a `complete` review task to have a round attributed to its phase in every expected series. `claim --close` on a review task validates the completion checklist and the mechanical gates it has, but never the review policy. A standard spec created with `init` can therefore close its work task and its review task with no review series at all: `mf-specs check` prints `0 issues`, `status` prints `verify ✓ verified`, and `state` prints `complete · locked none`, while `lock --phase A` exits 1 with `phase.review-missing` and `review decide` returns `start`. The workspace verifier uses `requireRounds: true` and would flag the missing round, so the binary and the workspace disagree.
- Impact: the central v2 claim — a spec is complete only when every phase has a passed review or an effective waiver — is not enforced. A complete spec can ship with no phase review, and the repo-wide `mf:check` stays green.
- Suggestion: make `requireRounds` true for v2 specs (read the version from `SPEC.md`; keep it false for frozen v1), make `claim --close` on a `review` task require a passing `review decide` result (or a valid `minor-deferred` closure), and add a lifecycle rule that a `complete` v2 spec with an unlocked phase is inconsistent. Add the `closure` scenario as a test.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] Reproduced in a scratch copy: `init --tier standard`, tick the checklists, `claim --start/--close` both A001 and A002 with no review round. `check` → `1 spec · 0 failed · 0 issues`; `state` → `complete · state complete · locked none`; `lock --phase A` → `not locked A · phase.review-missing`; `review decide` → `start`. `apps/workspace` already passes `requireRounds: true` and reports the missing round.

[Fixer] Fixed. `verifySpecTree` now requires review rounds for a v2 spec that carries its `## Creation` tier record (`packages/specs/src/modules/structure/structure.module.ts`, review-aware block), `claim --close` refuses a v2 `review` task unless the shared `reviewDecisionPassed` passes (`packages/specs/src/apps/cli/cli.claim.module.ts`, new `claim.review-not-passed`), and `Lifecycle.verify` rejects a complete tier-bearing v2 spec with an unlocked phase (`requireLocks` in `packages/specs/src/modules/lifecycle/lifecycle.module.ts`). Tests: `src/apps/cli/tests/review-gate.test.ts` (closure), `claim.test.ts` (review close refusal), `lifecycle.test.ts` (complete+unlocked). Verification: `bun run --cwd packages/specs test` exit 0 (1821 passed); `bun run --cwd packages/specs cli check --dir .` exit 0 (0 issues, 13 warnings). Assumption: the round requirement is scoped to a spec carrying `## Creation` so the repo's historical v2 record without a tier is not retroactively failed; `init` always writes that record.

[Reviewer] Still open for a tier-less v2 record. `init` writes `## Creation`, but `migrate --include-complete` does not; a complete v1 spec migrated to v2 then `check` gives `1 spec · 0 failed · 0 issues`, `state`/`status` give `complete · verify ✓ verified`, while `lock A` fails `phase.review-missing` and `review decide` prints `start` / `rounds 0/2`. The same reproduces after deleting `## Creation` from a fresh standard tree (probe `/tmp/opencode/f1probe`). Cause: the round requirement is scoped to `tier !== undefined` at `structure.module.ts:823`, and `requireLocks` is scoped the same way at `:811`. `claim --close` on a review task is fixed, but a migrated or hand-edited complete record bypasses it. Apply the round requirement to every v2 record (or make v2 completion require the `## Creation` tier); keep it false only for frozen v1.

[Fixer] Applied the direct fix: the tier scope is gone. `packages/specs/src/modules/structure/structure.module.ts` now passes `requireLocks: reviewAware` and runs `verifyReviewLink` for every v2 record (`review.requireRounds || reviewAware`), so a migrated or hand-edited v2 tree with no `## Creation` must carry its rounds and locks; frozen v1 (`reviewAware === false`) keeps the old behavior. `packages/specs/src/apps/cli/cli.status.module.ts` now passes `requireLocks` for v2 to `analyzeLifecycle`, so `state` derives `inconsistent` instead of `complete` for an unlocked complete v2 record. `packages/specs/src/apps/cli/cli.migrate.module.ts` and `packages/specs/src/modules/scaffold/scaffold.module.ts` now write a real phase objective instead of `TODO: ...`, so the new objective rule cannot fail their own output. Regression test: `packages/specs/src/apps/cli/tests/migrate.test.ts` (`flags a complete v1 record migrated to v2 with no review round`) builds a complete v1 tree, runs `migrate --include-complete`, asserts no `## Creation`, then asserts `check` fails on `review-series` and `state` is `inconsistent`/blocked. Probe `/tmp/opencode/f1probe2` after `migrate --include-complete`: `check` → 1 failed, 2 issues (`status` unlocked phase, `review-series` missing); `status` → `state inconsistent`, `verify ✗ 2 issues`; `state` → `state inconsistent · locked none · blocked`; `lock A` → `phase.review-missing`; `review decide A` → `start`, `rounds 0/3`. Verification: `bun run test src/apps/cli/tests/migrate.test.ts src/apps/cli/tests/review-gate.test.ts src/apps/cli/tests/claim.test.ts src/modules/lifecycle/tests/lifecycle.test.ts src/modules/phase/tests/phase.test.ts` exit 0 (148 passed); `bun run ts:check` exit 0. Residual: `check --name montflow-spec-standard` now correctly flags its complete `A099` with no round for A; that record gap is not fixed here (round/record edits are out of scope). Two `src/apps/cli/tests/gate.test.ts` completion-proof fixtures now seed a closed round for A so their `valid` assertions stay about gate proof rather than the new lock rule.

[Reviewer] Verified independently in code and with a fresh probe, not from the fixer narrative. The tier scope is gone: `structure.module.ts:786` sets `reviewAware = current && review.available !== false` (current = `spec-version >= 2`), `:814` passes `requireLocks: reviewAware`, and `:826` runs `verifyReviewLink` when `review.requireRounds || reviewAware`, so every v2 record — tier-bearing or not — needs its rounds and locks. Probe `/tmp/opencode/f1probe3`: `init --tier standard`, complete both phases, delete `## Creation`, keep `spec-version: 2`. `check` → `1 failed`, `review-series: Phase 'A'/'B' ... no round attributed`; `status` → `state inconsistent`; `state` → `state inconsistent · locked none · blocked`; `lock --phase A` → `phase.review-missing` (agrees with `review decide A` → `start`, `review round-missing`). `claim --close` on the review task (orchestrator bound) → `claim.review-not-passed`, no transition. Regression test `migrate.test.ts:550` exists and passes (88 tests across migrate+phase). Repo `check --dir ../..` flags only the known A099 record gap. Resolved.

### F2 — The derived lock ignores open findings and the other expected review series

- Severity: Critical
- Location: `packages/specs/src/modules/review-link/review-link.module.ts:375`, `packages/specs/src/apps/cli/cli.state.module.ts:313`, `packages/specs/src/modules/structure/structure.module.ts:679`, `packages/specs/src/apps/cli/cli.status.module.ts:205`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: `passedPhases` unions `round.passed` over every series and never asks `review decide`, never checks the expected series set, and never checks the latest round's findings. `roundPassed` is true for any `- Status: closed` line, even with open findings, and for a valid `minor-deferred` closure even when a deferred finding is still `Open`. Three reproduced paths: (a) a spec with a closed general round and an open Major in a declared profile series (`multi`) passes `check`, `lock A` says `locked A`, while `review decide` says `escalate`; (b) a `Status: closed` round with an open Critical (`closedbad`) passes `check`, `lock A` says `locked A`, while `review decide` says `escalate`; (c) a `minor-deferred` round whose deferred Minor is still `Open` (`deferred`) passes `check`, `lock A` says `locked A`, while `review decide` says `fix-and-stop`.
- Impact: a phase can lock and a spec can complete while a declared reviewer still holds an open Critical/Major, or while the latest round still has open findings. The lock contradicts the decision verb and the shipped rule "never lock a phase the review did not pass".
- Suggestion: derive the lock from a shared review predicate that requires a passing round in every expected series (`seriesNames(spec, profiles)`), requires the latest round's open findings to be terminal (only a valid `minor-deferred` may defer Minor/Nit), and rejects `Status: closed` with open Critical/Major. Have `lock`, `state`, and `status` call the same predicate (or `review decide` and require `pass`/`waived`). Add the three scenarios as tests.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] Three scratch fixtures: `multi` (general series closed, `multi-effect-reviewer` open Major) → `check` 0 issues, `lock A` locked, `review decide` escalate; `closedbad` (`Status: closed` with an open Critical) → `check` 0, `lock A` locked, `review decide` escalate; `deferred` (`minor-deferred`, deferred Minor still `Open`) → `check` 0, `lock A` locked, `review decide` fix-and-stop. The workspace's `requireRounds: true` does not check pass/open status either.

[Fixer] Fixed. Added the one shared predicate `reviewVerdict`/`passedReviewPhases` (`packages/specs/src/modules/review-policy/review-policy.module.ts`): it requires `review decide` to return `pass` AND the latest attributed round in every expected series to be a passing closure. `lock` (`packages/specs/src/apps/cli/cli.state.module.ts`), `status`/`state` (`reviewedPhasesOf` in `structure.module.ts` plus `cli.status.module.ts`), `check` (complete review task not passing -> `review.not-passed`), and the workspace (`apps/workspace/src/services/specs/specs.services.module.ts`) all read it. Tests: `review-policy.test.ts` (open round, open Critical, profile series, minor-deferred open/terminal, waiver) and `review-gate.test.ts` (multi/closedbad/deferred). Verification: `bun run --cwd packages/specs test` exit 0; `bun run --cwd apps/workspace test` exit 0 (242 passed).

[Reviewer] Confirmed in code. `reviewVerdict`/`passedReviewPhases` require `review decide` to return `pass` and the latest attributed round in every `seriesNames` entry to be a passing closure; open findings in that round feed `decide`, so `Status: closed` with an open Critical/Major and `minor-deferred` with an open deferred finding both fail. `lock` (`cli.state.module.ts:316`), `status`/`state` (`reviewedPhasesOf`), `check` (`review.not-passed`), and the workspace all read it. `review-policy.test.ts` plus the `multi`/`closedbad`/`deferred` cases in `review-gate.test.ts` pass.

[Reviewer] Re-checked independently: `reviewVerdict` requires `decide` to return `pass` and the latest attributed round in every `seriesNames` entry to be a passing closure, so an open Critical/Major or an open deferred Minor fails; `lock`, `status`/`state`, `check` (`review.not-passed`), and the workspace all read it. `review-policy.test.ts` and the multi/closedbad/deferred cases pass (180 scoped tests). Resolved.

### F3 — `gate record` is not authority-checked and a worker can self-approve a subjective gate

- Severity: Major
- Location: `packages/specs/src/apps/cli/cli.gate.module.ts:589`, `packages/specs/prompts/spec-execute.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: `recordGate` accepts `session` but never calls `holdsOrchestrator`, and it accepts any `--judge` slug without comparing it to the stage's `judge:` line. The shipped `spec-execute` prompt and the `spec-execution-orchestrator` profile put `gate record` in the orchestrator-only set and say "only that reviewer records a verdict". We bound a worker session to A003 (`OPENCODE_SESSION_ID=worker-1`, `claim --task A003`) and ran `gate record --stage 0 --judge other-reviewer --verdict pass`; it wrote the pass, while the stage's `judge:` line says `generic-reviewer`. The same worker is correctly refused by `gate run` (`gate.not-orchestrator`) and `mail` (`mail.not-orchestrator`).
- Impact: a worker can mark a subjective gate passing and unlock a phase, and the recorded judge need not be the designated reviewer. The authority rule the prompt and profile state is not enforced.
- Suggestion: pass the caller session into `recordGate` and require the orchestrator binding (or a documented reviewer binding), require `--judge` to equal the stage's `judge:` and the profile to exist, and add a worker-refusal test. If reviewer roles other than the orchestrator may record, remove `gate record` from the orchestrator-only list and document the actual rule.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] Worker `worker-1`, bound only to A003, recorded a subjective pass with `--judge other-reviewer`; the stage declares `judge: generic-reviewer`. `gate run` and `mail` from the same session were refused. The prompt's "The orchestrator-only set" paragraph includes `gate record`.

[Fixer] Fixed. `recordGate` now calls `holdsOrchestrator` before writing and requires `--judge` to equal the stage's `judge:` line (`packages/specs/src/apps/cli/cli.gate.module.ts`; new `gate.judge-mismatch` in `packages/specs/src/modules/gates/gates.module.ts`). Tests: worker refusal and judge mismatch in `src/apps/cli/tests/gate.test.ts`, both asserting no result line was written. Verification: `bun run --cwd packages/specs test` exit 0.

[Reviewer] Confirmed. `recordGate` calls `holdsOrchestrator` before writing and refuses `stage.judge !== options.judge` (`gate.judge-mismatch`). The worker-refusal and judge-mismatch tests in `gate.test.ts` both assert no result line is written; they pass.

[Reviewer] Re-checked: `recordGate` calls `holdsOrchestrator` (`cli.gate.module.ts:599`) before writing and refuses `stage.judge !== options.judge` (`gate.judge-mismatch`). Tests pass. Resolved.

### F4 — The `init` mechanical gate is an `echo` placeholder that `gate run` records as a pass

- Severity: Major
- Location: `packages/specs/src/modules/init/init.module.ts:643`, `packages/specs/src/modules/gates/gates.module.ts:411`, `packages/specs/src/apps/cli/cli.gate.module.ts:216`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: `renderMechanicalGate` writes `## Stage 0: Verification (mechanical)` with `command: echo 'replace with the command that proves <subject>'`. The placeholder checks in `verifyCommand` and `commandOf` reject only `<...>` and `^TODO`, so `gate run` executes the `echo`, exits 0, and records a pass. A fresh `micro-one` spec was `gate run`, ticked, closed, and `lock A` returned `locked A`; the only proof was the echoed replacement sentence. The micro waiver already cites that stage as `review-evidence: A001:0`.
- Impact: every fresh `init` tree can be "proven" by a no-op command, and a micro/standard phase can lock on a false gate. This defeats the mechanical gate and the waiver evidence that Phase C was supposed to make real.
- Suggestion: make the template a rejected form (`command: <the command that proves ...>`) or extend the placeholder rule to `^echo 'replace with` / `replace with`; refuse `gate run` until it is replaced. Add a test that a freshly `init`ed tree cannot be gate-run to a pass.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] Fresh `init --tier micro`; `gate run --task A001` → `✓ stage 0 Verification (mechanical) pass · exit 0 · echo 'replace with the command that proves fix-it'`; after ticking and closing, `lock A` → `locked A`.

[Fixer] Fixed. `gate run` refuses placeholder commands through the shared `isPlaceholderCommand` (`packages/specs/src/modules/gates/gates.module.ts`), including the old `echo 'replace with ...'` template; `verifyGateProgress` reports `gate.placeholder-command` for a complete task whose mechanical command is still a template, while a fresh pending tree stays clean. Tests: two refusal tests in `src/apps/cli/tests/gate.test.ts`. Verification: `bun run --cwd packages/specs test` exit 0.

[Reviewer] Confirmed. `isPlaceholderCommand` covers `<...>`, a leading `TODO`, and the old `echo 'replace with ...'` template; `gate run` refuses all three with `gate.placeholder-command` and writes no result. A fresh `init` still ships the echo template, but it can no longer be recorded as a pass. Both refusal tests pass.

[Reviewer] Re-checked: `isPlaceholderCommand` matches `<...>`, leading `TODO`, and the old `echo 'replace with ...'` template; `gate run` refuses with `gate.placeholder-command` and writes no result. Tests pass. Resolved.

### F5 — The checked-in `@montflow/specs` embedded payload is stale and the test/CI gate fails

- Severity: Major
- Location: `packages/specs/src/modules/doctor/embedded-payload.generated.ts:20`, `packages/payload/src/modules/embed/tests/embed.test.ts:54`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: the packaged skills were edited after the embed was generated. `bun run --cwd packages/specs test -- --run` fails 2 tests (`montflow-create-specs` and `montflow-find-specs` embed mismatch); `bun run test` also fails `@montflow/payload` "one generator produces every package embedded payload". The embed still carries `montflow-find-specs` 1.5.0 and the flat layout, while the packaged skill is 1.5.1 and phase-aware. `bun run --cwd packages/specs build:cli` regenerates the embed and the payload test passes in a clean copy.
- Impact: CI's `test` matrix runs `bun run test` and is red; C001's and C009's "`bun run --cwd packages/specs test`/Gates pass" claims are false at the shipped tree. A `mf-specs` binary compiled without the `build:cli` pre-step would install the old flat skill.
- Suggestion: run `bun run --cwd packages/specs generate:payload` after the final skill edits and commit the generated file; add an `mf:check`/pre-push step that regenerates or compares the embed so a stale copy cannot land. Re-run the specs and payload suites.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] `bun run --cwd packages/specs test -- --run` → `2 failed | 1763 passed` (embedded-payload.test.ts, both skills); `bun run test` → `@montflow/payload` embed test failed; regenerating the specs embed in a clean copy makes all 50 payload tests pass.

[Fixer] Fixed. Edited `packages/specs/skills/montflow-find-specs/SKILL.md` (F11), then regenerated with the canonical `bun run --cwd packages/specs generate:payload` (exit 0; 2 skills, 3 prompts, 3 tiers). Verification: `bun run --cwd packages/specs test` exit 0 (1821 passed); `bun run --cwd packages/payload test` exit 0 (50 passed); `mf-specs doctor --check` exit 0 after the installed skill was repaired.

[Reviewer] Confirmed current. `embedded-payload.test.ts` compares every skill, prompt, and tier against the generated embed and passes, and `bun run --cwd packages/payload test` passes 50/50, including the one-generator equality test. The embed carries `montflow-find-specs` 1.5.1 and the repaired sentence.

[Reviewer] Re-checked: `embedded-payload.test.ts` passes in the scoped run, and the embed/installed skill carry the repaired find-specs text. Resolved.

### F6 — `new-task` can add an execution task with no `GATES.md` and close it unproven

- Severity: Major
- Location: `packages/specs/src/apps/cli/cli.newtask.module.ts:485`, `packages/specs/src/apps/cli/cli.newtask.module.ts:526`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: `--gates` is optional and `new-task` writes `GATES.md` only when it is set, regardless of task type or the spec's tier. On a standard spec with `## Creation: tier: standard`, `new-task --phase A --task nogate --type execution` writes only `TASK.md` and `MEMORY.md`; `check` reports 0 issues, and after ticking completion `claim --close` closes the execution task. The standard tier file says every task carries `GATES.md` with at least one command or a named subjective check. `init` enforces this, but the generator that grows the spec does not.
- Impact: a standard/full execution task can be completed with no mechanical proof, contradicting the tier artifact matrix and the claim that a complete task with a required mechanical gate cannot pass without a recorded result. A spec authored with `init` then grown with `new-task` can quietly lose its gate coverage.
- Suggestion: make `new-task` infer the tier (`tierOfSpec`) and require or emit a gate for `execution`/`defect`/`interruptor` tasks, or add a `check` rule that a v2 task's type/tier requires `GATES.md`. Add a test that an execution task without `--gates` is refused (or gets a gate template).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] `std-req` (standard, `## Creation` present): `new-task --task nogate --type execution` without `--gates`; `check` 0 issues; ticked and `claim --close` succeeded.

[Fixer] Fixed. `new-task` forces `GATES.md` for execution/defect/interruptor tasks (`packages/specs/src/apps/cli/cli.newtask.module.ts`), and `scaffold` does the same so `create` and default trees match (`packages/specs/src/modules/scaffold/scaffold.module.ts`). Added the v2 `task.gates-required` check for tier-bearing specs (`structure.module.ts`). Tests: `src/apps/cli/tests/state.test.ts` (execution without `--gates` gets GATES.md and a `Yes` row) and `src/modules/scaffold/tests/scaffold.test.ts`. Verification: `bun run --cwd packages/specs test` exit 0.

[Reviewer] Confirmed. `new-task` and `scaffold` force `GATES.md` for execution/defect/interruptor, and a tier-bearing v2 spec emits `task.gates-required` when one is missing. The `state.test.ts` no-`--gates` case and the scaffold test pass.

[Reviewer] Re-checked: `GATED_TASK_TYPES` forces `GATES.md` for execution/defect/interruptor in `new-task` and `scaffold`, and `task.gates-required` covers tier-bearing v2 specs. Tests pass. Resolved.

### F7 — `migrate` upgrades to v2 but leaves the deleted `locked-phases` field

- Severity: Major
- Location: `packages/specs/src/apps/cli/cli.migrate.module.ts:310`, `.agents/@montflow/specs/montflow-references-tui/SPEC.md:7`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: `withSpecVersion` inserts/replaces only the `spec-version` line and preserves every other frontmatter field, including the hand-written `locked-phases`. Migrating `mock-ok` leaves an empty `locked-phases:` in a v2 spec; `migrate mock-complete --include-complete` leaves `locked-phases: A` in a v2 spec and `check` reports 0 issues. The live upgraded `montflow-references-tui/SPEC.md` still has `locked-phases:` at line 7.
- Impact: the B001/C001 delete list ("the hand-written lock list ... are gone") is not met in data, even though no surface reads it. A v2 record can carry a stale lock that a reader may trust, and it masks F1's complete-with-no-round state.
- Suggestion: drop `locked-phases` in `withSpecVersion` when writing version 2; strip it from the live upgraded specs and the migrated fixtures; add a v2 finding for a surviving `locked-phases` field (or at least a migrate test).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] `migrate mock-ok` → v2 with `locked-phases:` still present; `migrate mock-complete --include-complete` → v2 with `locked-phases: A`, `check` 0; live `montflow-references-tui/SPEC.md:7` has `locked-phases:`.

[Fixer] Fixed in code. `withSpecVersion` drops `locked-phases` when writing v2 (`packages/specs/src/apps/cli/cli.migrate.module.ts`), and `check` warns `spec.locked-phases` for a surviving field in a v2 spec (`structure.module.ts`). Test: `src/apps/cli/tests/migrate.test.ts` deletes the field. Verification: `bun run --cwd packages/specs test` exit 0; `mf-specs check` exit 0 with 13 warnings, including `spec.locked-phases` on `montflow-references-tui/SPEC.md`. Residual: that live record still carries the line; editing `SPEC.md` is outside this fixer's allowed write scope, and the new warning surfaces it.

[Reviewer] Confirmed. `withSpecVersion` filters `locked-phases` when writing v2 and the migrate test covers it. The live `montflow-references-tui/SPEC.md:7` still carries the line, but `check` now reports `spec.locked-phases` as a warning (`0 failed · 0 issues · 1 warning`). Acceptable: no surface reads the field, the warning surfaces it, and the record edit is outside this fixer's write scope.

[Reviewer] Re-checked: `withSpecVersion` filters `locked-phases` when writing v2 (`cli.migrate.module.ts:320`) and `spec.locked-phases` warns on a surviving field (`structure.module.ts:445`). The live record line remains a record edit, surfaced by the warning. Resolved.

### F8 — The tier waiver policy is skipped when `## Creation`/tier is absent

- Severity: Major
- Location: `packages/specs/src/apps/cli/cli.state.module.ts:430`, `packages/specs/src/modules/phase/phase.module.ts:726`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: both the `waiver` verb and `phaseEvidence` call `waiverAllowed` only when `tierOfSpec(specText)` is defined; an absent `## Creation` therefore makes every waiver permissible. We copied a standard spec, removed `## Creation`, and `waiver --phase A --waived --reason "gates prove the execution work"` succeeded on a phase holding an execution task; the same waiver on the tier-bearing copy is refused with `waiver.waiver-policy`. The standard's own `montflow-spec-standard/SPEC.md` has no `## Creation` (its phases are currently `required`, so the gap is latent), and `migrate` does not add one.
- Impact: a migrated or hand-edited v2 spec can bypass the `standard` records-only / `full` forbidden waiver rule and skip review on an execution phase. The policy the tier contract defines is enforced only when the tier record happens to survive.
- Suggestion: require a valid `## Creation` tier for any v2 spec before a waiver is effective (or treat an unknown tier as `full` for waiver purposes), and make `migrate`/`init` ensure the record. Add the removed-Creation fixture as a refusal test.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] `notier` (standard spec copy with `## Creation` removed): `waiver --phase A --waived --reason ...` → `✓ waived review for A · notier · evidence A001:0, A003:0`; the same waiver on `stdpolicy` (tier record present) → `waiver.waiver-policy`.

[Fixer] Fixed. `setWaiver` now refuses when `tierOfSpec` is undefined (`waiver.waiver-policy`), and `phaseEvidence` treats a missing tier as an ineffective waiver (`packages/specs/src/apps/cli/cli.state.module.ts`, `packages/specs/src/modules/phase/phase.module.ts`). Test: `src/apps/cli/tests/state.test.ts` removes `## Creation` and expects `waiver.waiver-policy`. Verification: `bun run --cwd packages/specs test` exit 0.

[Reviewer] Confirmed. `setWaiver` refuses when `tierOfSpec` is undefined (`waiver.waiver-policy`), and `phaseEvidence` requires `tier !== undefined` before a waiver is effective. The removed-`## Creation` refusal test passes.

[Reviewer] Re-checked: `setWaiver` refuses an undefined tier (`cli.state.module.ts:474`, `waiver.waiver-policy`) and `phaseEvidence` requires `tier !== undefined` (`phase.module.ts:749`). Test passes. Resolved.

### F9 — `phase.objective` accepts `TODO` and every phase in the standard's spec is a placeholder

- Severity: Major
- Location: `packages/specs/src/modules/phase/phase.module.ts:384`
- Status: Resolved
- Attempts: 2
- First Seen: 002
- Problem: the objective check rejects only empty/blank or `<`-containing values, not `TODO:`/`TBD`/`N/A`. All nine phases of `.agents/@montflow/specs/montflow-spec-standard` (`A` through `I`) read `objective: TODO: state what phase X must achieve.` and `mf-specs check` accepts them (the only finding is the unrelated D warning).
- Impact: the required phase objective — the artifact that makes a phase more than a task-id prefix — is a placeholder throughout the reference spec, and the verifier's "placeholder" claim is not implemented. A reviewer cannot tell what any phase must achieve.
- Suggestion: reuse the `isReviewReason`-style placeholder set for objectives (reject `TODO`, `TBD`, `N/A`, `<...>`) and fill the nine objectives from the spec description/phase plan. Add a test that `objective: TODO: ...` is `phase.objective-missing`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] `grep '^objective:'` over the nine `PHASE.md` files returns `TODO: state what phase X must achieve.` for A–I; `check` reports 0 issues (1 warning only on D).

[Fixer] Confirmed already fixed by the authoring pass; no re-edit. All nine `PHASE.md` objectives are non-placeholder: `grep '^objective:'` returns 9 lines and `grep 'TODO: state what phase'` returns 0. Verification: `bun run --cwd packages/specs cli check --dir .` exit 0 (0 issues, 13 warnings).

[Reviewer] Data fixed, validator not. All nine objectives are non-placeholder, but `phase.module.ts:381` still rejects only blank or `<`-containing values. Setting `objective: TODO: state what phase A must achieve.` in a tier-bearing fresh `init --tier standard` `PHASE.md` leaves `check` at `0 issues` (probe `/tmp/opencode/f9probe`). The existing test (`phase.test.ts:57`) uses `TODO: <what>`, so it passes via `<`, not the TODO rule. Add `TODO`/`TBD`/`N/A` to the placeholder check and test a plain `TODO:` value.

[Fixer] Fixed the validator. `packages/specs/src/modules/phase/phase.module.ts` adds `isPhaseObjective` and uses it at the objective check: blank, angle-bracket templates, and a first token of `TODO` / `TBD` / `N/A` (case-insensitive, with or without trailing prose such as `TODO: something`) now fail `phase.objective-missing`; a real objective still passes. The generated objectives in `packages/specs/src/apps/cli/cli.migrate.module.ts` and `packages/specs/src/modules/scaffold/scaffold.module.ts` were changed from `TODO: ...` to real sentences so their own output remains valid. Tests: `packages/specs/src/modules/phase/tests/phase.test.ts` now covers `TODO: something`, `TBD`, `TBD: later`, `n/a`, `N/A: not applicable` and keeps a legitimate objective passing. Verification: `bun run test src/modules/phase/tests/phase.test.ts` exit 0; the combined scoped run (phase, migrate, review-gate, claim, lifecycle) exit 0 (148 passed); `bun run ts:check` exit 0. Probe: `check --name montflow-references-tui` now flags its `G/PHASE.md` `objective: TODO: state what phase G must achieve.` as `phase.objective-missing` (out of scope to edit that record).

[Reviewer] Verified in code and by probe. `isPhaseObjective` (`phase.module.ts:183`) rejects blank, any `<`/`>`, `-`, and a first token in `PLACEHOLDER_REASONS` (`todo`, `tbd`, `n/a`, `none`, `-`), case-insensitive, so `TODO: something` fails while trailing prose cannot hide it; `objectiveHead` strips to the first word. Probe `/tmp/opencode/f1probe3`: setting `objective: TODO: something` → `phase.objective-missing`; restoring a real sentence → zero objective issues. `phase.test.ts` now covers `TODO: something`, `TBD`, `TBD: later`, `n/a`, `N/A: not applicable` and a passing real objective; both phase and migrate suites pass. Resolved.

### F10 — `create`/`new-task` do not wire the review task to the work; `claim --start` can bypass the ready set

- Severity: Minor
- Location: `packages/specs/src/modules/scaffold/scaffold.module.ts:156`, `packages/specs/src/apps/cli/cli.claim.module.ts:451`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: `create --tasks work:execution:gates,gate-review:review` writes the review task with an empty `depends-on`. `next` hides the review until every non-review task in the phase is complete, but `claim --start` checks only `depends-on`, so it started A002 while A001 was still pending and `next` listed only A001. `new-task` after a phase's review task likewise appends work that the review task does not depend on. The SPEC requirement says the review waits on every non-review task.
- Impact: a review can begin or complete before the work it reviews, so its verdict can predate the change; the ready set and the transition layer disagree.
- Suggestion: set the review task's `depends-on` to every non-review task at `create`/`init`, update it when `new-task` adds work after the review task (or insert work before the review), and/or make `claim --start` enforce the same review-last rule as `next`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] `create --tasks work:execution:gates,gate-review:review` → A002 `depends-on:` empty; `claim --start --task A002` → `✓ started A002` while A001 pending; `next` → only A001.

[Fixer] Fixed. `scaffold` wires a review task's `depends-on` to every non-review task (`packages/specs/src/modules/scaffold/scaffold.module.ts`); `new-task` does the same when creating a review task and appends later work to an existing review task's `depends-on` (`packages/specs/src/apps/cli/cli.newtask.module.ts`); `claim --start`/`--bind` refuses a review task while any non-review task in the phase is incomplete (`packages/specs/src/apps/cli/cli.claim.module.ts`). Tests: `create.test.ts`, `state.test.ts` (review depends-on update), `claim.test.ts` (start refusal). Verification: `bun run --cwd packages/specs test` exit 0.

[Reviewer] Confirmed. `scaffold` wires a review task's `depends-on` to every non-review task, `new-task` does the same and appends later work to an existing review task, and `claim --start`/`--bind` refuses a review while any non-review task in the phase is incomplete. The create/state/claim tests pass.

[Reviewer] Re-checked: `scaffold.module.ts:266` sets a review task's `depends-on` to every non-review task, `new-task` wires later work into an existing review task, and `claim --start`/`--bind` refuses a review while non-review work is incomplete. Tests pass. Resolved.

### F11 — `montflow-find-specs` still says `doctor` leaves a present skill untouched

- Severity: Minor
- Location: `packages/specs/skills/montflow-find-specs/SKILL.md:29`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: the skill says "Idempotent — a present skill is left untouched." The v2 `doctor` now repairs a stale present skill: after appending to an installed `SKILL.md`, `doctor --check` reported `'SKILL.md' differs from the package` and the `mf-specs doctor` fix. Only a current skill is untouched.
- Impact: a reader may believe a stale install is healthy, contradicting the C004 report/repair split and the new doctor behavior.
- Suggestion: say "a current skill is left untouched; a stale copy is repaired" in the skill (and regenerate the embed, F5).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] Modified `.agents/skills/montflow-create-specs/SKILL.md`; `doctor --check` → `✗ ... 'SKILL.md' differs from the package`; `mf-specs doctor` repairs it. The find-specs skill still claims a present skill is untouched.

[Fixer] Fixed. `packages/specs/skills/montflow-find-specs/SKILL.md` now says a current skill is untouched and a stale copy is reported and repaired. Regenerated the embed (F5) and ran `mf-specs doctor` to repair the installed copy. Verification: `mf-specs doctor --check --dir .` exit 0.

[Reviewer] Confirmed in the package source, the installed `.agents/skills/montflow-find-specs/SKILL.md`, and the embedded payload: a current skill is untouched; a stale copy is reported and repaired.

[Reviewer] Re-checked in `packages/specs/skills/montflow-find-specs/SKILL.md:30` and the embed. Resolved.

### F12 — The D phase is required but has no review task; the warning is real but deferrable

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/D/PHASE.md:4`, `.agents/@montflow/specs/montflow-spec-standard/SPEC.md:172`, `.agents/@montflow/specs/montflow-spec-standard/C/C001-implement-version-and-structure/TASK.md:38`
- Status: Resolved
- Attempts: 1
- First Seen: 002
- Problem: `D/PHASE.md` is `review: required` but the D directory holds only D001 and D002; the SPEC.md table lists E099–I099 but no D099. `mf:check` emits `phase.review-task-missing` on D and `lock --phase D` would fail `phase.review-missing`; a required phase can never lock without a review task. C001's completion says the check has "version warnings only", which is no longer true; C007 records the D warning as historical and outside its write scope. `new-phase` can reproduce the same state (it writes `review: required` with no review task).
- Impact: the standard's own spec has an un-lockable required phase. The warning is non-fatal, so it does not block Phase C, but if Phase D executes from the table as written it can never pass its lock.
- Suggestion: add D099 (or record a valid waiver, which the full tier forbids) now or as D001's first step, and make `new-phase` create/require the review task so a required phase is never left empty. Correct C001's "version warnings only" completion line.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] `mf:check` → `phase.review-task-missing × 1 · montflow-spec-standard/D/PHASE.md`; `SPEC.md` has D001/D002 and no D099; `lock D` (fresh fixture equivalent) fails `phase.review-missing`. Decision: a real record defect, acceptable to defer to Phase D only if D099 is created before D work starts.

[Fixer] Confirmed already fixed; no re-edit. `D/D004-review-phase/TASK.md` exists, `SPEC.md:199` lists D004, and `mf-specs check` reports 0 issues (the prior `phase.review-task-missing` warning is gone). Verification: `bun run --cwd packages/specs cli check --dir .` exit 0.

[Reviewer] Confirmed. `D/D004-review-phase/TASK.md` exists, `SPEC.md:199` lists D004, and `check` is `0 issues`. Residual, non-blocking: `new-phase` can still create a `review: required` phase with no review task (warning only), and C001 `TASK.md:38` still says "version warnings only" while the current warning set is broader. Neither leaves the D phase un-lockable, which was the finding's defect.

[Reviewer] Re-checked: `D/D004-review-phase` exists and `SPEC.md:199` lists it; `check` has no `phase.review-task-missing`. The residual `new-phase` gap and the stale C001 sentence are non-blocking. Resolved.

### F13 — C003's live-delivery claim is a PATH shim, not a live session

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.mail.module.ts:74`, `.agents/@montflow/specs/montflow-spec-standard/C/C003-implement-board-and-mailboxes/MEMORY.md:197`
- Status: Won't Fix
- Attempts: 1
- First Seen: 002
- Problem: C003's completion says "Delivery to a live session and queueing to a non-live task both demonstrated"; its MEMORY records that the CLI demonstration used a PATH shim and "no live user session was ever steered". The default `SessionSteerPort` shells out to `opencode api POST /api/session/<id>/prompt`, which was not exercised against a running host; the tests use a recording fake.
- Impact: the live half of the mail path is unproven. A failed steer queues safely, but a wrong route or payload would go unnoticed until an agent relies on it.
- Suggestion: exercise one real `opencode` server/session end to end (or a `--standalone` server), record the route and response, and adjust the completion claim; fix the port if the route is wrong.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Reviewer] C003 MEMORY: "the CLI demonstration uses a PATH shim, never a live [session]" and "no live user session was ever steered". The code's default port is an `opencode api` call; the specs test uses a fake.

[Fixer] BLOCKED on the record claim; code/test part done. The default steer route and payload were checked against the installed `opencode` OpenAPI: `opencode api --standalone GET /openapi.json` defines `POST /api/session/{sessionID}/prompt` with a `text` request property, matching `opencodeSteerArgs`; added a unit test pinning that route/payload (`src/apps/cli/tests/mail.test.ts`). No live session was exercised, and the C003 completion claim lives in `C/C003-implement-board-and-mailboxes/MEMORY.md`, which this fixer is forbidden to edit. Exact blocker: correcting the live-delivery claim requires editing that MEMORY record or running a live `opencode` session; neither is within this fixer's allowed writes. Verification: `bun run --cwd packages/specs test` exit 0 (the new `opencodeSteerArgs` test passes).

[Reviewer] Confirmed still unproven live. `opencodeSteerArgs` pins `opencode api POST /api/session/<id>/prompt` with a `text` body, but only against a unit test; no live server or session was exercised, and C003 MEMORY still says the demonstration used a PATH shim. Severity stays Minor and this does not block Phase C: a failed steer queues safely, and the route/payload are now pinned. Remaining work is a live-host run or a corrected C003 completion claim; blocked on a live session, not escalated.

[Fixer] Deferred as an accepted Minor; no live session was run and no live-delivery claim is made. The code/test part remains as before (`opencodeSteerArgs` pins the route/payload; `mail.test.ts` covers it), and `C/C003-implement-board-and-mailboxes/MEMORY.md` is untouched per scope. Leaving this Open so the live-host run or the C003 claim correction is visible to the reviewer; it is non-blocking for Phase C.

[Reviewer] Accepted as a deferred Minor; no live session exists to probe. Severity is Minor and the failure mode is safe (a failed steer queues rather than losing the message). The route/payload are pinned by `opencodeSteerArgs` and `mail.test.ts` passes; the only residual is a live-host run or a corrected C003 completion claim, neither of which is available in this round. Marking `Won't Fix` as an accepted risk closes the finding while the live verification stays visible as follow-up work (open a defect task if a live host is ever exercised). Non-blocking for Phase C.

## Verdict

**Pass.** F1–F12 are confirmed fixed in code and by independent probe. F1 no longer depends on the `## Creation` tier: every v2 record gets `requireLocks` and `verifyReviewLink`, and `claim --close`, `state`, `status`, `lock`, and `review decide` now agree on a tier-less complete v2 record. F9's validator rejects `TODO`/`TBD`/`N/A` with trailing prose. F13 is an accepted Minor (`Won't Fix`, deferred live-host run) and does not block Phase C. The only remaining `mf:check` failure is the A099 record debt, which is out of scope for this round.

## Coverage

- Scoped specs tests: `migrate`, `phase`, `review-gate`, `claim`, `gate`, `state`, `review-policy`, `scaffold`, `lifecycle`, `embedded-payload` — 14 files / 180 tests pass, typecheck clean; `ts:check` clean.
- Independent probes (`/tmp/opencode/f1probe3`, fresh `init --tier standard` with `## Creation` deleted and `spec-version: 2`): complete tree → `check` fails on `review-series` for A and B, `status` `state inconsistent`, `state` `inconsistent · locked none · blocked`, `lock A` `phase.review-missing`, `review decide A` `start`/`round-missing`, `claim --close` `claim.review-not-passed`; `objective: TODO: something` → `phase.objective-missing`, a real objective → clean.
- `check --dir ../..` → `14 specs · 1 failed · 1 issue · 13 warnings`; the single failure is `montflow-spec-standard` A099 missing its phase-A round (record debt, out of scope).
- Re-verified: `reviewVerdict`/`passedReviewPhases` wiring in lock/status/state/check; `recordGate` authority and judge match; `isPlaceholderCommand` template coverage; `new-task`/`scaffold` GATES forcing; migrate `locked-phases` stripping; waiver tier refusal; review `depends-on` and claim ordering; find-specs text in source/embed; D004 presence.

## Summary

- Critical: 2
- Major: 7
- Minor: 4
- Nit: 0
- Open: 0
- In Review: 0
- Resolved: 12
- Won't Fix: 1
- Escalated: 0
