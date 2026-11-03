---
id: E003
name: teach-parallel-phase-authoring
type: execution
originator: planner:E001
size: medium
depends-on: E001, E002, D001, C007
related-tasks:
status: pending
---

# Task E003: teach parallel phase authoring

## Type: execution

## Description

The contract and the scheduler are worth nothing if the authoring flow still
writes serial phases and every worker still runs the whole suite. Teach the
parallel shape where phases are authored, teach the channel protocol where work
is dispatched, and teach the scheduler where gates are run. This is the task
that makes "maximize the ready set" and "one shared check, run once" the default
instead of something an agent has to rediscover.

## Requirements

- The `montflow-create-specs` skill and the shipped `spec-create` prompt add a
  phase-planning rule: list the tasks that can run at once, give each a declared
  write scope, use `depends-on` only for a real data or ordering dependency, and
  split a phase whose tasks would collide on the same paths.
- The same authoring artifacts add the two gate layers: a task gate names
  commands scoped to that task; phase-shared and repo-wide checks are named once
  at the phase level and are never copied into a task gate.
- The `spec-execute` prompt and the `spec-execution-orchestrator` profile dispatch
  the full ready set concurrently, state that `BOARD.md` is broadcast and
  `MAILBOX.md` targeted, read the mailbox at start and before a receipt, and run
  phase-shared verification once through the scheduler instead of once per
  worker. The `spec-worker` profile reads the board and mailbox at start and
  before returning, and never launches a heavy shared check its own gate does not
  name.
- The `spec-appraiser` and `spec-creation-orchestrator` profiles name the
  independent tasks and the shared checks in the plan they return, so a serial
  phase is a stated decision rather than an accident.
- The README and the affected skills document the parallel phase rule, the
  write-scope rule, the channel protocol, the run key, lane, and reuse behavior.
- Package and workspace skill copies stay byte-identical, the doctor payloads
  match the package bytes, and a test fails when the parallel or scheduler
  guidance is removed from the prompt and skill.
- The change adds no new `mf-specs check` finding to any spec.

## Completion

- [ ] The authoring skill and prompt require a parallel ready set, declared write scopes, and real dependencies only
- [ ] The authoring skill and prompt split task-local gates from phase-shared checks
- [ ] The execution prompt and both orchestrator/worker profiles use the board, mailbox, and scheduler correctly
- [ ] A serial phase is explained by the appraiser instead of being the default
- [ ] README documents the phase shape, channel protocol, and run key/lane/reuse behavior
- [ ] A test covers the authoring and execution guidance and fails when it is removed
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf:check` pass
