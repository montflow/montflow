# Memory

## Context

Mapped the `apps/workspace` fullscreen OpenTUI/Solid dashboard and the
`packages/pi-interactive` widgets onto OpenCode's v2 TUI plugin surfaces
(`packages/plugin/src/tui/**`, `packages/tui/src/**`), against the pinned reference
clone `.agents/references/opencode/` @ `v2.0.18`. The workspace is one `App`
component (`apps/workspace/src/app.tsx`, 4271 lines) that owns its own renderer,
configurable multi-column grid, key capture, and overlays, and drives every store
through `pi` CLI shell-outs plus an in-process `@montflow/pi-sessions` engine. Under
the A003 retire-`pi-sessions` verdict, the session list/detail/dispatch surfaces
collapse onto OpenCode's native session view + subagent sessions and the
receipt/lifecycle ledger is dropped.

## Progress

- 2026-10-13: complete

## Findings

### A. Workspace inventory

- **Entry / composition root** — `apps/workspace/src/index.tsx`: `createCliRenderer({...})` (L32-46), reads the grid once from `<root>/.agents/@montflow/dashboard/layout.json` (L55-63), probes `Pi.isInstalled()` (L69) and gates on `MissingPi` (L83). `apps/workspace/src/app.tsx` `App` owns grid, keys, overlays (L372-4270).
- **Panels** — `apps/workspace/src/modules/dashboard/dashboard.module.ts:4-11` `PANELS` = `info | skills | prompts | sessions | specs | profiles` (titles `Info`, `Skills`, `Prompts`, `Sessions`, `Specs`, `Profiles`). Rendered at `app.tsx:4066-4179`; per-panel components `src/components/{info,skills,profiles,prompts,sessions,specs}-panel.tsx`.
- **Details** (open over the grid) — skill `skill-detail.tsx`, profile `profile-detail.tsx`, prompt `prompt-detail.tsx`, spec `spec-detail.tsx`, session `session-detail.tsx` + `session-meta.tsx` + `session-prompt.tsx`; action menu `detail-actions.tsx`.
- **Grid layout source** — `.agents/@montflow/dashboard/layout.json` (version 2), decoded by `Dashboard.decodeLayoutJson` (`dashboard.module.ts:81-90`); schema `Cell`/`Column`/`Layout` (`dashboard.module.ts:23-44`); `DEFAULT_LAYOUT` (`dashboard.module.ts:52-72`). **The shipped file is stale**: it uses `"panel": "runs"` (`layout.json:15`) with keybind `r`, an id absent from `PANELS`, so that cell falls through to `<PanelMessage message="No data source yet." />` (`app.tsx:4170-4171`); the app's own default uses `sessions`. `flatten`/`firstPanel`/`cellRows`/`selectByKeybind` (`dashboard.module.ts:97-149`) own layout math.
- **Keybinds** — panel keys from the layout (`i/s/p/r/e/f`); detail/list/search/flow keys centralized in `src/components/keybinds.ts` (`Keybinds`, L28-143). Dispatch: `useKeyboard` (`app.tsx:3109-3117`) → `handleKey` (L3134), overlay router `handleDialogKey` (L2024), session-detail intent router `sessionDetailIntent` (`src/components/session-detail-keys.ts`). Paste via `usePaste` (`app.tsx:3119`).
- **Overlays** — `src/components/dialogs.tsx`: `MenuDialog` (L56), `InputDialog` (L118), `FilterDialog` (L212), `RemoveDialog` (L267), `FlowModal` (L312), `FlowErrorModal` (L373); `src/components/delete-modal.tsx`, `modal.tsx` (shell), `toast.tsx` (`ToastStack` L56), `loader.tsx` (`Loader` L66). Promise-backed `DialogState = MenuState | InputState | FilterState | RemoveState` (`app.tsx:80-123`), opened by `askMenu`/`askInput`/`askFilter`/`askRemove` (L614-726).
- **`pi` + process shell-outs** (all in `src/services/**`): `services/pi/pi.services.module.ts:26` `execFile('pi', ['--version'])`; `services/skills/skills.services.module.ts:307` `pi list`, `:736` `spawn('pi', headlessArgs(prompt, modelLabel))` where `headlessArgs` = `-p --no-session --tools read,write,edit [--model …] prompt` (L696-706); `services/prompts/prompts.services.module.ts:224`, `profiles/profiles.services.module.ts:219`, `sessions/sessions.services.module.ts:361` all `execFile('pi', ['list'])`; `npx` installs at `skills…:338,1307`; `git` at `git-info/git-info.services.module.ts:43`.
- **Engine coupling** — `services/sessions/sessions.services.module.ts:123` dynamic-imports `@montflow/pi-sessions`; type-only `SessionDetail as EngineSessionDetail` imports in `sessions` (L14), `skills` (L12), `profiles` (L11), `prompts` (L10), `specs` (L5). `services/specs/specs.services.module.ts:547` `Sessions.startSession(...)` dispatches author/execute sessions through the engine.

