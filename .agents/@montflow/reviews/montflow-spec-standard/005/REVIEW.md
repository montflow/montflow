# Review: montflow-spec-standard / 005

## Metadata

- Target: Phase E — E001 parallel execution contract, E002 verification scheduler, E003 parallel authoring guidance
- Round: 005
- Phase: E
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: open
- Created: 2026-11-03

## Findings

### F1 — A forced or retried run silently consumes the old record when a lane/in-flight slot is busy

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:783-807`, `packages/specs/src/modules/scheduler/scheduler.module.ts:622-627`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: when `step()` returns `wait` for `lane` or `in-flight`, the loop sleeps once and then consumes **any** terminal run state for the key that carries a `resultIndex` (lines 798-807). It never checks that the requester was waiting on a live attempt or that the state is newer than the request. Trigger: key K already has a terminal state (a prior pass, or a prior failure); `gate run --no-reuse` (or a retry of the failed key) is issued while another heavy run holds the single heavy lane (`lanes: 1`, default). `step()` skips reuse because `reuse=false`, is not a key waiter because the state is terminal, waits on the lane, then the first poll returns the **old** record through `consume` (lines 716-742) with `reused: true` and appends another `reused: true` record. Nothing was executed.
- Impact: `--no-reuse` (documented as "forces a run" in `packages/specs/README.md:411-412` and contract C6) silently does not run. A retry after a transient failure returns the stale failure, and a suspect pass is reported as a valid reused pass. This is also the one path where an outcome is produced without a run against the current inputs — by design the key means the inputs are the same, but the operator explicitly asked for a fresh execution.
- Suggestion: consume in the wait loop only when this requester registered as a waiter against the live attempt it observed (track the attempt count seen when the wait started), or only when `request.reuse` is true and the state is a pass. For lane/in-flight waits, drop the terminal-consume shortcut and re-enter `step()`; `step()` already handles reuse and terminal states correctly.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Lane/in-flight waits now re-enter `step()` instead of consuming a terminal state; a key waiter consumes only the attempt it registered against. `packages/specs/src/modules/scheduler/scheduler.module.ts:685` records `observedAttempt` and `:914-923` guards the consume on `lastPhase === 'key'`, `current.waiters.includes(...)`, and the observed attempt count. A `--no-reuse` request or a retry while the heavy lane is busy now runs. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (28 passed, new case `--no-reuse does not consume an old record while a lane is busy`).

### F2 — `check` recomputes freshness from the record's own scope, so a later pass under a different scope hides the stale one

- Severity: Major
- Location: `packages/specs/src/modules/gates/gates.module.ts:832-869`, `packages/specs/src/apps/cli/cli.check.module.ts:333-366`, `packages/specs/src/apps/cli/cli.gate.run.module.ts:767`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: `verifyResultFreshness` iterates `latestResults` (latest record per stage) and recomputes the key with `gateKey(record.command, record.scope, fingerprint)` (check module lines 356-363), i.e. always from the scope recorded in the record. Nothing compares that scope with the stage's declared `scope:` line or the owner's fallback scope (`stageScope(stage) ?? ownerScope`), and `verifyGateResults` compares only `command` and `kind` (gates module lines 933-960). Trigger: a stage declares `scope: packages/specs` (or `repo`) and records a pass under key A. Inputs change, so A is stale. A rerun with `--scope packages/core` (explicitly allowed to override a stage's scope, C4, and used in `gate-scheduler.test.ts:436-441`) records pass B. `latestResults` makes B effective, B recomputes green against `packages/core`, and the stale A is never evaluated. The change to `packages/specs` is invisible.
- Impact: a stale green passes `check` exactly when a later pass uses a differing scope — the audit's "newer pass under a DIFFERENT scope" case. A missing or misspelled stage scope is equally undetectable, so `gate.stale-result` only proves the record agrees with itself.
- Suggestion: resolve the stage's declared/owner scope when checking freshness and require the record scope to equal (or cover) it; report a mismatch as `gate.stale-result` (or `gate.scope-missing`) instead of recomputing against the record's claim. At minimum, use the declared scope to validate `record.scope` in `verifyGateResults`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Freshness is recomputed against the stage's declared scope, never the record's own claim. `packages/specs/src/modules/gates/gates.freshness.module.ts:21-24,41-108` adds `declaredScope` and reports a scope mismatch as `gate.stale-result`; `packages/specs/src/apps/cli/cli.check.module.ts:361-400` resolves `stageScope(stage) ?? owner fallback` per record; `packages/specs/src/modules/gates/gates.module.ts:862-885` validates a declared stage scope in `verifyGateResults` too. A later pass under `packages/core` can no longer hide a stale pass for a stage declared `packages/specs`. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new case `rejects a pass recorded under a scope the stage no longer declares`).

### F3 — `heartbeatSeconds >= leaseSeconds` is accepted, letting a live owner's lease expire and a second requester double-run the key

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:99-156`, `packages/specs/src/modules/scheduler/scheduler.module.ts:379-384`, `packages/specs/src/modules/scheduler/scheduler.module.ts:828-864`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: `parseGateConfig` validates each bound is an integer >= 1 but never validates `heartbeatSeconds < leaseSeconds`. `leaseOf` sets `leaseExpiresAt = now + leaseSeconds`, while `heartbeatLoop` renews only after its first `sleep(heartbeatSeconds)`. With `{"leaseSeconds":5,"heartbeatSeconds":10}` (accepted without a problem), the lease expires five seconds before the first renewal. A second requester then finds `leaseExpired` true (`ageMs > 0`) even though `isPidAlive` is true; it marks the attempt `expired`, and the lane/in-flight counts exclude it (`state === 'running' && !leaseExpired`), so it starts attempt 2 while attempt 1 still runs.
- Impact: two executions of the same key and two concurrent heavy commands despite `heavy.lanes: 1` — the single-flight and lane guarantees are config-bypassable. The same window exists whenever the owner is paused/suspended for longer than the lease, because expiry alone overrides a live pid.
- Suggestion: reject `heartbeatSeconds >= leaseSeconds` in `parseGateConfig` as `gate.invalid-config`, and make reclaim require a dead owner or an expired lease **without** a live heartbeat process (or renew the lease before the first sleep and at half the lease interval).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] `parseGateConfig` now refuses `heartbeatSeconds >= leaseSeconds` as `gate.invalid-config`: `packages/specs/src/modules/scheduler/scheduler.module.ts:162-167` pushes the problem so `gate run` never starts a lease that expires before its first renewal. A live owner can no longer have its lease counted expired by a second requester from config alone. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (new assertion for `{leaseSeconds:5,heartbeatSeconds:10}`).

