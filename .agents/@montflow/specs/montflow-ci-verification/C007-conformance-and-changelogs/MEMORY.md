# Memory

## Context

Task C007: run the whole gate locally, fix every failure, and record the
release.

## Progress

- 2026-10-07: complete.

## Findings

### Full gate

`bun run verify:montflow` → exit 0. 15 turbo tasks successful; then every
extension verify green: skills `46 skills · 0 issues` + `up to date`, prompts
`2 prompts · 0 issues` + `up to date`, specs `2 specs · 0 failed · 0 issues`,
profiles `5 profiles · 0 issues`, runs skill installed.

Failures found and fixed while running the gate:

- `@montflow/pi-prompts` lint: local `const report` in the `verify` command
  shadowed the module-level `report` helper → renamed to `all`.
- Format drift in the new pi-prompts/pi-skills sources → `format:fix` per
  package.

`bun run --cwd packages/pi-specs cli check --dir $PWD/.agents/@montflow/specs`
→ `2 specs · 0 failed · 0 issues`.

### Changelogs

No package `CHANGELOG.md` exists in this repo, and `.changeset/config.json`
sets `privatePackages.version: false` and ignores `@montflow/pi-prompts` /
`@montflow/pi-profiles`, so a changeset for them would be ignored. The change
is documented in the spec MEMORYs and in `AGENTS.md`; no changeset file was
added. No skill file changed, so no skill `CHANGELOG.md` entry is due, and the
embedded skill payloads still match (`doctor --check` passes).

### Scope

- `release.yml` untouched.
- `.github/workflows/verify.yml`, `lefthook.yml`, `AGENTS.md`, root
  `package.json`, and the pi-prompts/pi-skills/pi-profiles sources are the
  intended changes.

## Open Questions

- None.

## Handoff

- Feeds C099 review-phase.

## Deviations

- Changelog step is a no-op given the repo's changeset configuration; recorded
  above rather than fabricating a changeset the toolchain ignores.
