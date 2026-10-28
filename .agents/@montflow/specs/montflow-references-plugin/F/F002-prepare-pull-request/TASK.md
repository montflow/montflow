---
id: F002
name: prepare-pull-request
type: execution
originator: user
depends-on: F001
related-tasks: F099
status: pending
---

# Task F002: Prepare the pull request

## Type: execution

## Description

Turn the finished branch into a reviewable PR: one conventional title, a body
that states the migration and its verification, and a CI run on the exact head
commit. Use the `creating-pull-requests` skill for the mechanics.

## Requirements

- Confirm the branch is built on current `origin/main` (F001) and every commit is pushed.
- Verify CI is green on the head commit; re-run or fix before opening.
- Write a Conventional Commit title scoped to the change (e.g. `feat(references): migrate the registry to @montflow/references`).
- Body: what moved (registry store, CLI, tools, skills), the migration note for retired skills, the verification evidence (test counts, `mf:check` scopes, CI run), and the changeset.
- Link the spec and any issue; attach demo evidence as PR attachments, never committed binaries.
- Confirm the changeset covers `@montflow/references` and every touched doc/skill change that release notes need.
- Do not merge; hand the PR to review.

## Completion

- [ ] PR opened against `main` with a Conventional Commit title and evidence in the body
- [ ] CI green on the PR head commit
- [ ] Change-spec and issue links present