### B. Per-panel / detail / overlay → target surface

Targets: **route** = fullscreen plugin page (`ui.router.register`/`navigate`, `Route` `plugin`); **panel** = `ui.panel.open(name, {presentation})` → `session.panel`; **slot** = a `SlotMap` claim (`ui.slot`).

| Workspace surface | Current | Target surface | Rationale |
|---|---|---|---|
| Info panel (workspace name/root/branch/clean) | grid cell | **slot** `home.footer.status` (in-session: `sidebar.footer`) | Tiny persistent global chrome, not session-scoped; `app.tsx:4096-4097`, `info-panel.tsx`. |
| Skills panel (list + search + create/modify/delete) | grid cell | **route** (fullscreen "workspace" page) | Global store, not session-scoped; wants a full grid + detail. `skills-panel.tsx`. |
| Profiles panel | grid cell | **route** | Same shape as Skills (`profiles-panel.tsx`). |
| Prompts panel | grid cell | **route** | Same shape (`prompts-panel.tsx`). |
| Specs panel | grid cell | **route** | Global store (`specs-panel.tsx`); spec-detail also route. |
| Sessions panel (Active/All list) | grid cell | **native** (reuse OpenCode home/session list + `ui.tabs`); fallback **slot** `sidebar.content` | A003 retire verdict; native list supersedes `sessions-panel.tsx`. |
| Skill/Profile/Prompt detail (+ action menu) | full-screen sub-view | **route** full-view, or **panel** (fullscreen) when opened in-session | `skill-detail.tsx`, `profile-detail.tsx`, `prompt-detail.tsx`, `detail-actions.tsx`. |
| Spec detail | full-screen sub-view | **route** | `spec-detail.tsx`. |
| Session detail (meta + prompt + transcript) | full-screen sub-view | **native session view** (optional **panel** `session.panel` claim for a custom transcript) | A003: native session view supersedes `session-detail.tsx`/`session-meta.tsx`/`session-prompt.tsx`. |
| Keybind banner / status hints | grid + `StatusBar` | **slot** `prompt.footer` / `session.composer.top` + `Keymap` commands | `status-bar.tsx`, `keybind-banner.tsx`, `keybinds.ts`. |
| Panel search/filter + per-panel keys | `useKeyboard` capture | **`Keymap`** layer commands (palette/slash/binds) | Host owns input scope; `keybinds.ts`. |
| Menu / Input / Filter / Remove overlays | Promise-backed `DialogState` | **`ctx.ui.dialog`** (`select`/`prompt`/`confirm`/`show`) | See §C. |
| Flow / Flow-error overlays | `FlowModal`/`FlowErrorModal` | **`Toast.show`** + `Attention.notify`; `dialog.show(JSX)` for the spinner | See §C. |
| `ToastStack` | bottom-anchored | **`Toast.show`** | `toast.tsx:56`; host `packages/tui/src/ui/toast.tsx`. |
| `MissingPi` startup gate | gates on `pi --version` | **dropped** | Host always present; `missing-pi.tsx`, `index.tsx:69,83`. |
| Whole grid + custom `StatusBar` | `App` top-level | **route** page chrome | Host owns app chrome; grid is page-owned (§E). |

### C. `pi-interactive` widgets / `ctx.ui.custom` → OpenCode dialogs, slots, Solid

