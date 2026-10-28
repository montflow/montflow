---
id: E002
name: verify-pr-checks
type: execution
originator: user
depends-on: E001
related-tasks:
status: in-progress
---

# Task E002: verify-pr-checks

## Type: execution

## Description

Make the branch genuinely mergeable: fix the CI-only test failure, open the pull
request against `main`, and confirm every required check is green.

## Requirements

- Fix the tag-prefix fixture so annotated tags work on a runner with no global
  git identity (repository-local `user.name`/`user.email`), and prove it with a
  `HOME`-less local run.
- Push the branch and open a pull request against `main` (no force push, no
  rebase, no tag).
- Confirm the CI `verify` matrix is green: test, lint, typecheck, format,
  release-and-skills, prompts, specs, profiles, reviews, tui, smoke.
- Satisfy the `spec-completion` gate: add the `Spec: cli-version-awareness`
  trailer, lock completed phases, and set the spec to `complete` so
  `mf-specs check --name cli-version-awareness --require-complete` passes.
- Record the PR number and the final check summary in `MEMORY.md`.

## Completion

- [ ] Done.
