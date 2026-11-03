---
id: E002
name: implement-verification-scheduler
type: execution
originator: planner:E001
size: large
depends-on: E001, C002, C005
related-tasks: E003
status: pending
---

# Task E002: implement the verification scheduler

## Type: execution

## Description

Implement the contract E001 decides inside the existing `gate run` path. A run
is keyed by command, scope, and input fingerprint; one key runs at most once at
a time; a second requester waits and reuses the recorded result; heavy commands
take a bounded lane so parallel workers cannot oversubscribe the machine; and
`check` refuses a green whose fingerprint no longer matches. This is a scheduler
over C002's recorder, not a second gate system.

## Requirements

- `gate run` accepts the scope E001 defines, computes the run key, acquires a
  single-flight lease, and records the owner, command, scope, fingerprint,
  status, exit code, duration, and whether the result was reused.
- A second requester for an in-flight key waits for the first and returns its
  result; it never launches a duplicate. A passing result is reused while the
  fingerprint matches, and any input change reruns. A failure is never returned
  as a pass.
- Heavy commands take a bounded lane, default one at a time, configurable; light
  checks bypass the lane. A global in-flight cap applies across keys.
- A lease expires when its owner disappears, and the next requester takes over;
  a cancelled or timed-out run records that state rather than a green.
- `next` marks each gate as task-local or phase-shared with its scope. `status`
  and `gate run` output show the key, lane wait, queue position, and reused
  source; `check` reports a green that does not match its current fingerprint.
- Phase-shared gates run once at the phase boundary; task-local commands stay
  scoped to the task's declared write scope.
- Tests cover two concurrent requesters producing one execution, reuse of a
  matching pass, rerun after a fingerprint change, the lane bound, a failure that
  is not reused as a pass, lease expiry, and `check` rejecting a stale green.
- The CLI help, README, and error codes describe the new flags and states; no
  prompt or skill prose is changed here (E003 owns the guidance).

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] Two concurrent requesters for one key produce one real execution and two consumers, proven by a run
- [ ] A matching pass is reused, a changed fingerprint reruns, and a failure never returns as a pass
- [ ] The heavy lane admits one run by default and a config override is honored
- [ ] An expired lease is reclaimed and a cancelled run records no pass
- [ ] `check` fails a green whose fingerprint is stale, with a coded diagnostic
- [ ] `next`, `status`, and `gate run` expose the key, lane, and reused source
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass
