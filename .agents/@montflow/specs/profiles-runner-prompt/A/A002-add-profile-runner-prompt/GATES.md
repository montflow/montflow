## Stage 0: Verification (mechanical)
command: bun run --cwd packages/profiles cli doctor --check --dir $PWD

- [ ] `bun run --cwd packages/profiles cli doctor --check --dir $PWD` reports the
      `profile-runner` prompt payload healthy with no drift.
- [ ] `bun run --cwd packages/prompts cli verify profile-runner --dir $PWD` passes
      for the shipped prompt (renderable and executable with `mf-prompts`).
- [ ] The prompt file exists at `packages/profiles/prompts/profile-runner.json`
      and `packages/profiles/payload.json` declares it as a `kind: prompt` payload.