### F4 — `writeRunState` swallows every write error, so the single-flight claim can silently not exist

- Severity: Major
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:306-329`, `packages/specs/src/modules/scheduler/scheduler.module.ts:628-640`, `packages/specs/src/modules/scheduler/scheduler.module.ts:692-711`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: `writeRunState` wraps every step in `Effect.orElseSucceed` and its caller yields it as `void`, so a failed `makeDirectory`, temp write, rename, and fallback write all succeed from the scheduler's point of view. `step()` then returns `{ kind: 'run' }` and executes. If the claim write fails (unwritable/read-only `.agents/@montflow/.runtime`, ENOSPC, a directory in place of the run file), no `running` state exists: another requester sees no state, so it also claims and runs the same key. The lane/in-flight counters cannot see the invisible run either. A failed terminal write has the same shape: waiters never get `resultIndex`, the heartbeat has already stopped, the lease expires, and the key is reclaimed and re-run even though the command completed (and may have appended a record).
- Impact: the one guarantee this phase exists to provide — one run per key, bounded heavy lane — disappears silently under an I/O failure, with no diagnostic.
- Suggestion: make `writeRunState` fallible and have `step()` fail with `gate.write-failed`/`gate.scheduler-lock` when the claim write does not land. For `finish`, surface a failed terminal write instead of swallowing it, and keep the outcome record/state consistent so a waiter cannot hang.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Claim and terminal writes are fallible. `packages/specs/src/modules/scheduler/scheduler.module.ts:326-368` adds `SchedulerWriteError` and `writeRunStateChecked` (best-effort `writeRunState` remains for advisory waiter/heartbeat updates); the claim at `:719-731` and the terminal write at `:790-813` use it, and `finish` propagates the failure. `packages/specs/src/apps/cli/cli.gate.run.module.ts:877-897` maps it to `gate.write-failed`, so an unwritable runtime tree fails the request before executing. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (new case `a failed claim write fails the request instead of running unclaimed`).

### F5 — Contract findings `task.write-scope-missing`, `phase.write-scope-overlap`, `phase.serial-chain-unexplained`, `gate.shared-check-in-task`, `gate.duplicate-command` are taught as `check` output but never implemented

- Severity: Major
- Location: `packages/specs/src/modules/gates/gates.module.ts:31-68`, `packages/specs/src/modules/scaffold/scaffold.module.ts:146-170`, `packages/specs/skills/montflow-create-specs/SKILL.md:183`, `packages/specs/skills/montflow-create-specs/SKILL.md:188`, `packages/specs/skills/montflow-create-specs/SKILL.md:296-299`, `packages/specs/README.md:356-372`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: E001's contract maps C1/C2/C3 to `check` (`C11 Enforcement map`, `MEMORY.md:37`) and says `new-task`/`init`/`create` generate `write-scope` (C2). The diff adds neither: `GATE_CODES` has no entry for four of the five codes, `gate.scope-missing` exists but is emitted only by `gate run`'s refusal (`cli.gate.run.module.ts:770`), never by `check`; `verifySpecTree`/`check` add no scope, overlap, serial-chain, or duplicate-command rule; and `renderTask`/`renderInitTask` emit no `write-scope:` field. Meanwhile the authoring skill, the `spec-create` prompt, and the README now assert these codes fire and that a colliding write scope "is the contract's `phase.write-scope-overlap` error". A fresh `init` tree with no write scopes and two colliding tasks is green. E002's TASK does not list C2/C3 checks, so deferral is plausible — but E003's guidance now claims active enforcement, and no phase record opens a defect for the missing rules.
- Impact: authors trust a verifier that never fires; serial chains, overlapping write scopes, and repo-wide commands copied into a task gate are undetected. The self-check checklist ("Every task declares write-scope … no two unfinished tasks overlap without an edge") cannot fail `check`.
- Suggestion: either implement the five rules and generate `write-scope` in the generators, or remove the claims from the skill/prompt/README and record a defect task that names the deferred codes. The drift test should assert the behavior, not only the string (see F9).

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] The five contract findings are implemented and the generators write the field. `packages/specs/src/modules/structure/structure.parallel.module.ts` owns `task.write-scope-missing` (warning), `phase.write-scope-overlap` (error), `phase.serial-chain-unexplained` (warning), and `gate.duplicate-command`; `structure.module.ts:596-630` emits `gate.scope-missing` (warning) and `gate.shared-check-in-task` for a task stage outside its `write-scope:`. Generators: `packages/specs/src/modules/init/init.module.ts:52,181,688`, `scaffold.module.ts:164`, and `cli.newtask.module.ts:89` emit `write-scope:` (`none` for review/exploratory/planning, `.` for execution work), and `init`/`create` accept a `scope=` token while `new-task` accepts `--write-scope`. README, skill, and prompt now state what fires. Verified: `bun run --cwd packages/specs test -- src/modules/structure/tests/verify-spec-tree.test.ts src/modules/scaffold src/modules/init src/apps/cli/tests/create.test.ts` (behavior tests for each code plus generator output).

### F6 — A deleted or renamed scope makes a keyed pass unverifiable and `check` treats that as green

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.check.module.ts:347-350`, `packages/specs/src/modules/gates/gates.module.ts:852-855`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: `staleResultIssues` caches `undefined` when `fingerprintScopes` reports any missing scope, and `verifyResultFreshness` does `if (currentKey === undefined || currentKey === record.key) continue;`. A record whose scope path no longer exists therefore produces no finding. Trigger: a pass recorded with `scope: packages/specs`, then that directory is renamed/deleted (or the gate declares a path that never existed); `check` reports no `gate.stale-result` and no `gate.scope-missing` for the record.
- Impact: an old green survives the disappearance of the exact inputs it claimed to cover. The code's stated rule "unknowable, not stale" is implemented as "unknowable, therefore accepted".
- Suggestion: when a record's scope cannot be fingerprinted, emit `gate.scope-missing` (or a warning) rather than skipping; only a genuinely unreadable file that is surfaced as a diagnostic may be treated as unknowable.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] A record whose own scope no longer exists is reported instead of skipped. `packages/specs/src/modules/gates/gates.freshness.module.ts:101-108` emits `gate.scope-missing` (warning) when `missingScope` is true; `packages/specs/src/apps/cli/cli.check.module.ts:380-392` tracks which cached scopes were missing. A renamed/deleted scope no longer leaves an unverified green. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new case `reports a pass whose scope disappeared instead of accepting it`).

