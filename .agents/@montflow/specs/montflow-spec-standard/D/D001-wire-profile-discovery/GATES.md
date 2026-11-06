# GATES

## Stage 0: Discovery instruction

- [ ] `mf-specs author --request "ship a small fix"` renders a prompt that names `mf-profiles list` before `reviewer-profiles`
- [ ] The `montflow-create-specs` skill's `reviewer-profiles` rule names `mf-profiles list` and the `mf-profiles show` fallback
- [ ] The prompt and skill state the empty-list default and the one-round-per-cycle cost

## Stage 1: Mirrors and payload

- [ ] The package skill and the installed workspace mirror are byte-identical
- [ ] The doctor embedded payload matches the package bytes and `mf-specs doctor --check` reports no drift
- [ ] The README names the discovery command, the `show` fallback, and the empty-list default

## Stage 2: Verification

- [ ] The discovery test fails when the instruction is removed from the prompt or the skill rule
- [ ] `mf-specs check` adds no new finding to any spec
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass

## Stage 3: Package proof (mechanical)
command: bun run --cwd packages/specs test

- [ ] the scoped package suite for this task passes
