# GATES

## Stage 0: Static

- [ ] the condition field is optional and a variable without it encodes unchanged
- [ ] `isVisible` is exported and has no second implementation in the package

## Stage 1: Behaviour

- [ ] hidden required is not missing; hidden variable renders empty
- [ ] changing the controller clears a stale answer
- [ ] each invalid condition fails verification with its fix
- [ ] every existing installed prompt still verifies

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/prompts test

- [ ] the scoped package suite for this task passes
