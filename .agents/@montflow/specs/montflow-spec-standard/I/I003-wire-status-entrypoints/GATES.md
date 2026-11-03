# GATES

## Stage 0: Static

- [ ] every surface I001 names exists in the binary, the `/specs` slash table, and the host tool layer as applicable
- [ ] the engine loads `spec-status` through `modules/prompt` and copies no template text
- [ ] name resolution calls the shared `which` path; no surface carries a second branch matcher
- [ ] the binary path contains no write, dispatch, lock, status-transition, or git mutation

## Stage 1: Behaviour

- [ ] an explicit name wins over the branch guess on every surface
- [ ] an ambiguous, missing, or prefix-less branch fails with the candidates and asks the user
- [ ] binary, slash, and host tool render identical text for identical values, model default included
- [ ] unknown spec, malformed name, and missing root carry the coded diagnostic and exact rerun
- [ ] no surface changes `SPEC.md`, a `TASK.md`, a `MEMORY.md`, a review file, or a lock

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test

- [ ] the scoped package suite for this task passes
