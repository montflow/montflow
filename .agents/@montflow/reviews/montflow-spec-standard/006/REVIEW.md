# Review: montflow-spec-standard / 006

## Metadata

- Target: Phase E — E001 parallel execution contract, E002 verification scheduler, E003 parallel authoring guidance
- Round: 006
- Phase: E
- Type: re-review
- Isolation: isolated
- Max Attempts: 3
- Status: open
- Created: 2026-11-03

## Findings

### F1 — A forced or retried run silently consumes the old record when a lane/in-flight slot is busy

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:783-807`, `packages/specs/src/modules/scheduler/scheduler.module.ts:622-627`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: when `step()` returns `wait` for `lane` or `in-flight`, the loop sleeps once and then consumes **any** terminal run state for the key that carries a `resultIndex` (lines 798-807). It never checks that the requester was waiting on a live attempt or that the state is newer than the request. Trigger: key K already has a terminal state (a prior pass, or a prior failure); `gate run --no-reuse` (or a retry of the failed key) is issued while another heavy run holds the single heavy lane (`lanes: 1`, default). `step()` skips reuse because `reuse=false`, is not a key waiter because the state is terminal, waits on the lane, then the first poll returns the **old** record through `consume` (lines 716-742) with `reused: true` and appends another `reused: true` record. Nothing was executed.
- Impact: `--no-reuse` (documented as "forces a run" in `packages/specs/README.md:411-412` and contract C6) silently does not run. A retry after a transient failure returns the stale failure, and a suspect pass is reported as a valid reused pass. This is also the one path where an outcome is produced without a run against the current inputs — by design the key means the inputs are the same, but the operator explicitly asked for a fresh execution.
- Suggestion: consume in the wait loop only when this requester registered as a waiter against the live attempt it observed (track the attempt count seen when the wait started), or only when `request.reuse` is true and the state is a pass. For lane/in-flight waits, drop the terminal-consume shortcut and re-enter `step()`; `step()` already handles reuse and terminal states correctly.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Lane/in-flight waits now re-enter `step()` instead of consuming a terminal state; a key waiter consumes only the attempt it registered against. `packages/specs/src/modules/scheduler/scheduler.module.ts:685` records `observedAttempt` and `:914-923` guards the consume on `lastPhase === 'key'`, `current.waiters.includes(...)`, and the observed attempt count. A `--no-reuse` request or a retry while the heavy lane is busy now runs. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (28 passed, new case `--no-reuse does not consume an old record while a lane is busy`).
- [Reviewer] Confirmed in the code. A lane/in-flight wait sets `lastPhase` and `continue`s back into `step()` (`scheduler.module.ts:894-914`); a key waiter consumes only when the read state still lists this session, carries `resultIndex`, and has at least the attempt count it registered against (`:915-925`, with `observedAttempt` recorded at `:896`). A `--no-reuse` request skips the reuse branch (`:659-664`) and a retry of a failed key never enters branch 2, so both claim their own attempt. `bun run --cwd packages/specs test -- src/modules/scheduler` → 2 files, 28 tests, pass, including `--no-reuse does not consume an old record while a lane is busy`.

### F2 — `check` recomputes freshness from the record's own scope, so a later pass under a different scope hides the stale one

- Severity: Major
- Location: `packages/specs/src/modules/gates/gates.module.ts:832-869`, `packages/specs/src/apps/cli/cli.check.module.ts:333-366`, `packages/specs/src/apps/cli/cli.gate.run.module.ts:767`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: `verifyResultFreshness` iterates `latestResults` (latest record per stage) and recomputes the key with `gateKey(record.command, record.scope, fingerprint)` (check module lines 356-363), i.e. always from the scope recorded in the record. Nothing compares that scope with the stage's declared `scope:` line or the owner's fallback scope (`stageScope(stage) ?? ownerScope`), and `verifyGateResults` compares only `command` and `kind` (gates module lines 933-960). Trigger: a stage declares `scope: packages/specs` (or `repo`) and records a pass under key A. Inputs change, so A is stale. A rerun with `--scope packages/core` (explicitly allowed to override a stage's scope, C4, and used in `gate-scheduler.test.ts:436-441`) records pass B. `latestResults` makes B effective, B recomputes green against `packages/core`, and the stale A is never evaluated. The change to `packages/specs` is invisible.
- Impact: a stale green passes `check` exactly when a later pass uses a differing scope — the audit's "newer pass under a DIFFERENT scope" case. A missing or misspelled stage scope is equally undetectable, so `gate.stale-result` only proves the record agrees with itself.
- Suggestion: resolve the stage's declared/owner scope when checking freshness and require the record scope to equal (or cover) it; report a mismatch as `gate.stale-result` (or `gate.scope-missing`) instead of recomputing against the record's claim. At minimum, use the declared scope to validate `record.scope` in `verifyGateResults`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Freshness is recomputed against the stage's declared scope, never the record's own claim. `packages/specs/src/modules/gates/gates.freshness.module.ts:21-24,41-108` adds `declaredScope` and reports a scope mismatch as `gate.stale-result`; `packages/specs/src/apps/cli/cli.check.module.ts:361-400` resolves `stageScope(stage) ?? owner fallback` per record; `packages/specs/src/modules/gates/gates.module.ts:862-885` validates a declared stage scope in `verifyGateResults` too. A later pass under `packages/core` can no longer hide a stale pass for a stage declared `packages/specs`. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new case `rejects a pass recorded under a scope the stage no longer declares`).
- [Reviewer] Confirmed. `staleResultIssues` resolves `stageScope(stage) ?? task write-scope ?? repo` per record (`cli.check.module.ts:387-391`) and `verifyResultFreshness` compares the record scope with it before recomputing, emitting `gate.stale-result` (`gates.freshness.module.ts:82-98`); `verifyGateResults` repeats the check for a declared stage scope (`gates.module.ts:868-885`). The round's stated trigger — a rerun under `--scope packages/core` hiding a stale `packages/specs` pass — now errors instead. `bun run --cwd packages/specs test -- src/modules/gates` passes. The comparison's exact-equality form has its own consequence; filed as F13.

### F3 — `heartbeatSeconds >= leaseSeconds` is accepted, letting a live owner's lease expire and a second requester double-run the key

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:99-156`, `packages/specs/src/modules/scheduler/scheduler.module.ts:379-384`, `packages/specs/src/modules/scheduler/scheduler.module.ts:828-864`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: `parseGateConfig` validates each bound is an integer >= 1 but never validates `heartbeatSeconds < leaseSeconds`. `leaseOf` sets `leaseExpiresAt = now + leaseSeconds`, while `heartbeatLoop` renews only after its first `sleep(heartbeatSeconds)`. With `{"leaseSeconds":5,"heartbeatSeconds":10}` (accepted without a problem), the lease expires five seconds before the first renewal. A second requester then finds `leaseExpired` true (`ageMs > 0`) even though `isPidAlive` is true; it marks the attempt `expired`, and the lane/in-flight counts exclude it (`state === 'running' && !leaseExpired`), so it starts attempt 2 while attempt 1 still runs.
- Impact: two executions of the same key and two concurrent heavy commands despite `heavy.lanes: 1` — the single-flight and lane guarantees are config-bypassable. The same window exists whenever the owner is paused/suspended for longer than the lease, because expiry alone overrides a live pid.
- Suggestion: reject `heartbeatSeconds >= leaseSeconds` in `parseGateConfig` as `gate.invalid-config`, and make reclaim require a dead owner or an expired lease **without** a live heartbeat process (or renew the lease before the first sleep and at half the lease interval).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] `parseGateConfig` now refuses `heartbeatSeconds >= leaseSeconds` as `gate.invalid-config`: `packages/specs/src/modules/scheduler/scheduler.module.ts:162-167` pushes the problem so `gate run` never starts a lease that expires before its first renewal. A live owner can no longer have its lease counted expired by a second requester from config alone. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (new assertion for `{leaseSeconds:5,heartbeatSeconds:10}`).
- [Reviewer] Confirmed. `parseGateConfig` pushes the problem at `scheduler.module.ts:159-166`, and `gateConfigOf` turns any problem into a `gate.invalid-config` refusal before a stage runs (`cli.gate.run.module.ts:559-574`). The test `reads gate.json defaults and refuses a bound below 1` exercises `{leaseSeconds:5,heartbeatSeconds:10}`. The remaining "expired lease reclaims over a live pid" behaviour is exactly what C8 mandates ("past `leaseExpiresAt` (or a dead `pid`)"), so it is contract-conforming, not this defect.

