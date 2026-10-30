---
id: D004
name: align-skills-docs-and-payloads
type: execution
originator: planner:C099
depends-on: D003
related-tasks:
status: complete
---

# Task D004: align skills, docs, and payloads

## Type: execution

## Description

Make the written contract match the tree: the create-spec skill (both copies),
the injected authoring text, the package and fixture READMEs, and the CONTEXT
files that describe the snapshot and the layout. A stale packaged copy fails
`mf:check:skills`, so this is the last chance to align them.

## Requirements

- Bump `montflow-create-pi-specs` to `3.0.0`: update
  `.agents/skills/montflow-create-pi-specs/SKILL.md` so the layout section,
  scaffold step, phase rules, and self-check rows all name
  `<spec>/<PHASE>/<PHASE><NNN>-<name>/` and the per-level allowlist; add the
  CHANGELOG entry.
- Copy the identical `SKILL.md` and `CHANGELOG.md` into
  `packages/specs/skills/montflow-create-pi-specs/`, byte for byte.
- Update `packages/specs/src/skills/authoring-spec.ts` layout section and
  `packages/specs/src/skills/executing-spec.ts` where it names a task path;
  leave the review wording alone.
- Update `packages/specs/README.md` (CLI list gains `migrate`; create and
  structure entries describe the phase layout),
  `packages/specs/fixtures/README.md`, and the `CONTEXT.md` files for
  `modules/structure`, `modules/task`, `services/spec-store`, and `apps/cli`.
- Confirm `montflow-find-pi-specs` needs no change; edit it only if it states a
  flat task path, and then bump it consistently in both copies.
- Do not change the layout decision, the verifier, or the fixtures here; this
  task is documentation and packaged payload only.

## Completion

- [x] `bun run mf:check:skills` passes with the two `montflow-create-pi-specs` copies identical
- [x] `bun run mf:check:specs` passes
- [x] Every doc that named a flat task directory now names the phase layout
- [x] The skill's version is `3.0.0` in both copies and in the CHANGELOG
