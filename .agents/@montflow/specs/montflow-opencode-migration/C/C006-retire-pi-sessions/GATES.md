## Stage 0: Preconditions

- [x] C003, C004, and C005 are complete and green on native sessions
- [x] a repo-wide grep finds no `activeSessionRunnerHost` consumer outside `pi-sessions`

## Stage 1: Gate

- [x] `packages/pi-sessions`, `mf-sessions`, and `verify:montflow:sessions` are gone
- [x] a repo-wide grep for `pi-sessions`, `mf-sessions`, and `activeSessionRunnerHost` returns nothing
- [x] `verify:montflow` reports zero issues
