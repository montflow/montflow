# Memory

## Context

Port the interactive widgets and the workspace into the OpenCode TUI as one
plugin route page, and retire the standalone app (B004 §1/§2/§6/§7). Inputs:
C003/C004 port patterns (structural context slices, `makePorts`, `entry`),
B004's locked decisions (one fullscreen grid route page, native session
list/detail/dispatch, OpenTUI `>=0.5.12`, standalone app retired), and the
0.5.11 → 0.5.12 spike that had to run first.

Landed in four commits: the OpenTUI/Solid spike, the TUI adapter ports +
widgets, the workspace route page + plugin faces, and two small follow-ups
(model read, doc wording).

## Progress

- complete — **0.5.11 → 0.5.12 spike ran first** (`438766a`). Moved
  `@opentui/core|solid` to `peerDependencies` `>=0.5.12` with devDeps pinned to
  the host catalog (`0.5.12`) and `solid-js` to `1.9.15`. `ts:check` clean;
  `test:tui` 94 pass / 0 fail (covers `markdown-body-overflow` = `onSizeChange`
  and the scrollbox markdown windows); `test` 86 files / 584 tests pass. The
  three adapted APIs (`onSizeChange`, scrollbox `stickyScroll`, textarea
  `keyBindings`) needed no code changes at 0.5.12.
- complete — adapter ports (`cd4ba06`):
  `CustomViewPort` (`ctr.ui.dialog.show/clear` + `ui.panel`),
  `DataPort` (sync reads over `ctx.data`: session list/get/status + VCS),
  `StoragePort` (`ctx.storage.store/memory` as live handles),
  `GridPagePort` (`ctx.ui.router` register/navigate/current, `ui.slot`,
  `keymap.layer`), each with contract tests. `ModelPort` gained its TUI half
  (`ctx.data.location.model` catalogue + `ui.model.current` default) while
  keeping the server editor path and its die-without-context contract.
- complete — `EventPort` **removed** (`ports/event/**` + tests + wiring): C004's
  handoff said to delete it if C005 found no consumer, and the ported TUI reads
  live host state through `DataPort` instead of subscribing to server events.
- complete — `TuiPluginContext` widened to the real TUI slices
  (`TuiPortsContext`), `makeTuiPorts`, and `tuiEntry(id, setup)`; `entry` keeps
  the server context type so the existing type test still proves
  `Plugin.Context` satisfies `PortsContext`.
- complete — adapter `./tui` widgets ported from `@montflow/pi-interactive`
  (`Dialogs` = select/searchSelect/confirm/input/alert/notify over
  `InteractionPort`, `Loading.withStatus` = locked overlay over
  `CustomViewPort`, `ModelPicker.modelOptions/pickModel` over `ModelPort`) with
  tests. Prompts' own Pi widget dependency was left alone (see Open Questions).
- complete — `@montflow/workspace` gained `./server` (`509ff7a`) and `./tui`
  faces. Server: `workspace_info` tool + `/mf-workspace` command (native store
  counts). TUI: registers the `workspace` route page, an `app` slot claim for
  the `/workspace` slash command + `ctrl+w`, and a `home.footer.status` chip fed
  by `DataPort`.
- complete — the grid page (`src/grid-page.tsx`) ports the configurable layout
  untouched (`Dashboard.flatten/cellRows/firstPanel`) and reuses the existing
  panels/detail components. Focused panel persists through `StoragePort`;
  search/confirm/notify go through `InteractionPort`; `?` renders a keymap
  overlay through `CustomViewPort`; the Info panel reads the prompt model
  through `ModelPort`; row budgets are derived from the layout instead of the
  old ref-measurement machinery.
- complete — native session surfaces reused: the page renders no session list,
  detail, prompt pane, or receipt/meta overlay. The `sessions` cell renders a
  one-line "Sessions render on the native list." placeholder; `q`/`esc`/`/workspace`
  navigate through `GridPagePort`. Deleted `sessions-panel`, `session-detail`,
  `session-detail-keys/-lines`, `session-meta`, `session-prompt`,
  `session-sections`, `session-status-icon` and their tests.
- complete — standalone app removed: `src/index.tsx` (the
  `createCliRenderer`/`render`/SIGHUP bootstrap), `start`/`dev` scripts, the
  root `workspace` script, `components/missing-pi.tsx`, `services/pi`, and the
  in-page dialog/flow/modal/toast components the route page replaced.
- complete — the list bridges gate on the **store directory**
  (`panelInstalled`) instead of `pi list`, so skills/profiles/prompts/specs read
  their native file stores in the host; `fetchSessionsList`/`sessionsKey` are
  gone with the sessions panel.
