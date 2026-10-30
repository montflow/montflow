# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See TASK.md.

## Deviations

- None.
# B001: decide-integration-strategy - Memory

## Strategy for effect/schema skew
**Chosen:** Align repo to host versions (effect 4.0.1, match @opencode/* to host). User approved.
- Rationale: Host forces its own effect copy; @opencode/schema 2.0.18 was built against older effect. Aligning prevents runtime skew. Survives upgrades better if we track host versions.
- Blast radius: All packages (overrides in root, deps in all packages). Undo: revert package.json changes.
- Alternatives considered:
  1. Remove @opencode/schema runtime construction - would require big refactor of adapter code, might lose compatibility guarantees
  2. Compatibility layer - patching is fragile and may not cover all cases

## Loader restrictions
**Chosen:** Use subpath imports and avoid barrels that pull deep effect/dist/... imports. Also ensure no imports from package roots that re-export problematic deps.
- Evidence from A001: must use @effect/platform-node subpaths (not barrels), avoid apps/cli barrels, avoid package roots re-exporting NodeClusterHttp etc. packages/prompts/src/server.ts already does this correctly.
- Verification: test imports through host loader path.

## Picker contract (seam in @montflow/opencode)
Need to define shared picker. Looking at host API: ui.dialog.select + keymap.layer + renderer.currentFocusedEditor.insertText for insertion.
Contract should be something like: registerTuiPicker(context, config) where config provides { storeReader, formatter, commandName, insertMode? }.
Or in Effect terms, maybe a function in @montflow/opencode/tui exports.

Also need to see existing patterns in @montflow/opencode for TUI plugins.

Let us look up how TUI plugins are structured.

## Picker contract (seam in @montflow/opencode)
**Design:** Add a shared TUI picker helper in @montflow/opencode. Since host has no supported composer write API, use renderer.currentFocusedEditor.insertText with retry (as stopgap does). Contract:
- Export from @montflow/opencode/tui (or a new export) something like `makePromptPicker` or `registerPicker` / `createPicker` that takes TuiPorts/context and a config.
- Config: `{ commandName: string, title: string, description: string, group?: string, loadItems: (cwd: string) => Promise<Item[]>, search?: (query: string, items: Item[]) => Item[], formatItem: (item: Item) => { title: string, description?: string, value: Item }, getInsertText: (item: Item) => string, forwardNonListToServer?: boolean }` where forwardNonListToServer means if args are not empty and not 'list', forward to server command of same name via client.session.command (like prompts does).
- The helper registers a keymap layer command with slash name = commandName, arguments: true. If no args or args.trim() === 'list' or args.trim() === '' -> open picker; else if forwardNonListToServer -> forward to server.
- Picker uses ui.dialog.select with search. On select, calls getInsertText and inserts via renderer.currentFocusedEditor.insertText with retry (same pattern as stopgap). If can't insert, show toast warning.
- Plugins only supply loadItems, formatItem/getInsertText, metadata.

**Per-plugin insertion rules:**
| Plugin | Store | Insert text |
| --- | --- | --- |
| prompts | .agents/@montflow/prompts/ (migrated from pi-prompts) | template text |
| skills | .agents/skills/ | skill name/id (as appropriate for insertion) |
| specs | .agents/@montflow/specs/ | spec name (and possibly action - but task says "specs paste the spec name") |
| profiles | .agents/@montflow/profiles/ | profile name |
| reviews | .agents/@montflow/reviews/ | series/round identifier (task says "reviews the series/round") |

**Registration:** Each package's TUI entry (src/tui.ts) uses tuiEntry/makeTuiPorts and registers picker via shared helper. Server entries unchanged in structure.

**Stopgap:** Delete .opencode/plugins/prompts/ entirely (server.ts, tui.ts). Replace with packaged implementation.

**Verification:** Plugin loader test already checks packages load; also need to ensure each plugin loads through host loader path. The test 'prompts publishes the stored prompts, /mf-prompts, and the tools' checks commands/tools - will need to update. Also add verification that each plugin's server/tui load. The loader test pattern uses Host.resolve on package dirs and loads server/tui.


**Verification command:** `bun run --cwd packages/opencode test` (plugin-loader.test.ts) - must pass. Also scope-specific checks as we go.
