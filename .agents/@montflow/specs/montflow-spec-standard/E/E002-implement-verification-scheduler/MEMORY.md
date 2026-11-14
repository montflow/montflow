# Memory

## Context

Implement E001's scheduler inside `packages/specs`: run key
(command+scope+fingerprint), single flight with waiters, pass reuse, heavy lane
plus in-flight cap, lease reclaim, truthful timeout/cancellation, stale green
rejection, and key/lane visibility on `gate run`/`status`/`next`. E003 owns prose.

## Progress

- 2026-11-03: bound `claim --name montflow-spec-standard --task E002`.
- Read profile, TASK/GATES, phase brief, E001 contract, `packages/specs` source.
- Implemented: new `modules/scheduler` (`scope`, `fingerprint`, `scheduler`),
  `withRuntimeLock` in `claim`, gate scope/lane metadata + freshness verifier in
  `gates`, `write-scope` in `task`, scheduler wiring in `gate run` (split into
  `cli.gate.run.module.ts` / `cli.gate.record.module.ts` for the 1000-line rule),
  stale-green pass in `check`, run panel + gate annotations in `status`/`next`,
  README section, CLI flags.
- Tests: new `modules/scheduler/tests/scheduler.test.ts` (11) and
  `apps/cli/tests/gate-scheduler.test.ts` (10); gate fixture gained `write-scope`.

## Findings

- Key = `gate-v1:` + sha256(`normCommand\nsortedScopes\nfingerprint`); the
  fingerprint walks each scope and skips `.git`, `node_modules`, `.turbo`,
  `dist`, `build`, `coverage`, `.agents/@montflow/.runtime`, and every
  `GATE-RESULTS.jsonl`, so appending a result cannot invalidate its own key.
- Single flight is cross-process: state per key under `.runtime/runs`, one
  `runs.lock` (`withRuntimeLock`), temp-then-rename writes. Waiters register,
  poll, and read the owner's record by `resultIndex`.
- Reuse only for `passed` with the same key/fingerprint; failures, timeouts, and
  cancellations rerun. `--no-reuse` forces. Changed inputs -> new key.
- Lane: heavy by default for suite/typecheck/build/lint/fmt/mf-specs gate;
  `--lane`/`lane:` override. Heavy 1, in-flight 2, lease 60s, heartbeat 10s, wait
  900s from `gate.json`, all overridable; `<1` is `gate.invalid-config`.
- Reclaim on a past `leaseExpiresAt` or dead pid. Timeout writes `state:
  timeout`/exit 124; interruption writes `cancelled`/exit 130; neither is a pass.
- `check` recomputes each keyed pass per owner: mismatch -> `gate.stale-result`
  (error, names owner/stage/stored+current key); unkeyed pass on an unfinished
  owner -> `gate.result-unkeyed` (warning); on a complete owner whose stage
  declares a `scope:` that same pass is an error, and only a legacy stage with
  no declared scope stays exempt.
- `next` appends `gate task-local <scope>` and the phase head
  `phase-gate <kind> repo · shared once at boundary`; `status` adds `runs <n>
  in-flight · <n> queued · <n> stale` plus per-run lines; `gate run` prints
  waiting/reclaimed/key/scope/lane/waited/ran|reused/fingerprint.
- Scope resolves `--scope` -> stage `scope:` -> task `write-scope` -> `repo`
  (phase); none at all is `gate.scope-missing`. A run-time `--scope` that does
  not cover the stage's declared scope is refused `gate.invalid-scope` before
  any stage runs, and a recorded scope that covers the declared scope satisfies
  freshness while a non-covering one is `gate.stale-result`.

## Gates

- Scoped checks only (official gate left to orchestrator): `test` 140 files /
  1937 tests passed, `ts:check` 0, `lint:check` 0, `format:check` clean. Full
  log `/tmp/E002.log`.
- New coverage: one execution for two requesters, reuse of a pass, rerun on a
  fingerprint change, lane bound + override, light bypass, in-flight cap, wait
  timeout, lease reclaim, timeout-not-pass, failure-not-reused, stale green.

## Open Questions

- None blocking. C2's `task.write-scope-missing` /
  `phase.write-scope-overlap` / `phase.serial-chain-unexplained` /
  `gate.shared-check-in-task` / `gate.duplicate-command` checks and the
  `write-scope:` field in `new-task`/`init`/`create` shipped later in this phase
  (`structure.parallel.module.ts`, `structure.module.ts`, the generator modules),
  so E001's C2 assignment is closed.

## Handoff

- E003 can teach the flags, key line, lane config, and reuse semantics from
  README `## Verification scheduler`.
- Review: lane heuristic coverage, `check` fingerprint cost, lease deviation.

## Deviations

- Lease reclaim uses lease expiry and dead pid only; C8's "released claim for
  its session" clause is not wired (run state stores no spec id, and a claim
  check would reclaim a live in-process owner in tests). A released claim is
  reclaimed at lease expiry instead.
- Record append index counts lines before appending without a cross-key lock; a
  simultaneous append by another key could collide on `resultIndex` (the pass is
  still truthful; only waiter lookup could read the neighbouring line).
  `gate run` lines moved to `cli.gate.run.module.ts` for the 1000-line rule.
