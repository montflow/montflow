# GATES

## Stage 0: Package shape

- [ ] `package.json` exports `.`, `./server`, and `./tui` resolve to existing files
- [ ] `bun run --cwd packages/references ts:check` passes
- [ ] `bun run --cwd packages/references test` passes

## Stage 1: Discovery

- [ ] `bun run pack:plugins` lists `@montflow/references`
- [ ] the packed manifest has no `workspace:` specifier
