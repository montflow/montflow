---
id: F001
name: ensure-opencode-config-for-branch
type: execution
originator: user
depends-on: E004
related-tasks: C005, E004
status: complete
---

# Task F001: ensure-opencode-config-for-branch

## Type: execution

## Description

Ensure OpenCode loads montflow plugins from the correct source for this branch and for repos that pull montflow as a reference. Add a checked-in `opencode.jsonc` that points plugins at `./packages/*` and `./apps/workspace` in this repo, add support/validation so consuming repos can point to `./.agents/references/montflow/packages/*`, and add a mechanical check that verifies the configured plugin paths resolve/load through the host loader path.

## Requirements

- Add `opencode.jsonc` at repo root pointing to `./packages/prompts`, `./packages/skills`, `./packages/specs`, `./packages/profiles`, `./packages/reviews`, `./packages/references`, `./packages/model-fallback`, `./apps/workspace` (relative paths).
- Document that in consuming repos pulling montflow as a reference, plugins should point to `./.agents/references/montflow/packages/*` and `./.agents/references/montflow/apps/workspace`.
- Add a loader/config check (e.g. `mf:check:plugins`) that reads `opencode.jsonc` if present, resolves each plugin entry via the host loader (`Host.resolve` / same path as `packages/opencode/test/plugin-loader.test.ts`), attempts to load `server` (and `tui` when present), and fails on any broken path/import. Wire it into the gate (`mf:check` or `mf:gate:fast`).
- The check must be branch-agnostic: it validates what the config points to (so it works when pointing to local packages or to `.agents/references/montflow/...`).
- Keep `/mf-prompts` as the single command (no duplicate picker commands). The existing picker/forwarding behavior remains intact.
- Package-scoped checks pass for touched packages.

## Completion

- [x] `opencode.jsonc` added at repo root with correct relative paths.
- [x] `mf:check:plugins` added and wired into gate.
- [x] Check validates all configured plugin paths load through host loader.
- [x] Docs/notes added for reference-based consumption.
- [x] Scoped checks green.
