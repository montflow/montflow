# GATES

## Stage 0: Prompt and profile skills

- [ ] `montflow-create-prompts` names `mf-skills list` and `mf-prompts verify` for create and modify
- [ ] Both profile skills name `mf-skills list` and `mf-profiles verify`
- [ ] Each skill still separates the mechanical check from the subjective one

## Stage 1: Review and discovery skills

- [ ] `montflow-adversarial-review` takes the round from `mf-reviews resume` / `create` and keeps an explicit round authoritative
- [ ] No `highest existing number + 1` rule remains
- [ ] `finding-skills` and `executing-skills` try `mf-skills list` first and state the fallback

## Stage 2: Mirrors and proof

- [ ] Package and workspace copies are byte-identical where a package copy exists
- [ ] The prompts, skills, and reviews doctor payloads match the package bytes; `doctor --check` is silent
- [ ] A test fails when any CLI-first step is removed from these skills
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf:check` pass

## Stage 3: Package proof (mechanical)
command: bun run --cwd packages/specs test

- [ ] the scoped package suite for this task passes
