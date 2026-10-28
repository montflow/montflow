---
id: E002
name: skill-gate
type: execution
originator: user
size: medium
depends-on: 
related-tasks:
status: pending
---

# Task E002: skill-gate

## Type: execution

## Description

A fresh temporary workspace with only `mf-specs doctor` applied renders `spec-create` but fails `spec-execute` and `spec-sizing` with `prompt.skill-missing`: doctor installs two skills, while the prompts declare review skills, `executing-skills`, `grilling`, and `i-have-adhd`.

Close the packaging gap with one documented, tested rule instead of leaving a clean install broken.

## Requirements

- Pick one fix and record the choice and rationale in `MEMORY.md`: (a) doctor installs every skill the three shipped prompts declare, or (b) doctor-owned skills stay required while non-owned declared skills become advisory.
- Under (b), prompt load succeeds when a non-owned skill is missing, the rendered text and the caller report name every missing skill, and the skills handed to the executor contain only installed skills. Under (a), doctor installs the declared set idempotently and reports it.
- A fresh temporary workspace with only `mf-specs doctor` applied renders `spec-create`, `spec-execute`, and `spec-sizing` with exit 0 under the chosen behavior.
- A missing, stale, or blocked doctor-owned skill keeps its current coded failure and fix; it is never downgraded.
- If the advisory path needs a new code, use a stable `prompt.*` code and render it through the existing agent-first diagnostic shape.
- Update the README, the authoring skill, and the relevant profile or docs with the prerequisite skill list and the chosen behavior.
- Tests cover the fresh-root render for all three prompts, the owned-skill failure path, and the advisory path; no test depends on the skills installed in this repo.

## Completion

- [ ] The fix is recorded in MEMORY with its rationale
- [ ] A fresh doctor-only workspace renders all three prompts with exit 0
- [ ] Missing doctor-owned skills still fail with their existing codes
- [ ] Docs state the prerequisite skills and the chosen behavior
- [ ] Fresh-root, owned-failure, and advisory tests pass