### F4 — `writeRunState` swallows every write error, so the single-flight claim can silently not exist

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:306-329`, `packages/specs/src/modules/scheduler/scheduler.module.ts:628-640`, `packages/specs/src/modules/scheduler/scheduler.module.ts:692-711`
- Status: In Review
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

### F5 — Contract findings `task.write-scope-missing`, `phase.write-scope-overlap`, `phase.serial-chain-unexplained`, `gate.shared-check-in-task`, `gate.duplicate-command` are taught as `check` output but never implemented

- Severity: Major
- Location: `packages/specs/src/modules/gates/gates.module.ts:31-68`, `packages/specs/src/modules/scaffold/scaffold.module.ts:146-170`, `packages/specs/skills/montflow-create-specs/SKILL.md:183`, `packages/specs/skills/montflow-create-specs/SKILL.md:188`, `packages/specs/skills/montflow-create-specs/SKILL.md:296-299`, `packages/specs/README.md:356-372`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: E001's contract maps C1/C2/C3 to `check` (`C11 Enforcement map`, `MEMORY.md:37`) and says `new-task`/`init`/`create` generate `write-scope` (C2). The diff adds neither: `GATE_CODES` has no entry for four of the five codes, `gate.scope-missing` exists but is emitted only by `gate run`'s refusal (`cli.gate.run.module.ts:770`), never by `check`; `verifySpecTree`/`check` add no scope, overlap, serial-chain, or duplicate-command rule; and `renderTask`/`renderInitTask` emit no `write-scope:` field. Meanwhile the authoring skill, the `spec-create` prompt, and the README now assert these codes fire and that a colliding write scope "is the contract's `phase.write-scope-overlap` error". A fresh `init` tree with no write scopes and two colliding tasks is green. E002's TASK does not list C2/C3 checks, so deferral is plausible — but E003's guidance now claims active enforcement, and no phase record opens a defect for the missing rules.
- Impact: authors trust a verifier that never fires; serial chains, overlapping write scopes, and repo-wide commands copied into a task gate are undetected. The self-check checklist ("Every task declares write-scope … no two unfinished tasks overlap without an edge") cannot fail `check`.
- Suggestion: either implement the five rules and generate `write-scope` in the generators, or remove the claims from the skill/prompt/README and record a defect task that names the deferred codes. The drift test should assert the behavior, not only the string (see F9).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] The five contract findings are implemented and the generators write the field. `packages/specs/src/modules/structure/structure.parallel.module.ts` owns `task.write-scope-missing` (warning), `phase.write-scope-overlap` (error), `phase.serial-chain-unexplained` (warning), and `gate.duplicate-command`; `structure.module.ts:596-630` emits `gate.scope-missing` (warning) and `gate.shared-check-in-task` for a task stage outside its `write-scope:`. Generators: `packages/specs/src/modules/init/init.module.ts:52,181,688`, `scaffold.module.ts:164`, and `cli.newtask.module.ts:89` emit `write-scope:` (`none` for review/exploratory/planning, `.` for execution work), and `init`/`create` accept a `scope=` token while `new-task` accepts `--write-scope`. README, skill, and prompt now state what fires. Verified: `bun run --cwd packages/specs test -- src/modules/structure/tests/verify-spec-tree.test.ts src/modules/scaffold src/modules/init src/apps/cli/tests/create.test.ts` (behavior tests for each code plus generator output).
- [Reviewer] Confirmed. The three pure rules live in `structure.parallel.module.ts` and are wired into `verifySpecTree` at `structure.module.ts:805-807`; the task-stage `gate.scope-missing` / `gate.shared-check-in-task` rules run at `:591-637`; phase stages are collected for the duplicate-command rule at `:743-751`. `init`, `scaffold`, and `new-task` emit a `write-scope:` line (`init.module.ts:688`, `scaffold.module.ts:164`, `cli.newtask.module.ts:89`). End to end, `mf-specs init`/`create` with two execution tasks now makes `check` exit 1 on `phase.write-scope-overlap`, so the rule fires for real. Scoped tests: `... test -- src/modules/structure src/modules/gates src/apps/cli/tests/gate-scheduler.test.ts` → 6 files, 160 pass. The generated default value is its own defect; filed as F11.

### F11 — The generators default every execution task to `write-scope: .`, so two independent execution tasks collide and `check` fails

- Severity: Major
- Location: `packages/specs/src/modules/init/init.module.ts:52-53`, `packages/specs/src/modules/init/init.module.ts:181`, `packages/specs/src/modules/scaffold/scaffold.module.ts:56-57`, `packages/specs/src/modules/scaffold/scaffold.module.ts:164`, `packages/specs/src/modules/structure/structure.parallel.module.ts:122-150`
- Status: In Review
- Attempts: 1
- First Seen: 006
- Problem: `defaultWriteScope`/`defaultScaffoldWriteScope` return `.` for `execution`/`defect`/`interruptor`, and `.` normalizes to `repo` (`scheduler/scope.module.ts:44-52`). Two unfinished execution tasks in one phase therefore declare the same `repo` scope and `verifyPhaseParallelism` reports `phase.write-scope-overlap` as an **error** unless one depends on the other. Reproduced: `mf-specs init --name demo --tier standard --task A:first:execution --task A:second:execution --review A:required` then `check --dir` → `1 failed`, `phase.write-scope-overlap`, `Tasks 'A002' and 'A001' both write 'repo'`; the same with `mf-specs create --tasks "first:execution,second:execution"`. The generator's clean-tree test (`init.test.ts:77-86`) stays green only because every default tier plan puts a single execution task in a phase.
- Impact: the normal parallel phase — the exact shape C1 asks authors to write — is red the moment it is scaffolded, before the author changes anything. The author must hand-edit every task's scope, which is the field the generator claims to generate, and `mf-specs create`/`init` no longer honour "renders … trees that verify clean immediately".
- Suggestion: do not invent `repo` as a default. Leave `write-scope:` empty (or `none`) and let `task.write-scope-missing` warn, or refuse a plan where a second execution task omits `scope=`. Add a two-execution-task tree to the "verifies clean immediately" test so the default is measured.

#### Discussion

<!-- Append-only. Each turn prefixed by its role tag. -->

- [Reviewer] Found while verifying F5 end to end. The rule that catches it is implemented correctly; the default the generators write into every task is what makes the scaffold fail its own verifier.
- [Fixer] Chose the empty-field option over refusing a second execution task: the generator cannot know a task's paths, and a refusal would turn a common parallel plan into a CLI error. `packages/specs/src/modules/init/init.module.ts:51-58` and `packages/specs/src/modules/scaffold/scaffold.module.ts:55-62` return `''` for `execution`/`defect`/`interruptor` (still `none` for review/exploratory/planning), and the TASK renderers emit a bare `write-scope:` (`init.module.ts:693`, `scaffold.module.ts:167-171`, `cli.newtask.module.ts:80-91`). No `repo` default is invented; a two-execution phase now warns `task.write-scope-missing` instead of failing `phase.write-scope-overlap`. The "verifies clean immediately" test asserts no errors for the default tiers and adds a two-execution case (`packages/specs/src/modules/init/tests/init.test.ts:77-103`), with a scaffold twin at `packages/specs/src/modules/scaffold/tests/scaffold.test.ts:35-49`. End to end, `mf-specs init --task A:first:execution --task A:second:execution --review A:required` then `check` reports `0 failed` with two `task.write-scope-missing` warnings. Verified: `bun run --cwd packages/specs test -- src/modules/init src/modules/scaffold src/apps/cli/tests/create.test.ts src/apps/cli/tests/newtask.test.ts`, `bun run --cwd packages/specs lint:check`, `bun run --cwd packages/specs format:check`.

### F12 — A keyed mechanical record with no `scope` bypasses freshness, so a hand-written pass still greens a completed owner

- Severity: Major
- Location: `packages/specs/src/modules/gates/gates.freshness.module.ts:77-78`, `packages/specs/src/modules/gates/gates.module.ts:699-708`, `packages/specs/src/modules/gates/gates.module.ts:868-885`
- Status: In Review
- Attempts: 1
- First Seen: 006
- Problem: `verifyResultFreshness` returns early on `record.scope === undefined || record.command === undefined` before validating the key, and `verifyGateResults` compares a record's scope with the declared stage scope only when `record.scope !== undefined`, while accepting any `command` equal to the stage's. Nothing checks that a `key` is present or that it agrees with a `scope`/`fingerprint`. Trigger: a complete owner's record `{stage,title,kind:"mechanical",command:<copied from GATES.md>,key:"gate-v1:deadbeef",exit:0,verdict:"pass",at,output:""}` with no `scope` and no `fingerprint` on a stage that declares `scope: packages/specs`. Probed against the shipped functions: `verifyResultFreshness` → `valid: true`, no issues; `verifyGateResults` → `valid: true`, no issues. Twenty bytes of copied JSON plus one arbitrary key satisfy `check --require-complete`.
- Impact: C6's "a fabricated green is rejected" does not hold for completed work. The round-005 fix closed the unkeyed variant (F7); the keyed-but-scopeless variant is the same spoof with one field added, and it passes silently because freshness never reads the key it now demands.
- Suggestion: in `verifyResultFreshness`, treat a keyed pass with no `scope`/`fingerprint` as `gate.results-malformed` (or `gate.stale-result`), not a skip; in `verifyGateResults`, require `record.scope` on a stage that resolves a scope.

#### Discussion

<!-- Append-only. Each turn prefixed by its role tag. -->

- [Reviewer] Proved with the shipped functions, not by reading the fixer's note: a mechanical pass carrying an arbitrary `key` and no `scope` yields zero issues from both `verifyResultFreshness` and `verifyGateResults`, even with `declaredScope: () => ['packages/specs']` and `complete: true`.
- [Fixer] A keyed pass with no inputs is no longer skipped. `packages/specs/src/modules/gates/gates.freshness.module.ts:77-95` reports `gate.results-malformed` (error) before recomputation when a keyed pass lacks `scope` or `fingerprint`; `packages/specs/src/modules/gates/gates.module.ts:868-891` requires `record.scope` on any mechanical stage that resolves a scope and reports `gate.results-malformed` when it is absent. The arbitrary-key/no-scope record now fails both functions. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new cases `rejects a keyed pass with no scope instead of skipping freshness` and `rejects a mechanical result with no scope on a scoped stage`), `bun run --cwd packages/specs ts:check`.

### F6 — A deleted or renamed scope makes a keyed pass unverifiable and `check` treats that as green

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.check.module.ts:347-350`, `packages/specs/src/modules/gates/gates.module.ts:852-855`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: `staleResultIssues` caches `undefined` when `fingerprintScopes` reports any missing scope, and `verifyResultFreshness` does `if (currentKey === undefined || currentKey === record.key) continue;`. A record whose scope path no longer exists therefore produces no finding. Trigger: a pass recorded with `scope: packages/specs`, then that directory is renamed/deleted (or the gate declares a path that never existed); `check` reports no `gate.stale-result` and no `gate.scope-missing` for the record.
- Impact: an old green survives the disappearance of the exact inputs it claimed to cover. The code's stated rule "unknowable, not stale" is implemented as "unknowable, therefore accepted".
- Suggestion: when a record's scope cannot be fingerprinted, emit `gate.scope-missing` (or a warning) rather than skipping; only a genuinely unreadable file that is surfaced as a diagnostic may be treated as unknowable.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] A record whose own scope no longer exists is reported instead of skipped. `packages/specs/src/modules/gates/gates.freshness.module.ts:101-108` emits `gate.scope-missing` (warning) when `missingScope` is true; `packages/specs/src/apps/cli/cli.check.module.ts:380-392` tracks which cached scopes were missing. A renamed/deleted scope no longer leaves an unverified green. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new case `reports a pass whose scope disappeared instead of accepting it`).
- [Reviewer] Confirmed. `staleResultIssues` records each scope whose fingerprint reports `missing` (`cli.check.module.ts:374-380`) and passes a `missingScope` predicate per record (`:391`); `verifyResultFreshness` emits `gate.scope-missing` at `gates.freshness.module.ts:99-114` when `recompute` is undefined and that predicate is true. The `report a pass whose scope disappeared` case is in the passing gates suite.

