# GATES

## Stage 0: Contract and drift (mechanical)
command: bun run --cwd packages/specs test -- --run

- [ ] the lean-contract drift test and the `phase.execution-brief-missing` fixture pass

## Stage 1: Spec check (mechanical)
command: bun run mf-specs:check

- [ ] every v2 in-progress phase has an execution brief and the store reports zero issues

## Stage 2: Payload verifiers (mechanical)
command: bun run mf-profiles:check && bun run mf-prompts:check

- [ ] canonical and installed profiles and prompts verify

## Stage 3: Repo gate (mechanical)
command: bun run mf:check

- [ ] the repo-wide gate passes with the changed payloads

## Stage 4: Types, lint, format (mechanical)
command: bun run ts:check && bun run lint:check && bun run fmt:check

- [ ] types, lint, and formatting pass
