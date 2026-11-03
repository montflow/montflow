# GATES

## Stage 0: Authoring guidance

- [ ] The create-specs skill and `spec-create` prompt require a parallel ready set and declared write scopes
- [ ] They use `depends-on` only for a real dependency and split colliding phases
- [ ] They name task-local gates and phase-shared checks as two layers, with no repo-wide gate copied into a task

## Stage 1: Execution guidance

- [ ] `spec-execute` dispatches the full ready set concurrently
- [ ] The execution orchestrator uses `BOARD.md` for broadcast and `MAILBOX.md` for targeted delivery
- [ ] The worker reads the board and mailbox at start and before its receipt
- [ ] Shared verification runs once through the scheduler, not once per worker

## Stage 2: Proof

- [ ] The appraiser and creation orchestrator name the independent tasks and shared checks in the plan
- [ ] README documents the phase shape, channels, and run key/lane/reuse
- [ ] Package, workspace, and doctor payload copies agree and `doctor --check` is silent
- [ ] A test fails when the parallel or scheduler guidance is removed
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf:check` pass

## Stage 3: Package proof (mechanical)
command: bun run --cwd packages/specs test

- [ ] the scoped package suite for this task passes
