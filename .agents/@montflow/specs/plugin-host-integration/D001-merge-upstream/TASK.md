---
id: D001
name: merge-upstream
type: execution
originator: user
depends-on: C005
related-tasks: C001, C004
status: complete
---

# Task D001: merge-upstream

## Type: execution

## Description

`origin/main` moved every spec task under a phase directory
(`3cf8150 feat(specs)!: move every task under a phase directory (#6)`). This
branch predates that change, so it is one commit behind and cannot merge until
the upstream commit is reconciled.

## Requirements

- Merge `origin/main` into `feat/plugin-host-integration` without dropping any
  branch work.
- Resolve every conflict in favour of both intents: keep the branch's Pi-naming
  retirement and specs CLI split, keep upstream's phase-directory scaffolding.
- Adopt upstream's `@montflow/specs` create/verify behaviour and skill names as
  the package now ships them.
- Leave the branch green under the pre-migration gate; layout migration is
  D002's job.
- Do not push.

## Completion

- [x] `origin/main` is an ancestor of the branch.
- [x] Merge conflicts resolved with intent preserved on both sides.
- [x] Scoped checks for the touched packages pass (all five package suites).