- complete — loader smoke extended: `@montflow/workspace` resolves
  `./server` + `./tui`, loads `{ id, effect }` / `{ id, setup }`, registers
  `/mf-workspace` + `workspace_info`, and the TUI setup registers the
  `workspace` page plus its two slot claims and cleans both up.
- complete — new `grid-page.test.tsx` renders the real page with a fake host
  context: asserts the five grid cells + native-session placeholder, the page
  keymap commands, and a layout without the sessions cell.
- Gate evidence (2026-10-21):
  - Spike commit: `bun run --cwd apps/workspace ts:check` → `$ tsc --noEmit`
    (clean); `test:tui` → `94 pass`, `0 fail`, `65 expect() calls`,
    `Ran 94 tests across 17 files.`; `test` → `Test Files 86 passed (86)`,
    `Tests 584 passed (584)`, `Type Errors no errors`.
  - `bun run --cwd packages/opencode test` → `Test Files 28 passed (28)`,
    `Tests 128 passed (128)`, `Type Errors no errors`.
  - `bun run --cwd packages/opencode ts:check` → `$ tsc --noEmit` (clean).
  - `bun run --cwd packages/opencode lint:check` → `$ oxlint --deny-warnings .`
    (clean).
  - `bun run --cwd packages/opencode format:check` → `All matched files use the
    correct format.`
  - `bun run --cwd packages/opencode smoke` → `12 pass`, `0 fail`,
    `58 expect() calls`, `Ran 12 tests across 1 file.`
  - `bun run --cwd apps/workspace ts:check` → `$ tsc --noEmit` (clean).
  - `bun run --cwd apps/workspace lint:check` → `$ oxlint --deny-warnings .`
    (clean).
  - `bun run --cwd apps/workspace format:check` → `All matched files use the
    correct format.`
  - `bun run --cwd apps/workspace test` → `Test Files 76 passed (76)`,
    `Tests 434 passed (434)`, `Type Errors no errors`.
  - `bun run --cwd apps/workspace test:tui` → `43 pass`, `0 fail`,
    `14 expect() calls`, `Ran 43 tests across 9 files.`
  - `TURBO_FORCE=true bun run verify:montflow` (0 cached) → `Tasks: 17
    successful, 17 total`; tests: opencode 128, workspace 434, prompts 555,
    skills 241, profiles 140, reviews 98, specs 326, pi-specs 326,
    pi-sessions 326, pi-interactive 68, core 744, format 46, linting 9,
    stlx 9, workflows 30, pi-effect 40; extension verifies: skills
    `46 skills · 0 issues` + doctor up to date, prompts `4 prompts · 0 issues ·
    0 warnings`, specs `4 specs · 0 failed · 0 issues`, profiles
    `11 profiles · 0 issues · 0 warnings`, sessions doctor ok, reviews
    `17 files · 0 issues`.

## Findings

- The host keymap owns input scope, so the old app's global `useKeyboard`
  router cannot port 1:1. Each page key becomes a `KeymapCommand` with a
  comma-separated `bind`; the panel keys come from `layout.columns[].cells[].keybind`,
  so a custom `layout.json` still drives focus.
- Free-text entry (the old per-panel search typing + `usePaste`) has no host
  equivalent inside a plugin page; B004 §3 already maps it to
  `InteractionPort.select` fuzzy search, which is what the page uses (`/`).
  The host dialog filters, so no second filter widget is needed.
- `@opentui/solid` 0.5.12 declares `solid-js` peer `1.9.12` while the host
  catalog pins `1.9.15`; bun resolves a single 1.9.15 instance anyway and the
  spike passes. Keep 1.9.15 (host dedupe) rather than the peer's exact number.
- Bun's JSX transform picks up `jsxImportSource` from the invocation cwd, not
  the imported file. The loader smoke runs under `packages/opencode`, so every
  workspace `.tsx` now carries the `/** @jsxImportSource @opentui/solid */`
  pragma; that is also why the TUI test files already had it.
- `TuiPortsContext` intersects `ui`/`data` instead of extending each port's
  context: the host's server and TUI contexts legitimately disagree on `ui`,
  `data`, and `storage`, so one merged `PortsContext` would not accept the
  server `Plugin.Context`.
- `StoragePort`/`DataPort`/`GridPagePort` are synchronous by design: the host
  objects are live Solid stores, and an `Effect.sync` wrapper would drop the
  tracking that makes a chip update. The Effect-shaped ports stay
  Effect-shaped (`InteractionPort`, `ModelPort`, dispatch).
