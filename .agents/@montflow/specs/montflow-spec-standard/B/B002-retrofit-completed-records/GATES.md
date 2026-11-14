# GATES

## Stage 0: Severities

- [x] A complete task with one unchecked completion item fails `mf-specs check`
- [x] A pending task with one unchecked completion item passes
- [x] A complete task with an all-unchecked gate fails `mf-specs check`
- [x] A pending task with an all-unchecked gate passes

## Stage 1: Retrofit

- [x] Every complete task has a real size or `size: none`
- [x] Every completed completion item is checked against evidence, or the task is reopened with a recorded reason
- [x] Every completed gate item is checked against a recorded run, or the task is reopened

## Stage 2: Verification

- [x] `mf:check` reports zero `task.completion-unchecked`, `gate.unchecked`, and `task.missing-size` findings
- [x] The tests cover the complete-versus-unfinished split for both checks
- [x] `ts:check`, `lint:check`, `fmt:check`, and `mf:check` pass
