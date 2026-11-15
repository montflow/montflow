## Stage 0: Verification (mechanical)
command: bun run --cwd packages/profiles test -- doctor

- [ ] `bun run --cwd packages/profiles test -- doctor` passes (the `mf-profiles
      doctor` payload sync for the `profile-runner` prompt).
- [ ] `bun run --cwd packages/prompts test -- profile-source` passes (the
      `profiles` variable source and the `profile-runner` render/execute path).
- [ ] `bun run --cwd packages/prompts ts:check` and
      `bun run --cwd packages/profiles ts:check` pass for the touched packages.