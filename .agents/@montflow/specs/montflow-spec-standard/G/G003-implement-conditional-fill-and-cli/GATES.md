# GATES

## Stage 0: Static

- [ ] `fillInputs` uses `ui.select` for select variables and `ui.input` for text
- [ ] visibility is read from the shared `isVisible` helper, not re-derived

## Stage 1: Behaviour

- [ ] yes path asks origin and worktree name; no path asks neither
- [ ] yes→no clears the hidden answers, and yes again asks again
- [ ] a required hidden variable is not reported missing
- [ ] CLI `render`/`execute` match the interactive answers and refuse an invalid option

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/prompts test

- [ ] the scoped package suite for this task passes
