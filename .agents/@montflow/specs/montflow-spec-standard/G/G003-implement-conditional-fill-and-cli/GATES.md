# GATES

## Stage 0: Static

- [x] `fillInputs` uses `ui.select` for select variables and `ui.input` for text
- [x] visibility is read from the shared `isVisible` helper, not re-derived

## Stage 1: Behaviour

- [x] yes path asks origin and worktree name; no path asks neither
- [x] yes→no clears the hidden answers, and yes again asks again
- [x] a required hidden variable is not reported missing
- [x] CLI `render`/`execute` match the interactive answers and refuse an invalid option

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/prompts test

- [x] the scoped package suite for this task passes
