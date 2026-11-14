# GATES

## Stage 1: Prompts proof (mechanical)
command: bun run --cwd packages/prompts test -- src/modules/prompts/tests/verify.test.ts src/apps/interactive/tests/fill-inputs.test.ts

- [x] a `confirm` controller verifies, resolves, and renders through `truthy`

## Stage 2: Workspace proof (mechanical)
command: bun run --cwd apps/workspace test -- src/services/prompts/tests/prompt-editor.test.ts

- [x] the workspace editor round-trips and validates a `confirm` controller
