## Stage 0: Verification (mechanical)
command: bun run --cwd packages/prompts test -- profile-source

- [ ] `bun run --cwd packages/prompts test -- profile-source` passes (the new
      `profile-source` module and the fill-path tests for the `profiles` source).
- [ ] `bun run --cwd packages/prompts test -- template-variables` passes (the
      widened `source` literal does not regress `specs`).
- [ ] `bun run --cwd packages/prompts ts:check` passes for the prompts package.