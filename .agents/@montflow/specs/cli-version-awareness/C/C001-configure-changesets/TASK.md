---
id: C001
name: configure-changesets
type: execution
originator: user
depends-on: A002
related-tasks:
status: complete
---

# Task C001: configure-changesets

## Type: execution

## Description

Turn on real releases for the five CLI packages so every shipped change produces a version, a changelog entry, and a git tag the update check can read.

## Requirements

- `@montflow/skills`, `@montflow/specs`, `@montflow/prompts`, `@montflow/profiles`, and `@montflow/reviews` are removed from `ignore` in `.changeset/config.json`.
- `privatePackages` becomes `{ "version": true, "tag": true }` so the private CLIs are versioned and tagged without being published to npm.
- A `fixed` group holds the five CLIs so they always share one version; the trade-off — a change to one CLI bumps all five — is stated in the config comment and the spec.
- All five package versions start equal, and a changeset file records the first release so the first release PR is not empty.
- `workspace:*` internal dependencies still resolve after `bun run changeset:version`; verified in a scratch copy of the repo, never by committing a dry run to this branch.
- `.github/workflows/release.yml` still skips private packages in its `npm view` discovery step and errors for none of the five un-ignored packages.
- `@montflow/core` keeps its existing public release cadence and is not pulled into the fixed group.

## Completion

- [x] Done.
