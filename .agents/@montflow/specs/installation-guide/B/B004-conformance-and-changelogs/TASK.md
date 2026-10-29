---
id: B004
name: conformance-and-changelogs
type: execution
originator: user
depends-on: B003
related-tasks: A001, A002
status: complete
---

# Task B004: conformance-and-changelogs

## Type: execution

## Description

Close the phase: changelog the artifacts that changed, verify every link the new
guide depends on, and run the repository checks that cover docs and skills.

## Requirements

- Every changed skill carries a CHANGELOG entry (`syncing-skills` at minimum),
  in the format the sibling skills use.
- `mf-skills` package changelog records the new `sync` command.
- Every relative link in `guides/installation.md` resolves from the guide's
  directory, including `../.agents/skills/...` and `../apps/...`.
- No file outside the spec's scope was touched: `INSTALL.md` stays deleted, no
  `guides/README.md` is reintroduced.
- `bun run mf:check:skills` passes.
- `bun run mf:check:specs` passes for this spec.
- Format and lint are clean for the touched packages.

## Completion

- [ ] Changelog entries exist for every changed artifact.
- [ ] Links in the guide resolve.
- [ ] Skill and spec verifications pass.