### F7 — A complete owner's unkeyed pass is exempt, so a hand-written green passes `check --require-complete`

- Severity: Minor
- Location: `packages/specs/src/modules/gates/gates.module.ts:836-850`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: an effective mechanical pass with no `key` is reported as `gate.result-unkeyed` only when the owner is unfinished; a complete owner is skipped entirely. `verifyGateResults` accepts the pass as long as `verdict: "pass"`, `exit: 0`, and `command` equals the stage command (lines 933-960), all trivially copied from `GATES.md`. The exemption is meant for pre-scheduler legacy records, but it applies to records appended after the scheduler ships (no timestamp/release cutoff).
- Impact: a one-line fabricated record makes a completed task or phase green, and the completion gate cannot distinguish it from a real run. The contract requirement "a stale or fabricated green is rejected" is not met for completed work.
- Suggestion: exempt only records that predate the key grammar (e.g. by `at` before a documented cutoff), or require a key on every stage that declares `scope:`; otherwise keep the warning.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] A complete owner's unkeyed pass is now an error when the stage declares a `scope:`; only a legacy stage with no declared scope stays exempt. `packages/specs/src/modules/gates/gates.freshness.module.ts:45-79` uses `declaredScope` to distinguish the two. `check --require-complete` therefore rejects a hand-written one-line pass on a scoped stage. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new case `requires a key on a complete owner whose stage declares a scope`).
- [Reviewer] Confirmed as far as the suggestion goes: `verifyResultFreshness` reports `gate.result-unkeyed` at error severity when a complete owner's pass has no key and `declaredScope` resolves to the stage scope or the owner fallback (`gates.freshness.module.ts:46-75`), and the new gates case passes. The fabricated-green impact is not fully closed because a record that *does* carry a key but no scope skips freshness entirely; that distinct trigger is filed as F12.

