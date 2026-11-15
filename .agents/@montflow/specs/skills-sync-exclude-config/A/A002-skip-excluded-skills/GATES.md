# GATES

## Stage 0: Skip-and-ignore compiles (mechanical)
command: bun run --cwd packages/skills ts:check
scope: packages/skills/src/apps/cli/

- [ ] The CLI surface (`sync`, `verify`, `doctor --check`) and its engines type-check with the exclusion set.
- [ ] The binary and slash surfaces both resolve the exclusion behavior with no type errors.