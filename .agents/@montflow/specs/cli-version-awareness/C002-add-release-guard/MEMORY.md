# Memory

## Context

C002 adds a mechanical guard so release metadata cannot drift from code.

Design:

- `packages/version/scripts/check-release.ts` is the `mf:check` scope. It fails
  when the five CLI manifests disagree, when `.changeset/config.json` drops one
  from the fixed group / re-ignores one / loses `privatePackages.tag`, when
  `@montflow/core` joins the fixed group, or when a package's `CHANGELOG.md`
  lacks the release-versus-checkout note.
- Root script `mf:check:release` runs it. `mf:check:skills` runs it first, so
  the scope is inside `mf:check` and the existing CI `skills` matrix cell covers
  it without a new workflow or cell.
- The runtime invariant (reported `version` equals `package.json`) is the
  spawned five-binary test from A002; it stays the runtime half.
- The tag-prefix test runs the installed `@changesets/cli tag` in a temp git
  fixture and asserts the produced `@montflow/<pkg>@<version>` tag parses
  through `UpdateCheck.versionOfTag`, so both sides are real implementations.
- Each of the five packages gained a `CHANGELOG.md` note stating that changesets
  versions and tags it but never publishes it to npm.

## Progress

- complete: script + root wiring; five CHANGELOG notes; tag-prefix fixture test.
- Verified: `bun run mf:check:release` → `release guard: 5 CLIs at 0.0.1, one
  fixed group, tags on`; `bun run mf:check:skills` green; version suite 128
  passing; scoped lint/typecheck green.

## Open Questions

- None.

## Handoff

- C099 reviews the config, the guard script, and the tag-prefix fixture.
- D003 reuses the `mf:check:release` script for the guide-anchor check.

## Deviations

- CI coverage is achieved by prepending the release scope to the existing
  `skills` cell (via `mf:check:skills`), not by adding a matrix cell, per the
  task requirement.
