---
id: A003
name: add-issue-severity-channel
type: execution
originator: user
depends-on: A001
related-tasks: A004
status: complete
---

# Task A003: add issue severity channel

## Type: execution

## Description

Give `Issue` a severity so a finding can be advisory instead of fatal. This is a
prerequisite for every warning this spec later introduces: without it, the first
version-drift warning ever emitted turns CI red and the feature cannot ship.

## Requirements

- `Issue` gains a severity field defaulting to error, so every existing call keeps failing the check unchanged.
- A result is `valid` only when it has zero error-severity issues; warnings never flip it and never change an exit code by themselves.
- Add a strict mode to `check` and to the slash form that promotes warnings to errors, so CI can opt into the hard line.
- Warnings render distinctly in `renderCheck`, `renderStatus`, and `renderList` with a visible mark, counted separately from issues.
- Give the pi-specs issue the same `fix` affordance `pi-prompts` already has, so an advisory line tells the agent what to type.
- No behavior change to any existing error path, and both existing specs still verify with zero issues.

## Completion

- [ ] `bun run --cwd packages/pi-specs test` passes with new cases for default-to-error, warn-does-not-fail, and strict-promotes
- [ ] `bun run verify:montflow:specs` reports zero issues for both existing specs
- [ ] A synthetic warning is proven non-fatal without the flag and fatal with it, by an actual run
- [ ] `ts:check`, `lint:check`, and `format:check` pass for the package
