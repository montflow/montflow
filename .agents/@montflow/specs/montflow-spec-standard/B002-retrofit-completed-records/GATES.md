# GATES

## Stage 0: Severities

- [ ] A complete task with one unchecked completion item fails `mf-specs check`
- [ ] A pending task with one unchecked completion item passes
- [ ] A complete task with an all-unchecked gate fails `mf-specs check`
- [ ] A pending task with an all-unchecked gate passes

## Stage 1: Retrofit

- [ ] Every complete task has a real size or `size: none`
- [ ] Every completed completion item is checked against evidence, or the task is reopened with a recorded reason
- [ ] Every completed gate item is checked against a recorded run, or the task is reopened

## Stage 2: Verification

- [ ] `mf:check` reports zero `task.completion-unchecked`, `gate.unchecked`, and `task.missing-size` findings
- [ ] The tests cover the complete-versus-unfinished split for both checks
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf:check` pass