### F7 — A complete owner's unkeyed pass is exempt, so a hand-written green passes `check --require-complete`

- Severity: Minor
- Location: `packages/specs/src/modules/gates/gates.module.ts:836-850`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: an effective mechanical pass with no `key` is reported as `gate.result-unkeyed` only when the owner is unfinished; a complete owner is skipped entirely. `verifyGateResults` accepts the pass as long as `verdict: "pass"`, `exit: 0`, and `command` equals the stage command (lines 933-960), all trivially copied from `GATES.md`. The exemption is meant for pre-scheduler legacy records, but it applies to records appended after the scheduler ships (no timestamp/release cutoff).
- Impact: a one-line fabricated record makes a completed task or phase green, and the completion gate cannot distinguish it from a real run. The contract requirement "a stale or fabricated green is rejected" is not met for completed work.
- Suggestion: exempt only records that predate the key grammar (e.g. by `at` before a documented cutoff), or require a key on every stage that declares `scope:`; otherwise keep the warning.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] A complete owner's unkeyed pass is now an error when the stage declares a `scope:`; only a legacy stage with no declared scope stays exempt. `packages/specs/src/modules/gates/gates.freshness.module.ts:45-79` uses `declaredScope` to distinguish the two. `check --require-complete` therefore rejects a hand-written one-line pass on a scoped stage. Verified: `bun run --cwd packages/specs test -- src/modules/gates/tests/gates.test.ts` (new case `requires a key on a complete owner whose stage declares a scope`).

### F8 — Run states are never pruned, and every fingerprint change adds one that `status` and every poll must read

- Severity: Minor
- Location: `packages/specs/src/modules/scheduler/scheduler.module.ts:331-348`, `packages/specs/src/modules/scheduler/scheduler.module.ts:616-621`, `packages/specs/src/modules/scheduler/scheduler.module.ts:890-906`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: the run key embeds the input fingerprint, so every input change creates a new `.agents/@montflow/.runtime/runs/<hash>.json`; nothing ever removes a run state (only the temp file is removed). `listRunStates` reads and JSON-parses every `*.json` on every `step()` and every 50ms waiter poll, and `runSummary`/`status` renders every state ever recorded (the scheduler test even asserts a passed run appears in the panel). Over a workspace's edit history this grows without bound.
- Impact: `gate run` and `status` slow down linearly with the number of historical keys, and `status` output grows without limit, hiding the live runs the panel is for.
- Suggestion: prune terminal states older than a TTL (or collapse to the latest state per key plus a recent window) when writing a new state, and bound the `status` panel to live plus recently terminal runs.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Run states are bounded. `packages/specs/src/modules/scheduler/scheduler.module.ts:413-432` adds `pruneRunStates` (one-day TTL, newest 50 kept) called after the terminal write at `:822`; `packages/specs/src/modules/scheduler/scheduler.summary.module.ts` renders live runs plus the 20 most recent terminal ones, so `status` and every poll no longer grow with the edit history. Verified: `bun run --cwd packages/specs test -- src/modules/scheduler/tests/scheduler.test.ts` (new case `prunes old terminal states and keeps live ones`).

### F9 — Drift markers are bare tokens that survive deletion of the rule they are meant to protect

- Severity: Minor
- Location: `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:126-158`, `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:403-408`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: `AUTHORING_MARKERS` matches `/write-scope:/`, `/phase-shared/i`, and `/gate\.shared-check-in-task/` anywhere in the flattened text. `montflow-create-specs/SKILL.md` contains `write-scope:` six times and `phase-shared` six times, including the Reference and self-check sections. Deleting the "Author the Widest Ready Set" rule paragraph (or the two-gate-layer rule, or the code sentence) leaves the other occurrences, so the canonical-marker test and the per-marker mutation test stay green — the mutation only replaces **all** occurrences. The test proves a token exists, not that the rule does.
- Impact: E003's requirement "a test fails when the parallel or scheduler guidance is removed" is met only for a total erasure of the token; the actual rule can silently disappear while the suite stays green, and the test also locks in the unimplemented code claims from F5.
- Suggestion: anchor each marker to a sentence-level phrase that only the rule carries (the `write-scope`/overlap/dependency sentence, the two-gate-layer sentence, the exact code assertion), or assert on the body of a named section rather than a bare token.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Drift markers now anchor to the rule sentence, not a bare token. `packages/specs/src/modules/prompt/tests/lean-contract.test.ts:126-158` matches the write-scope/overlap sentence, the phase-shared "named once, in the phase `GATES.md`" sentence, and the exact `gate.shared-check-in-task` clause; the `serial-reason` marker anchors to "A serial chain is a stated decision". Each mutation rewrites that sentence, so deleting the rule fails the suite. Behavior itself is asserted in the new structure tests from F5, not only the strings. Verified: `bun run --cwd packages/specs test -- src/modules/prompt/tests/lean-contract.test.ts` (86 passed).

### F10 — Orchestrator guidance claims `heavy.inFlight` bounds dispatch concurrency, but that bound only exists inside `gate run`

- Severity: Minor
- Location: `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:39-46`, `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:193`, `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:213`, `packages/specs/prompts/spec-execute.json:4`
- Status: In Review
- Attempts: 1
- First Seen: 005
- Problem: the profile says the workspace in-flight bound (`gate.json` `heavy.inFlight`, default 2) "limits concurrency" and, again, that "`depends-on` and the workspace in-flight bound already decide what may run". The bound is enforced only by `scheduleRun`'s counting of `state: "running"` run files; nothing counts subagent sessions, and the worker profile forbids workers from running gates at all, so the bound never applies to dispatch. The real dispatch bound is `depends-on` alone.
- Impact: an orchestrator can dispatch an unbounded ready set believing a cap protects the machine; the worker's own scoped checks are outside the scheduler, so the oversubscription the phase is meant to prevent still happens. This is guidance drifting from the implementation, exactly the E003 responsibility.
- Suggestion: state that `depends-on` alone bounds the ready set, and that `heavy.inFlight` bounds only concurrent `gate run` attempts (heavy plus the global cap). If a dispatch bound is intended, implement it in the dispatch path and name its mechanism.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

- [Fixer] Orchestrator guidance now names the real dispatch bound. `packages/profiles/profiles/spec-execution-orchestrator/PROFILE.md:42-45,192-194,213` says `depends-on` alone decides what may run and `heavy.inFlight` caps only concurrent `gate run` attempts; `packages/specs/prompts/spec-execute.json` (dispatch section) matches. Installed copies were refreshed with `mf-profiles doctor`/`mf-specs doctor` after regenerating the embedded payloads. Verified: `bun run --cwd packages/specs test -- src/modules/prompt/tests/lean-contract.test.ts` (86 passed), `bun run --cwd packages/profiles test` (202 passed).

## Summary

- Critical: 0
- Major: 5
- Minor: 5
- Nit: 0
- Open: 0
- In Review: 10
- Resolved: 0
- Won't Fix: 0
- Escalated: 0
