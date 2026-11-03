---
id: E001
name: decide-parallel-execution-contract
type: planning
originator: user
size: medium
depends-on: B003, B004, C002, C003
related-tasks: E002, E003
status: pending
---

# Task E001: decide the parallel execution contract

## Type: planning

## Description

Phases are still authored as serial task lists. A phase that could expose four
independent tasks is written as four steps, so the ready set is one task wide,
sub-agent dispatch runs one worker at a time, and the board and mailbox channels
C003 ships have no protocol telling anyone when to use them. Verification has
the opposite failure: every worker runs its own copy of a heavy command, so two
or three agents typecheck or run the same suite at once and the machine thrashes
while the results are identical. Decide the contract that fixes both: a phase
shape that maximizes the ready set, a channel protocol that speeds handoffs
without replacing dependencies, and one verification scheduler that scopes each
run to its own work and reuses an identical result instead of launching it
twice.

## Requirements

- **Phase shape.** A phase is authored as a wide ready set where the work allows:
  tasks are independent unless a real data or ordering dependency exists, and
  `depends-on` holds only that dependency. A phase that is one serial chain must
  state why. Each task declares the paths or packages it will write, so two
  concurrent tasks cannot silently touch the same file.
- **Write-scope rule.** Two tasks in one phase with overlapping write scopes must
  either carry a `depends-on` edge or be split; the rule is mechanical where the
  verifier can compare declared scopes and judgment only where it cannot.
- **Two gate layers.** A task gate names commands scoped to that task's own write
  scope. A phase gate names the shared or repo-wide checks and runs once at the
  phase boundary, owned by the orchestrator. A task gate never copies a
  repo-wide suite, and a shared check is never run once per worker.
- **Run identity.** A verification run is keyed by command plus scope plus an
  input fingerprint (the files or packages the command reads), never by task or
  agent. The same key means the same work and must not run concurrently.
- **Single flight and reuse.** At most one run per key is in flight. A second
  requester waits and consumes the recorded result instead of launching. A
  passing result is reusable while its fingerprint is unchanged; any input change
  reruns; a failure is never reused as a pass; a stale or fabricated green is
  rejected.
- **Bounded lanes.** Heavy commands (test, typecheck, build, repo-wide checks)
  take a bounded lane, default one at a time, with a global in-flight cap. Light
  checks do not take the lane. A waiting requester sees that it is waiting and
  for which key.
- **Lease and recovery.** A run records its owner and expires its lease when the
  owner disappears, so a crashed worker cannot leave a key blocked forever.
- **Channel protocol.** `BOARD.md` carries broadcast facts, `MAILBOX.md` carries
  targeted questions and answers; live delivery steers the bound session and an
  absent target queues until it starts. A channel never substitutes for a
  `depends-on` edge: a real need between siblings becomes a dependency. Workers
  read the board and their mailbox at start and before returning a receipt.
- **Visibility.** `next` marks each gate as task-local or phase-shared with its
  scope; `gate run` prints the key, lane wait, and whether it ran or reused;
  `status` shows in-flight and queued runs; `check` names a green that does not
  match its current fingerprint.
- The contract is written to `MEMORY.md` with the exact key grammar, record
  shape, lane defaults, flags, and output fields, sufficient for E002 and E003 to
  implement without asking anything. It reuses C002's `gate run` and C003's
  board/mailbox grammar; it does not define a second scheduler or a second
  channel.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] `MEMORY.md` carries the phase-shape rule, write-scope rule, key grammar, lane defaults, reuse and invalidation rule, lease recovery, channel protocol, and output fields
- [ ] Every rule names where it is enforced (`check`, `gate run`, `next`, or the authoring skill) or is explicitly judgment
- [ ] The task-local versus phase-shared gate split is unambiguous enough to test directly
- [ ] The contract names C002's `gate run` and C003's channels as the only mechanisms, with no duplicate
