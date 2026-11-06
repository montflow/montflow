# GATES

## Stage 0: Static

- [ ] `spec-status.json` declares `name` as a required `source: specs` variable and the template consumes it
- [ ] the prompt is listed in `payload.json`, `SPEC_PROMPT_NAMES`, the embedded payload, and the installed prompts directory
- [ ] the template reads state from `status` / `state` / `next` / `check` and never defines a lock or ready-set rule itself
- [ ] the template contains no write, lock, status-transition, dispatch, or git-mutation instruction

## Stage 1: Behaviour

- [ ] `mf-prompts verify spec-status` passes and `mf-specs doctor --check` reports the installed copy current
- [ ] a rendered report carries the declared status, derived state, active phase, locks, task counts, review budget, ready set, verification result, and next command
- [ ] an `inconsistent` or blocked spec renders its code and repair command; a complete spec claims no pending work
- [ ] the picker preselects the branch guess and orders pending specs before complete ones
- [ ] every installed prompt and every spec in the store still checks clean

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/modules/prompt src/modules/doctor

- [ ] the scoped package suite for this task passes
