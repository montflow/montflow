# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs cli status --dir . --name ..` exits 1 with `cli.invalid-argument` and prints no parent tasks
- [x] `bun run --cwd packages/specs cli sizing-config --dir . --name ../../etc` exits 1 and names no write target
- [x] `bun run --cwd packages/specs cli status --dir . --name spec-optimizations` still prints the spec panel
