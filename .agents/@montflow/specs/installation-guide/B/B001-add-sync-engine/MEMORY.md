# Memory

## Context

- B001 adds the `sync` engine the local-mode guide documents; it depends on
  A002 and is consumed by B002 (CLI) and B003 (CLI tests).
- The engine owns every domain rule: public/internal classification, drift,
  outcomes, and refusal text. Neither front end is wired yet.

## Progress

- Added `packages/skills/src/apps/sync/`:
  - `sync.apps.module.ts` — `runSync`, `isInternalSkill`, `checkoutRoot`,
    `skillsStoreDir`, `DEFAULT_SYNC_INVOCATION`, and the outcome types
  - `index.ts` — re-export
  - `CONTEXT.md` — module rules
  - `tests/sync.test.ts` — 13 tests over temp checkouts/workspaces
- Exported `Sync` from `packages/skills/src/apps/index.ts`.
- Engine API: `runSync({ from?, dir?, check?, invocation? })` →
  `SyncResult { source, target, check, skills, changed, drifted }`, where each
  `SyncSkillStatus` carries `{ name, outcome, source, target, files }` and each
  file carries `{ file, outcome }` for a `--verbose` renderer.
- Verified: `bun run --cwd packages/skills test` (42 files / 269 tests),
  `format:check`, `lint:check`, `ts:check`, `bun run mf:check:skills` — all
  green.
- Smoke run against the real store: 45 public skills added, `syncing-skills`
  skipped, `--check` clean on the second pass.

## Open Questions

- None.

## Handoff

- B002 wires `sync` into `binary.apps.module.ts` and `slash.apps.module.ts`:
  `--from`, `--dir`, `--check`, `--verbose`; render `SyncResult` (lean by
  default, `files` only with `--verbose`) and set exit `1` when `drifted`.
- The binary must pass `invocation: 'mf-skills sync'`; the slash command keeps
  `DEFAULT_SYNC_INVOCATION` (`/mf-skills sync`).
- Nothing imports the engine yet, so B002 can shape renderers without
  touching engine rules.

## Deviations

- `dir` is optional and defaults to `'.'` (the working directory) rather than
  the engine reading `process.cwd()` or argv; the front end passes `--dir` or
  `cwd` explicitly, per "no argv/process.cwd awareness".
- Skill outcome `added` is decided by the target skill directory being
  absent; an existing-but-empty target directory reports `updated`.
- Source directories without a readable `SKILL.md` are ignored rather than
  reported — they are not skills.
- `check` mode still lists internal skills as `skipped` and never creates the
  target store, matching the guide (`--check` writes nothing).
