# Memory

## Context

Phase F makes plugin loading follow the workspace config instead of a machine
specific global config.

## Progress

- Added root `opencode.jsonc` pointing at `./packages/*` and `./apps/workspace`.
- Added root `server.ts`/`tui.ts` re-export shims to every plugin package: a
  directory entry resolves `server`/`tui` beside the directory, so package
  `exports` alone were not enough for the real host path.
- Replaced `scripts/check-opencode-plugins.ts` with a portable check. It reads
  `opencode.jsonc` with `Bun.JSONC.parse`, resolves each entry by directory with
  `Host.resolve`, loads every server/tui face through `Host.load`, and fails on a
  real import error instead of skipping it.
- Added `@opencode/plugin` as a root dev dependency so the check imports the
  same loader the host uses.
- Documented reference-based consumption in
  `.agents/documentation/load-opencode-plugins.md`.
- Found the local machine double-loading all plugins three ways: the same eight
  directories lived in both `~/.config/opencode/opencode.json` and the repo
  config, and eight `.opencode/plugins/montflow-*` symlinks pointed at the same
  packages. Removed the global `plugins` array (backup kept) and deleted the
  symlink stopgap.

## Open Questions

- None.

## Handoff

- `mf:check:plugins` is wired into `mf:check`; keep it branch-agnostic.

## Deviations

- The first check draft hard-coded `.bun/@opencode+plugin@<version>` paths and
  resolved entries by package name, so it never exercised the host's
  directory-only path. Replaced, not patched.
