# GATES

## Stage 0: Static

- [x] `sizing.json` accepts `verification: light|full` per size entry and defaults absent entries to `light`
- [x] `mf-specs resolve` and `sizing` show the mode with the dispatch target
- [x] `status` and `next` show the mode per ready line

## Stage 1: Behaviour

- [x] layer merge still inherits whole entries repo → spec → phase
- [x] light mode keeps task-local gate proof; only repo-wide and review are skipped
- [x] `mf-specs check --name montflow-spec-standard` reports no sizing issues for the repo config

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/modules/sizing

- [x] the scoped sizing suite passes
