## Stage 0: Verification (mechanical)

The command wiring proves itself through the CLI tests and the command-names
suite. Run both scoped to `packages/prompts/src/apps/cli/`; the command-names
suite must still pass once `render`/`execute` are removed.

command: bun run --cwd packages/prompts test -- src/apps/cli/tests/

- [ ] CLI tests pass for `construct`, `construct --wizard`, `--copy`, and the missing-required failure.
- [ ] The command-names suite passes with `render` and `execute` removed from the binary and slash command.