# GATES

## Stage 0: Reconcile

- [ ] `git log` and `MEMORY.md` name every `spec-optimizations` capability kept and every main-only change overridden
- [ ] Every spec in the store sits under a phase directory with task directories inside

## Stage 1: Derived state

- [ ] `rg "locked-phases"` finds no live code, prompt, skill, or fixture reader
- [ ] `rg "099-review-phase"` finds no required-task check, prompt, or skill instruction
- [ ] `mf-specs status`, `state`, and `next` derive the same active phase and lock state for this spec
- [ ] `size: none` is accepted on a complete task and rejected on an unfinished task, with a test for both

## Stage 2: Surfaces

- [ ] `mf-specs check` passes for every migrated spec
- [ ] The TUI picker lists only directories containing `SPEC.md`, proven by a test with phase directories present
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass
