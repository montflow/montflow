# Memory

## Context

C001 turns releases on for the five private CLIs: changesets versions and tags
them, never publishes them, and keeps their versions fixed together.

Design:

- Removed the five `@montflow/{skills,specs,prompts,profiles,reviews}` entries
  from `ignore`.
- `privatePackages: { version: true, tag: true }` so they get versions and
  `@montflow/<name>@<version>` tags without an npm publish.
- `fixed` group of the five, so one changeset bumps all five together.
- **Trade-off:** a change to one CLI bumps all five. Deliberate (one `mf-*`
  version an agent can compare) and repeated in the config `$comment` and this
  spec. `@montflow/core` is excluded and keeps its own cadence.
- Added `@montflow/version` to `ignore`: it is private tooling, not a shipped
  CLI, and `privatePackages.tag` would otherwise tag it too.
- A first-release changeset file makes the first Version Packages PR non-empty.

## Progress

- complete: `.changeset/config.json` updated (fixed group, private packages,
  `$comment` trade-off), `.changeset/first-cli-release.md` added.
- Scratch proof in `/tmp/opencode/changeset-proof2` (copy of the working tree,
  node_modules symlinked):
  - `bun run changeset:version` bumped all five to `0.0.2` and generated each
    `CHANGELOG.md`.
  - `workspace:*` dependencies survived byte-for-byte in all five manifests.
  - `@montflow/core` stayed at `3.0.1` and was not in the fixed group.
  - `bun run changeset tag` produced `@montflow/{skills,specs,prompts,profiles,reviews}@0.0.2`.
  - No dry-run bump was committed to this branch.
- Release workflow discovery (its own filter, re-run locally) skips all five
  because they are private: the only packages it would `npm view` are
  `@montflow/core` and `@montflow/format`.

## Open Questions

- None. `$comment` is tolerated by `changeset status`/`version`; if a future
  changesets schema rejects unknown keys, move the text to
  `.changeset/README.md`.

## Handoff

- C002 asserts the five versions agree, the tag prefix matches changesets, and
  each package carries a CHANGELOG model note.

## Deviations

- Added `@montflow/version` to `ignore` to keep the tag set to the five CLIs.