| pi-interactive surface | File / symbol | OpenCode target |
|---|---|---|
| `ctx.ui.custom` port (`CustomUi.custom`, `FilterUi.custom`) | `dialogs.module.ts:13,22`; `filter-select…:12`, `model-picker…:13`, `menu…:13` | `ctx.ui.dialog.show(render: () => JSX.Element, onClose?)` (`packages/plugin/src/tui/context.ts:372`) — arbitrary Solid; `dialog.set({...})` for size. |
| filter-select (`filterSelectDialog`, `searchSelect` port, `matchesFilter`/`filterOptions`) | `filter-select.widgets.module.ts:76,158`; `dialogs.module.ts:17` | `dialog.select<Value>({title, options, current?})` — **host-side fuzzy search** over `title`/`category`/`searchText` (`packages/tui/src/ui/dialog-select.tsx:185-198`); delete the widget's own matcher. |
| model-picker (`modelPickerDialog`, current pinned first) | `model-picker.widgets.module.ts:87`; `dialogs.module.ts:36` | `dialog.select` with `current` (`context.ts:362-367`) + `ui.model.current()`/`ui.model.variant.*` (`context.ts:502-511`); catalogue from `ctx.model`/`ctx.provider` (A002 §2) instead of `ModelSource` (`model-options.module.ts`). |
| menu (`menuDialog`, info panel) | `menu.widgets.module.ts:39`; `dialogs.module.ts:53` `MenuFn` | `dialog.select` (option `description`/`category`/`footer` carry context, `context.ts:355-369`); use `dialog.show(JSX)` only if the info panel is required. |
| loading (`dialog`, `run`; input-locking spinner) | `loading.widgets.module.ts:61,100`; `dialogs.module.ts:43` `LoadingFn` | No native analog: `Toast.show` (progress/info) + `Attention.notify`; `dialog.show(JSX)` spinner if input must be locked. |
| `InteractiveUi.select/confirm/input/notify` | `dialogs.module.ts:11-18`; workspace adapter `app.tsx:732-741` | `dialog.select` / `dialog.confirm` / `dialog.prompt` / `Toast.show`\|`Attention.notify` (`context.ts:269-325,371-382`). |
| Workspace `MenuDialog`/`InputDialog`/`FilterDialog`/`RemoveDialog` | `components/dialogs.tsx` | Same host dialogs; markup ports but manual key routing (`app.tsx:2024` `handleDialogKey`) is replaced by host dialog input scope. |
| `RemoveConfirm` timed countdown | `modules/remove-confirm/remove-confirm.module.ts`; `askRemove` `app.tsx:702-726` | `dialog.confirm` (host); drop the custom countdown (or `dialog.show(JSX)`). |
| `FlowModal`/`FlowErrorModal`/`ToastStack` | `components/dialogs.tsx:312,373`, `toast.tsx` | `Toast.show` + `Attention.notify`; retry/back error is a `dialog.confirm`/`show(JSX)`. |

### D. Renderer/component version gap

- **Workspace pins** — `apps/workspace/package.json:42-47`: `@opentui/core ^0.5.11`, `@opentui/solid ^0.5.11`, `solid-js 1.9.12`, `effect ^4.0.3`. Lockfile resolves `@opentui/core 0.5.11`, `@opentui/solid 0.5.11` (peer `solid-js 1.9.12`), `solid-js 1.9.12`, `effect 4.0.3` (`bun.lock:642,660,1364,1002`).
- **Plugin peer floor** — `.agents/references/opencode/packages/plugin/package.json:40-45`: `@opentui/core >=0.5.12`, `@opentui/solid >=0.5.12`, `solid-js >=1.9.0`; host catalog pins `@opentui/core|solid 0.5.12` and `effect 4.0.0-rc.112` (A002 §5a).
- **Gap verdict**: `@opentui/* 0.5.11` is **below** the `>=0.5.12` floor → both `@opentui` packages must bump. `solid-js 1.9.12` satisfies `>=1.9.0` (equal to host patch). `effect 4.0.3` numerically exceeds host `4.0.0-rc.112`, but plugin `effect` imports are redirected to the running host's in-process copy (A002 §5b), so the workspace's own pin matters only for code outside the host — align to the host version when the code becomes a plugin.
- **Ports unchanged** (pure OpenTUI/Solid, `box`/`text`/`span`/`markdown`/`scrollbox`): `Panel`, `PanelMessage`, `InfoPanel`, `KeybindBanner`, `StatusBar`, `Loader`, `ToastStack`, `DetailActions`, `SessionMeta`, `SessionDetail`, `MarkdownBody`/`markdown-window`, `spec-markers`, `palette` (`@opentui/core` `TextAttributes`/`SyntaxStyle`/row renderables exist in 0.5.12).
- **Not portable as-is**: `App` (owns `useKeyboard`/`usePaste`/`useRenderer`/`useTerminalDimensions` + process lifecycle, `index.tsx:32-46`), `MissingPi` (`pi` probe), per-panel search/typing state machines, and the dialog/overlay key routers → host dialogs/keymap/slots. `@tanstack/solid-query` itself is fine, but data comes from `ctx.data` instead of `pi` shell-outs.

