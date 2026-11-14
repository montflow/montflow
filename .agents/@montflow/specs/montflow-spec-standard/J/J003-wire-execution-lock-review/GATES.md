# GATES

## Stage 0: Static

- [x] execution loop runs task gate only for `light` and task plus phase plus repo-wide for `full`
- [x] lock derivation treats `light` with proven task gates as lockable without review
- [x] `review decide` returns `waived` for `light` and a normal decision for `full`

## Stage 1: Behaviour

- [x] light runs record verification light with model id in task MEMORY.md
- [x] full still requires a closed review round before lock
- [x] no hand-counting persists in orchestrator or worker

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/modules/lifecycle src/modules/phase src/modules/review-policy

- [x] the scoped lifecycle, phase, and review suites pass
