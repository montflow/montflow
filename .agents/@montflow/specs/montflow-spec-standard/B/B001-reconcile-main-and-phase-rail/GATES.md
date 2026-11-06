# GATES

## Stage 0: Reconcile

- [x] `git log` and `MEMORY.md` name every `spec-optimizations` capability kept and every main-only change overridden
- [x] Every spec in the store sits under a phase directory with task directories inside

## Stage 1: Derived state

- [x] `rg "locked-phases"` finds no live code, prompt, skill, or fixture reader
- [x] `rg "099-review-phase"` finds no required-task check, prompt, or skill instruction
- [x] `mf-specs status`, `state`, and `next` derive the same active phase and lock state for this spec
- [x] `size: none` is accepted on a complete task and rejected on an unfinished task, with a test for both

## Stage 2: Surfaces

- [x] `mf-specs check` passes for every migrated spec
- [x] The TUI picker lists only directories containing `SPEC.md`, proven by a test with phase directories present
- [x] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass
