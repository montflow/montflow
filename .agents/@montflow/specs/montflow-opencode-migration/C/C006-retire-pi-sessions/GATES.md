## Stage 0: Preconditions

- [ ] C003, C004, and C005 are complete and green on native sessions
- [ ] a repo-wide grep finds no `activeSessionRunnerHost` consumer outside `pi-sessions`

## Stage 1: Gate

- [ ] `packages/pi-sessions`, `mf-sessions`, and `verify:montflow:sessions` are gone
- [ ] a repo-wide grep for `pi-sessions`, `mf-sessions`, and `activeSessionRunnerHost` returns nothing
- [ ] `verify:montflow` reports zero issues