### F8 — Run states are never pruned, and every fingerprint change adds one that `status` and every poll must read

- Severity: Minor
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:331-348`, `packages/specs/src/modules/scheduler/scheduler.module.ts:616-621`, `packages/specs/src/modules/scheduler/scheduler.module.ts:890-906`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: the run key embeds the input fingerprint, so every input change creates a new `.agents/@montflow/.runtime/runs/<hash>.json`; nothing ever removes a run state (only the temp file is removed). `listRunStates` reads and JSON-parses every `*.json` on every `step()` and every 50ms waiter poll, and `runSummary`/`status` renders every state ever recorded (the scheduler test even asserts a passed run appears in the panel). Over a workspace's edit history this grows without bound.
- Impact: `gate run` and `status` slow down linearly with the number of historical keys, and `status` output grows without limit, hiding the live runs the panel is for.
- Suggestion: prune terminal states older than a TTL (or collapse to the latest state per key plus a recent window) when writing a new state, and bound the `status` panel to live plus recently terminal runs.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Run states are bounded. `packages/specs/src/modules/scheduler/scheduler.module.ts:413-432` adds `pruneRunStates` (one-day TTL, newest 50 kept) called after the terminal write at `:822`; `packages/specs/src/modules/scheduler/scheduler.summary.module.ts` renders live runs plus the 20 most recent terminal ones, so `status` and every poll no longer grow with the edit history. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (new case `prunes old terminal states and keeps live ones`).
- [Reviewer] Confirmed. `pruneRunStates` (`scheduler.module.ts:413-431`) drops terminal states past the one-day TTL while keeping the newest 50 and never touches a live state; `finish` calls it after the terminal write (`:821-822`). `runSummary` slices the terminal window to `RUN_PANEL_TERMINAL_LIMIT` (20) at `scheduler.summary.module.ts:43-58`. `prunes old terminal states and keeps live ones` passes.

### F9 — Drift markers are bare tokens that survive deletion of the rule they are meant to protect

- Severity: Minor
- Location: `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:126-158`, `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:403-408`
- Status: In Review
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

### F10 — Orchestrator guidance claims `heavy.inFlight` bounds dispatch concurrency, but that bound only exists inside `gate run`

- Severity: Minor
- Location: `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:39-46`, `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:193`, `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:213`, `packages/specs/prompts/spec-execute.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 005
- Problem: the profile says the workspace in-flight bound (`gate.json` `heavy.inFlight`, default 2) "limits concurrency" and, again, that "`depends-on` and the workspace in-flight bound already decide what may run". The bound is enforced only by `scheduleRun`'s counting of `state: "running"` run files; nothing counts subagent sessions, and the worker profile forbids workers from running gates at all, so the bound never applies to dispatch. The real dispatch bound is `depends-on` alone.
- Impact: an orchestrator can dispatch an unbounded ready set believing a cap protects the machine; the worker's own scoped checks are outside the scheduler, so the oversubscription the phase is meant to prevent still happens. This is guidance drifting from the implementation, exactly the E003 responsibility.
- Suggestion: state that `depends-on` alone bounds the ready set, and that `heavy.inFlight` bounds only concurrent `gate run` attempts (heavy plus the global cap). If a dispatch bound is intended, implement it in the dispatch path and name its mechanism.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Orchestrator guidance now names the real dispatch bound. `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:42-45,192-194,213` says `depends-on` alone decides what may run and `heavy.inFlight` caps only concurrent `gate run` attempts; `packages/specs/prompts/spec-execute.json` (dispatch section) matches. Installed copies were refreshed with `mf-profiles doctor`/`mf-specs doctor` after regenerating the embedded payloads. Verified: `bun run --cwd packages/specs test -- src/modules/prompt/tests/lean-contract.test.ts` (86 passed), `bun run --cwd packages/profiles test` (202 passed).
- [Reviewer] Confirmed. `spec-execution-orchestrator/PROFILE.md:42-45` now says readiness encodes `depends-on` alone and that `heavy.inFlight` "bounds only concurrent `gate run` attempts; it does not cap dispatched workers", with the same statement in the findings list (`:192-194`) and the step-economy bullet (`:213`); `spec-execute.json`'s dispatch section says the same. Installed copies are byte-identical (the lean-contract test asserts that) — `... test -- src/modules/prompt/tests/lean-contract.test.ts` → 86 pass and `bun run --cwd packages/profiles test` → 202 pass.

