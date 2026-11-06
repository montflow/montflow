# GATES

## Stage 0: Static

- [x] the condition field is optional and a variable without it encodes unchanged
- [x] `isVisible` is exported and has no second implementation in the package

## Stage 1: Behaviour

- [x] hidden required is not missing; hidden variable renders empty
- [x] changing the controller clears a stale answer
- [x] each invalid condition fails verification with its fix
- [x] every existing installed prompt still verifies

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/prompts test

- [x] the scoped package suite for this task passes
