## Stage 0: Verification (mechanical)

The shared `construct` engine proves itself through its unit tests. Run the
construct-engine spec only — scoped to `packages/prompts/src/modules/`.

command: bun run --cwd packages/prompts test -- src/modules/prompt-execute/tests/construct.test.ts

- [ ] `construct` unit tests pass (render, default applied, missing-required refused, invalid-option refused, invalid-file refused, no-model constructs).
- [ ] The engine imports no model runtime and no doctor gate; no test constructs a plan requiring a model.