### F13 — `gate run --scope` records a scope the freshness check then rejects, so the documented override leaves a permanent `gate.stale-result`

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.gate.run.module.ts:768`, `packages/specs/src/apps/cli/cli.gate.run.module.ts:829-831`, `packages/specs/src/modules/gates/gates.freshness.module.ts:82-98`, `packages/specs/src/modules/gates/gates.module.ts:868-885`
- Status: In Review
- Attempts: 1
- First Seen: 006
- Problem: `gate run --scope <list>` overrides the stage/owner scope for that invocation and writes the override into the record's `scope` and `key` (`cli.gate.run.module.ts:768,829-831`). F2's fix then requires the record scope to equal the declared scope exactly (`gates.freshness.module.ts:82-98`, `gates.module.ts:868-885`), so **any** override on a stage that resolves a scope produces a `gate.stale-result` error. Both directions fail: a narrowing `--scope app2` on a stage declaring `scope: app` (the sequence recorded by `gate-scheduler.test.ts:436-441`), and a widening `--scope packages/specs,packages/core` on a stage declaring `packages/specs`, which covers the declared scope but is not equal. Probed: declared `['repo']`, record `['packages/specs']`, key already matching the recomputation → one `gate.stale-result` ("stage declares 'repo'").
- Impact: the documented override (C4, README `--scope`) leaves the spec's `check` red — an error, not a warning — until the heavy command is run a second time without the override, and a pass that proves more than the stage asked for is rejected. F2's own suggestion allowed "equal (or cover)".
- Suggestion: accept a record whose scope covers the declared scope (`scopeContains(record.scope, declared)`), and either refuse a narrowing override at run time as `gate.invalid-scope` or record the declared scope separately and treat the override as a non-proof. Add a `check` assertion to the `honors --scope` test.

#### Discussion

<!-- Append-only. Each turn prefixed by its role tag. -->

- [Reviewer] The exact-equality comparison is the cause; the key recomputation itself is correct, so this can never be fixed by re-running the same override. The repo's own gate-scheduler test records exactly such an override and never checks the resulting spec.
- [Fixer] A covering scope is now accepted and a narrowing override is refused before it can record. `packages/specs/src/modules/scheduler/scope.module.ts:55-78` hosts `scopeContains`/`scopesOverlap` (structure re-exports them); `packages/specs/src/modules/gates/gates.freshness.module.ts:104` and `gates.module.ts:882` use `scopeContains(record.scope, declared)`; `packages/specs/src/apps/cli/cli.gate.run.module.ts:768-822` resolves the declared scope separately and fails a non-covering `--scope` as `gate.invalid-scope` before fingerprinting. The `honors --scope` test now records a widening `app` over a stage declaring `app/sub`, asserts `check` has no `gate.stale-result`, and asserts a disjoint override is refused (`packages/specs/src/apps/cli/tests/gate-scheduler.test.ts:425-456`). Verified: `bun run --cwd packages/specs test -- src/apps/cli/tests/gate-scheduler.test.ts` (22 passed).

### F14 — The Phase E records still describe the pre-fix verifier

- Severity: Minor
- Location: `.agents/@montflow/specs/montflow-spec-standard/E/E001-decide-parallel-execution-contract/MEMORY.md:27`, `.agents/@montflow/specs/montflow-spec-standard/E/E002-implement-verification-scheduler/MEMORY.md:41`, `.agents/@montflow/specs/montflow-spec-standard/E/E002-implement-verification-scheduler/MEMORY.md:58-61`, `.agents/@montflow/specs/montflow-spec-standard/E/E003-teach-parallel-phase-authoring/MEMORY.md:47`
- Status: In Review
- Attempts: 1
- First Seen: 006
- Problem: E001's normative C6 still says `gate.result-unkeyed` is a warning and "a complete owner is exempt", while `gates.freshness.module.ts:62-74` now reports an error for a complete owner whose stage resolves a scope. E002's findings repeat "complete owners exempt" (`:41`) and its Open Questions still say the C2 checks and `write-scope` generation "are not implemented here" (`:58-61`), although F5 shipped both. E003's last Finding says "only `gate.scope-missing` exists in current `check`" (`:47`).
- Impact: the phase's decision record contradicts the code it governs, so the next implementer reads C6 and believes a completed owner can carry an unkeyed pass, and reads E002/E003 and believes four of the five contract codes are still missing. `packages/specs/README.md:465-472` already describes the shipped behaviour, so the records are the only stale truth.
- Suggestion: amend C6, E002's unkeyed bullet and open question, and E003's last Finding to the shipped behaviour (error on a scoped complete owner; all five codes implemented; generators write `write-scope:`).

#### Discussion

<!-- Append-only. Each turn prefixed by its role tag. -->

- [Reviewer] Found by diffing the phase records against the shipped code paths cited in F5/F7; `check` itself does not read these prose records, so nothing flags the drift.
- [Fixer] Applied by the orchestrator, not by this fixer: no `.agents/@montflow/specs/**` path was edited in this attempt. The records now describe the shipped behaviour at `.agents/@montflow/specs/montflow-spec-standard/E/E001-decide-parallel-execution-contract/MEMORY.md` (C6: `gate.result-unkeyed` is an error on a complete owner whose stage declares a scope, legacy unscoped stage exempt; `gate.stale-result` also covers a recorded scope that no longer matches the stage's declared scope), `E/E002-implement-verification-scheduler/MEMORY.md` (the "complete owners exempt" wording is gone and the Open Question records that all five C2 codes and `write-scope:` generation shipped), and `E/E003-teach-parallel-phase-authoring/MEMORY.md` (all five codes fire). No code or test change was needed for this finding.

### F15 — A stray JSDoc swallows a duplicated `gateExitCode` and documents it as the subjective-verdict recorder

- Severity: Nit
- Location: `packages/specs/src/apps/cli/cli.gate.run.module.ts:929-939`
- Status: In Review
- Attempts: 1
- First Seen: 006
- Problem: the `recordGateVerdict` doc block ("Record one subjective verdict … `@returns the recorded verdict`") at `:929-933` is never closed; the `*/` on line 937 closes it, so the first `export const gateExitCode` (`:934-935`) is dead text inside the comment and the live declaration at `:938` is undocumented while its hover shows the other function's doc.
- Impact: a duplicated exported-looking declaration and a comment that describes a different module. `tsc`, oxlint, and the tests all stay quiet because the duplicate is inert, so the next reader edits the dead copy.
- Suggestion: delete `:929-936` (the stray comment and the dead declaration) and keep one documented `gateExitCode`.

#### Discussion

<!-- Append-only. Each turn prefixed by its role tag. -->

- [Reviewer] `tsc --noEmit` and the gate tests pass precisely because the first declaration is commented out; the doc above it still claims to document a subjective-verdict writer that lives in `cli.gate.record.module.ts`.
- [Fixer] The stray JSDoc and dead duplicate are gone. `packages/specs/src/apps/cli/cli.gate.run.module.ts:948-951` now keeps one documented `gateExitCode`; the unclosed `recordGateVerdict` block and the commented-out first declaration were deleted. Verified: `bun run --cwd packages/specs ts:check`, `bun run --cwd packages/specs test -- src/apps/cli/tests/gate.test.ts` (passed).

## Summary

- Critical: 0
- Major: 7
- Minor: 7
- Nit: 1
- Open: 0
- In Review: 7
- Resolved: 8
- Won't Fix: 0
- Escalated: 0
