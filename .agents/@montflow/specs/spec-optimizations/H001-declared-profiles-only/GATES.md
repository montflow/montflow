# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `grep -rn effect-reviewer packages/specs` prints nothing outside `CHANGELOG.md`
- [ ] `bun run --cwd packages/specs cli doctor --check` reports every shipped skill and prompt current
- [ ] `bun run mf:check:skills` passes
- [ ] `bun run mf:check:prompts` passes
- [ ] `bun run mf:check:specs` passes