- The `GridPagePort.keymapLayer` call must happen inside a component body; the
  always-on `/workspace` command lives in the `app`-slot render
  (`contributions.tsx`) for exactly that reason, not in `setup`.
- Row budgets come from `Dashboard.cellRows` (already computed for the layout),
  so the ported page no longer needs the ref-measurement `createEffect` cycle
  the standalone app used to size lists.

## Open Questions

- `ModelPort` has no TUI setter: 2.0.18 exposes `ui.model.variant.set` but no
  model-switch API. The page therefore only *reads* the prompt model; a
  workspace-side model picker (the ported `Widgets.ModelPicker` used it in the
  Pi app) needs a host model-selection seam before it can do anything.
- The workspace data layer still contains Pi-era flows that no plugin face
  reaches any more: `services/sessions/**` (dispatch, steer/answer/interrupt,
  extension probes), the `installSkills/installProfile/installPrompts` helpers
  and their `npx`/`pi` shell-outs, plus the `isExtensionInstalled` probes
  (nothing gates on them since the list bridges moved to `panelInstalled`).
  Deleting them with their tests is the natural C006/C007 cleanup; this task
  kept them to avoid deleting a tested 3k-line layer outside its requirements.
- `@montflow/prompts` still depends on `@montflow/pi-interactive` for its
  `interactive.apps.module` (dialogs/model-picker types + pure helpers). The
  adapter now ships host-backed equivalents (`Widgets.*`), but prompts' TUI
  face is still a load-only stub, so switching it over would add an unused
  surface; deferred.
- Receipt/lifecycle: B004 drops `Receipt`, `verifySession`, `Replay.*`, and
  `session_verify`. The delete is complete for the UI surfaces; the
  `packages/pi-sessions` exports themselves are C006's.
- `layout.json` still ships a `sessions` cell (B004 Open Q4). The page renders
  it as the native-list placeholder instead of rewriting the shipped layout;
  regenerating the file is a data change, not a code one.

## Handoff

Files:
`packages/opencode/src/modules/ports/{view,data,storage,grid-page}`,
`ports.module.ts`, `ports/index.ts`, `plugin-entry/plugin-entry.module.ts`,
`packages/opencode/src/tui.ts`, `packages/opencode/src/widgets/**`,
`packages/opencode/test/plugin-loader.test.ts`,
`apps/workspace/src/{server.ts,tui.tsx,grid-page.tsx,contributions.tsx,index.ts}`,
`apps/workspace/src/components/**` (session surfaces deleted, pragmas added),
`apps/workspace/src/modules/index.ts`, `apps/workspace/src/services/index.ts`,
`apps/workspace/src/services/query/query.services.module.ts`,
`apps/workspace/package.json`, `package.json`, `bun.lock`.

Commits: `438766a build(workspace): pin opentui 0.5.12 and solid-js 1.9.15 from
the host catalog`, `cd4ba06 feat(opencode): add TUI view, data, storage, and
grid-page ports`, `509ff7a feat(workspace): serve the grid as one OpenCode TUI
route page`, `6e1d638 feat(workspace): read the prompt model through ModelPort
in the info panel`, plus a doc-wording commit.

Next: C006 deletes `packages/pi-sessions` (still installed here by design, and
still imported by the workspace services listed in Open Questions). C007 owns
the real-host verification and distribution gate.

## Deviations

- "Implement the adapter `./tui` widgets from `pi-interactive`" landed as
  `Dialogs`, `Loading.withStatus`, and `ModelPicker` under
  `packages/opencode/src/widgets/`, exported as `Widgets` from the `./tui`
  entry. The Pi `Widget`/`Batch`/`Title` builders have no host analog (the
  host renders JSX), so they were not recreated.
- `EventPort` was deleted rather than given a consumer; the TUI reads the live
  host data layer through `DataPort`.
- The grid page no longer offers create/modify flows: authoring now runs
  through the native `/mf-skills`, `/mf-profiles`, and `/mf-prompts` commands
  (the server faces from C003/C004) and the native session UI. The page keeps
  list/search/open/scroll/delete/refresh, which is the read-and-organize surface
  the native session routes do not cover.
- `apps/workspace` stays a package under `apps/` (B001's placement call) but is
  now a plugin manifest: `exports "."/"./server"/"./tui"`, peers on OpenTUI,
  no `start`/`dev`.
- `./tui` resolves to `src/tui.tsx` (not `.ts`) because it returns JSX for the
  slot claims; the loader smoke asserts that exact path.