### E. Native-session reuse, receipt-overlay fate, grid + transcript placement

- **Native-session reuse (retire `pi-sessions`)** — the workspace's session list, detail, dispatch, steer, answer, and interrupt reuse OpenCode's native session view + subagent sessions. `app.tsx` handlers `interruptSession`/`runSteerFlow`/`runAnswerFlow` and `Sessions.startSession` (`specs…:547`) map to `ctx.session.interrupt`/`ctx.session.prompt` (delivery `steer`) / the `question` tool + `Form`, and to `sessions.create({ parentID })` + `subagent` for author/execute dispatch (A003 §2, §6). The `sessions-panel.tsx` Active/All list is superseded by the native list + `ui.tabs`.
- **Receipt/lifecycle overlay fate** — dropped to a minimum. A003 deletes `Receipt`, `Store.settle/cancel`, `session_verify`/`verifySession`, and `Replay.*`; terminal outcome derives from `session.execution.succeeded/failed/interrupted` + last assistant message. The workspace's `SessionMeta` receipt summary (`session-meta.tsx:64-70`, reading `detail.receipt`) is **dropped**; the session-detail meta/prompt/transcript columns collapse onto the native session view. Only a minimal status projection (in `session.composer.top`/`sidebar.footer`) survives if wanted.
- **Configurable grid** — lives in a **fullscreen plugin route page** (`ui.router.register` + `navigate`; `Route`/`Destination` `context.ts:142-157`). The multi-column grid is not a session concept, so it cannot be owned by `session.panel`; cheap cells (Info, keybinds) may instead be slot claims, but the grid itself is page-owned. The current grid source file stays `.agents/@montflow/dashboard/layout.json` (version-2 schema, `dashboard.module.ts`).
- **Session transcript** — lives in the **native session view** (OpenCode `packages/session-ui/src` message/markdown/timeline components, A002 §3). A custom transcript can be a `session.panel` claim: host `packages/tui/src/component/panel-host.tsx:32-58` renders `session.panel` with `PanelInput { name, sessionID, width, presentation, focused, focus, close, toggleFullscreen }` (`context.ts:167-178`), so `presentation: "fullscreen"` gives it the whole session area.
- **What the main-session layout cannot host**: (1) the workspace's own top-level column grid + spanning `StatusBar` — OpenCode owns app/page chrome; (2) arbitrary whole-screen overlays that steal input — the host owns input scope, overlays must be `dialog.show` or `session.panel`; (3) its own renderer lifecycle (`createCliRenderer`, `process.exit`, SIGHUP) — host owns the renderer; (4) the `pi`-CLI startup gate (`MissingPi`); (5) global `useKeyboard` capture (`app.tsx:3109`) — host keymap owns keys; (6) `home`/non-session chrome in `sidebar.content`/`sidebar.footer` — those slots are session-scoped (`sessionID`), so home chrome must use `home.footer*`.

## Open Questions

1. One plugin **route page** hosting the whole configurable grid vs. per-panel decomposition into `session.panel`/slot claims — decides how much of `App` survives; park for B004.
2. `@opentui` 0.5.11 → 0.5.12 compatibility of the workspace's native usage (`onSizeChange` in `markdown-body.tsx:97`, `scrollbox stickyScroll`, `textarea keyBindings`) — needs a spike.
3. `effect` numbering: workspace `4.0.3` vs host `4.0.0-rc.112` — confirm which is semantically newer and whether the host redirection (A002 §5b) fully covers the workspace's own `effect` usage.
4. Shipped `layout.json` uses the stale `"runs"` panel id (`layout.json:15`) where `PANELS` has `sessions` — migrate or regenerate the grid source? (data bug, not a port blocker.)

## Handoff

- Feeds B004 decide-workspace-integration and A006 synthesize-migration-contract.

## Deviations

- None.
