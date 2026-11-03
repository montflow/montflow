# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `grep -rn effect-reviewer packages/specs` prints nothing outside `CHANGELOG.md`
- [x] `bun run --cwd packages/specs cli doctor --check` reports every shipped skill and prompt current
- [x] `bun run mf:check:skills` passes
- [x] `bun run mf:check:prompts` passes
- [x] `bun run mf:check:specs` passes
