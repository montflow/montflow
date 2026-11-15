---
id: A002
name: skip-excluded-skills
type: execution
originator: user
size: medium
depends-on: A001
write-scope: packages/skills/src/apps/sync/,packages/skills/src/apps/cli/
related-tasks:
status: pending
---

# Task A002: skip-excluded-skills

## Type: execution

## Description

Make `sync` skip the excluded public skills A001's config parsing produces, and
make `sync --check`, `verify`, and `doctor --check` ignore them so a consumer
that excludes a skill gets a clean check. An excluded skill is reported with
outcome `skipped` and reason `excluded` (alongside the existing `internal`
skips), is never written to the target, and any existing local copy of it in the
target `.agents/skills/` is left byte-identical, exactly as a local-only skill
already is.

## Requirements

- `sync` reads A001's exclusion set and skips every excluded public skill: outcome `skipped`, reason `excluded`, `files` empty, and never written to the target.
- An excluded skill that already has a local copy in the target `.agents/skills/` is left byte-identical — excluding never deletes, overwrites, or modifies a local copy.
- `sync --check` does not report an excluded skill as drift: with every non-excluded skill current, a check run reports current and exits 0.
- `verify` and `doctor --check` never report an excluded public skill as missing or drift.
- The existing `internal` (frontmatter) skip path and all other sync behavior are unchanged; the exclusion set only adds to the skip conditions.
- The binary (`mf-skills sync`) and slash (`/mf-skills sync`) surfaces share the same skip outcomes and report through the existing renderer.
- The change is scoped to `packages/skills` and fully covered by the gates in A003's test task (this task writes the engine/CLI behavior; A003 adds the tests).

## Completion

- [ ] `sync` reports an excluded skill as `skipped` / `excluded` and never writes it.
- [ ] A local copy of an excluded skill is left byte-identical.
- [ ] `sync --check` is clean (exit 0) when only excluded skills are non-current.
- [ ] `verify` and `doctor --check` ignore excluded skills.
- [ ] The `internal` skip path is unchanged.
- [ ] Binary and slash surfaces agree on the exclusion report.

## Execution

Read the phase `MEMORY.md` `## Execution Brief` and this task's `GATES.md`; work
only within `packages/skills/src/apps/sync/` and `packages/skills/src/apps/cli/`.