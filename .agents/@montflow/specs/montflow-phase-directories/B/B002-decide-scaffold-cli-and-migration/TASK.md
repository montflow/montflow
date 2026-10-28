---
id: B002
name: decide-scaffold-cli-and-migration
type: planning
originator: user
depends-on: A003
related-tasks: C001
status: complete
---

# Task B002: decide scaffold, CLI, and migration

## Type: planning

## Description

Fix the tooling contract around the new tree: what `mf-specs create` writes, how
the CLI readers follow the extra level, what `mf-specs migrate` does and refuses,
how the fixtures and the rollout are sequenced, and which skills and docs change.
Precise enough that C003 and D001–D004 need no further decisions.

## Requirements

- Fix scaffold output: every path is `${phase}/${<id>-<name>}/...`; `SPEC.md`
  stays at the root; the review task lands under the phase directory; the
  `create` report lists POSIX paths and `renderScaffold` is unchanged in shape.
- Fix the CLI readers: `gatedTaskIds` must parse the leaf of a
  `<phase>/<task>/GATES.md` path instead of the first segment; `summarize`'s
  `endsWith('/TASK.md')` scan, the `phaseOf` grouping in `renderStatus`, and the
  reviews package's `verifySpecProfiles` scan are confirmed depth-agnostic and
  left alone.
- Fix the `migrate` contract: `mf-specs migrate --name <spec>` and `--all`,
  optional `--dry-run`; a flat tree becomes the phase layout without editing a
  single file byte; refuse a mixed tree (task directories at the root and phase
  directories), refuse an unknown spec, no-op on an already-migrated spec; print
  one line per move; verify the result before reporting success. State whether
  the move is a store rename or a write-then-remove, and the `SpecStore` surface
  it needs.
- Fix the fixture matrix: the four fixtures migrate to the phase layout; add a
  legacy-flat fixture that verifies with one warning before D003, and a
  stray-directory fixture (empty phase directory plus a stray file) that errors.
  Record the exact issue fields each fixture asserts.
- Fix the rollout order and gate impact: C001 inert snapshot change; C002 layout
  check with the legacy warning, plus the four fixtures moved in the same task so
  their `issues` assertions stay exact, together with the scaffold and CLI paths;
  C003 `migrate`; D001 migrates the six trees; D002 adds the legacy and stray fixtures and
  the expectation matrix; D003 deletes the legacy warning branch; D004 skills,
  packaged copies, and docs. State that `mf:check:specs` stays green through C
  because legacy findings are warnings and that the package suite stays green
  because no fixture asserts a legacy tree, and that D004 is the last change that
  can touch the packaged skill.
- Fix the skill and docs change list: `.agents/skills/montflow-create-pi-specs`
  and `packages/specs/skills/montflow-create-pi-specs` at `3.0.0` with a
  CHANGELOG entry and byte-identical `SKILL.md`; `AUTHORING_SPEC` and
  `EXECUTING_SPEC` sentences that name a one-level task directory;
  `packages/specs/README.md`, `fixtures/README.md`, and the
  `structure` / `spec-store` / `task` `CONTEXT.md` files.
- Write the contract into MEMORY.md, with the refusal messages quoted verbatim.
  Change nothing outside this spec.

## Completion

- [x] MEMORY.md fixes the scaffold paths, the CLI reader changes, and the `migrate` flags, refusals, and store surface
- [x] The fixture matrix names each fixture, its layout, and the exact issue fields asserted
- [x] The rollout table states which gate each phase leaves green and why
- [x] The skill/docs change list is exhaustive and names both skill copies
