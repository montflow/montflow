# GATES

## Stage 0: Package shape

- [x] `package.json` exports `.`, `./server`, and `./tui` resolve to existing files
- [x] `bun run --cwd packages/references ts:check` passes
- [x] `bun run --cwd packages/references test` passes

## Stage 1: Discovery

- [x] `bun run pack:plugins` lists `@montflow/references`
- [x] the packed manifest has no `workspace:` specifier
