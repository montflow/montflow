---
id: C004
name: update-orchestration-and-skills
type: execution
originator: user
depends-on: B003, C003
related-tasks:
status: complete
---

# Task C004: Update orchestration and skills

## Type: execution

## Description

Update the execution flow and the skills so a phase closes by spawning one
reviewer session per declared profile, each against its own series.

## Requirements

- Update `executing-spec` so a review task's declared profiles each get one spawned reviewer session, each writing to its own series round.
- Update the `montflow-adversarial-review` skill to note that a spec phase may be backed by more than one series, one per reviewer profile, while keeping the round format and finding lifecycle unchanged.
- Update the `montflow-create-pi-specs` and authoring-spec contract text to cover the `profiles` field and the effect-reviewer binding for code phases.
- Keep the skill text and the code contract in agreement so a structural drift test can check it.
- Add or update the tests or checks that guard the instruction files against the constant.

## Completion

- [x] `executing-spec` spawns one session per declared profile
- [x] Adversarial-review and authoring skill text updated and consistent
- [x] GATES.md passed
