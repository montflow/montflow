# Memory

## Context

Current state before this phase starts:

- Configuration lives in `opencode.jsonc` `plugins[].options` and is read once, at
  activation (`packages/model-fallback/src/apps/server/model-fallback.apps.module.ts`).
  Nothing re-reads it, so a chain edit needs a plugin reload.
- Plugin inventory is built when the host server starts. A newly registered
  plugin package is not loaded by a hot reload; the running service started
  before `opencode.jsonc` existed and still listed 90 builtin plugins only.
  `config.get` showed the entry; `plugin.list` did not include it. Restarting the
  service is the only way in today — this phase exists to remove that need for
  configuration changes.
- `packages/model-fallback/src/modules/fallback-file/fallback-file.module.ts`
  reads and writes the `opencode.jsonc` entry with `jsonc-parser`, preserving
  comments and other plugins. It also recognizes a local checkout registered by
  absolute path (the host only loads absolute paths locally; a bare spec goes to
  npm).
- `packages/model-fallback/src/modules/fallback-config/fallback-config.module.ts`
  owns `Options { chain?, triggers? }` and is the only decoder today. That schema
  is the natural seed for the store schema.
- Behavior that must not move: trigger defaults (`quota`, `rate-limit`, `auth`),
  chain no-wrap, per-session tried-set, retry-hook switch with
  `{ retry: true, delay: 0 }`, and resume on `session.execution.failed`.
- Adjacent stores to mimic: `.agents/@montflow/pi-prompts/` (one JSON file per
  record, `verify` command), `profiles/`, `reviews/`, `specs/`. None of them holds
  plugin configuration yet; this is the first domain that does.
- The plugin's prompt artifact and `doctor` already manage
  `.agents/@montflow/pi-prompts/model-fallback.json`, so the store directory is
  the only new location this phase introduces.

## Progress

- complete — contract decided (2026-10-28).

## Decisions

1. **Path** — `.agents/@montflow/model-fallback/config.json`. The directory exists
   only to hold configuration; the file name is fixed, so a second file would be a
   new decision, not an accident.
2. **Shape** — strict JSON (no comments; the plugin owns the file and writes it):
   `{ "version": 1, "chain": ["provider/model[#variant]", ...], "triggers": ["quota", ...] }`.
   `version` is optional on read (missing means 1) and always written; any other
   version is a shape error. `chain` is required and must contain at least one
   entry. `triggers` is optional and defaults to `quota, rate-limit, auth`; an
   explicit empty list is legal and means "never fall back" (deliberate, reported
   as such).
3. **Unknown keys** — tolerated on read and preserved on write. The file is a
   forward-compatible store, not a closed schema; silently dropping a field a
   newer version wrote would corrupt state.
4. **Duplicates** — a repeated model in `chain` is a shape error. `set` dedupes
   before writing, so a duplicate means a hand edit and hides intent.
5. **Precedence** — store → `opencode.jsonc` `plugins[].options` → idle. The store
   wins whenever it is present and valid; the legacy block is ignored with a
   warning, never merged. With neither present the plugin stays inert and logs the
   store path.
6. **Migration** — explicit `migrate`, never automatic. It writes the store from
   the legacy options and clears `options` on the plugin entry while keeping the
   entry itself. `set` writes the store and leaves legacy options untouched (they
   are then ignored, and `show`/`status` say so).
7. **Reload** — watch the nearest existing ancestor of the store directory
   (`model-fallback` → `@montflow` → `.agents`), re-read on change, no debounce
   (reads are cheap and idempotent). A valid change swaps the active config on the
   next failure. An invalid change keeps the last good config in force and logs
   every issue. Deleting the file falls back to options, then idle.
8. **`status` exit codes** — `0` for valid and for "no store at all"; `1` only
   when a store exists and is malformed. A gate therefore fails on a broken file
   and passes on an unconfigured workspace. `--json` returns `{ ok, path,
   present, source, chain, triggers, issues }`.
9. **`verify`** — unchanged meaning: store shape plus every chain model resolving
   against the live catalog. Shape failures name `status`; an unreachable catalog
   is a failure, not a skip.
10. **`remove`** — deletes the store file and clears legacy options, so "removed"
    really means inactive. The `opencode.jsonc` plugin entry stays registered.

## Rejected alternatives

- Keeping config in `opencode.jsonc` only: no runtime reload, and every edit is a
  host-config edit; rejected because the plugin owns the meaning, not the host.
- JSONC in the store: comment support would need a second parser and a second
  truth for "what shape is valid"; the store is machine-written, so strict JSON.
- Auto-migrating on first `set`: a write would silently delete the legacy block,
  making rollback harder; an explicit verb is auditable.
- Merging store and options: two sources cannot both win; a merge makes "which
  model is actually next" unanswerable.
- Polling instead of watching: polling needs timers (banned by the lint rule) and
  burns CPU for a file that changes rarely.
- Debouncing: `fs.watch` already coalesces most editors, and a re-read is a parse
  of a few hundred bytes.

## Open Questions

- None. The empty-trigger-list question is settled as "legal, means disabled".

## Handoff

- A002 implements decisions 1-7 and 10; A003 implements 8-9.

## Deviations

- None.
