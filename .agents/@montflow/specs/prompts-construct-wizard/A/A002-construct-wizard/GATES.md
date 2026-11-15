## Stage 0: Verification (mechanical)

The `--wizard` flow proves itself through its unit tests. Run the wizard spec
only — scoped to `packages/prompts/src/apps/interactive/`.

command: bun run --cwd packages/prompts test -- src/apps/interactive/tests/construct-wizard.test.ts

- [ ] Wizard tests pass (prompt picker, select/confirm/text controls, profile list, recommended-fallback choice, back, cancellation prints nothing, non-TTY refusal).
- [ ] The wizard renders through the shared `construct` engine and reuses `Prompts.isVisible`; no flow duplicates validation.