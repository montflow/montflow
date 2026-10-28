# Memory

## Context

B004 decides the workspace's target OpenCode integration surface: the split between a
server plugin, a TUI plugin route, and main-session contributions; the per-panel
placement; native-session reuse and the receipt/lifecycle overlay fate; the
OpenTUI/Solid upgrade path; and the fate of the standalone app and the `pi` probe.
Inputs: A004 (workspace/UI → TUI surface mapping), A006 §3/§4/§5 + Open Q3/Q4/Q12,
A002 §3 (TUI surfaces). Evidence is the workspace tree `apps/workspace/src/**` and the
pinned clone `.agents/references/opencode/` @ `v2.0.18`
(`packages/plugin/src/tui/**`, `packages/tui/src/plugin/**`).

Locked inputs (not revisited): the workspace becomes an OpenCode **TUI plugin route
(grid dashboard) + server plugin (services/dispatch)** and the **standalone app is
retired**; **OpenTUI target `>=0.5.12`** (SPEC §49 "0.5→0.6" wording superseded by this
evidenced target); transcripts local-only; `pi-sessions` deleted; authoring API
**Effect**; distribution **private Git/local**.

## Progress

- 2026-10-13: complete

## Findings

### 1. Surface split — three surfaces, one package, two entrypoints

| Surface | Entrypoint / API | Owns |
|---|---|---|
| **Server plugin** | `@montflow/workspace` server entry (`./server`), **Effect** authoring (`Plugin<R> = { id, effect }`, A002 §1 `plugin.ts:56-59`) | montflow **services** + **native projection** + **dispatch** |
| **TUI plugin** | same package `./tui` entry, Promise `Definition.setup` (`packages/plugin/src/tui/plugin.ts:7-14`) | the **grid route page** + slot claims + `session.panel` claims + keymap layer |
| **Main-session contributions** | slots / keymap / route navigation from the TUI plugin `setup` | minimal in-session chrome only |

**Server plugin (services + dispatch).** It absorbs the workspace service layer
(`apps/workspace/src/services/**` — `git-info`, `skills`, `prompts`, `profiles`,
`specs`, `sessions`, `query`; `services/index.ts:1-8`) and re-points it off `pi`.
Both entries reach the host **only through the B002 adapter ports** — never
`@opencode/*`, `ctx.client`, or `ctx.ui` directly (B001 §4).

- **Native projection** (through adapter ports) — the montflow artifacts that have a
  first-class OpenCode domain are registered so native surfaces reflect them: prompts →
  `CommandPort` (→ `ctx.command` transform, `command.ts:1-27`), profiles → `AgentPort`
  (→ `ctx.agent` transform), skills → `SkillPort` (→ `ctx.skill` transform,
  `skill.ts:1-17`), and the missing `notify_user`/`toast_user`/`update_status` tools →
  `NotifyPort`/`ToolPort` (→ `ctx.tool` transform) bridging to
  `Toast.show`/`Attention.notify`/`session.synthetic` (A006 §1/§3, `tool.ts:1-60`).
  Slash commands via `CommandPort` (`CommandEditor.add`).
- **Dispatch** — author/execute flows dispatch through the adapter
  `SessionDispatchPort` (B002 §1/§4), which fronts native sessions:
  `create({ parentID })` + `prompt` + the native `subagent` tool
  (`packages/*/tool/plugin/subagent.ts`; A003 §2/§6), replacing
  `Sessions.startSession` (`services/specs/specs.services.module.ts:547`). `steer`/
  `answer`/`interrupt` map to `SessionDispatchPort.prompt` (delivery `steer`) / the
  `question` tool + `Form` / `SessionDispatchPort.interrupt` (`session/inbox.ts`; A003 §2).
- **Service reads** — drop every `pi` shell-out: `pi --version`
  (`services/pi/pi.services.module.ts:26`), `pi list` (`skills…:307`, `profiles…:219`,
  `prompts…:224`, `sessions…:361`), `npx` installs (`skills…:338,1307`), and the
  headless `spawn('pi', …)` author run (`skills…:736`). Stores are read directly from
  their filesystem roots (`specsDir`/`reviewsDir`, `specs.services.module.ts:64-67`)
  through the shared service modules.

**TUI plugin (grid dashboard).** The `App` render tree becomes one registered route
page; it **imports the same service modules** as the server entry for read-only grid
data (the TUI plugin runs in-process and already reads local files — reference TUI
plugins import `fs/promises`/`path`, `packages/tui/src/plugin/context.tsx:16-18`). It
drives user-initiated dispatch through the adapter `SessionDispatchPort`, whose TUI half
wraps `ctx.client.session.create/prompt/interrupt` (B002 §4), and navigates with
`GridPagePort.navigate` to the native session route. It never touches `ctx.client` or
`ctx.ui` directly. If remote-server support is ever required, a `./rpc` bridge
(`packages/plugin/src/effect/rpc.ts:24-29`; A005 §4) is the fallback channel (parked,
§Open Questions).

**Main-session contributions.** Deliberately tiny, all through ports: an info chip
claimed as a `GridPagePort.slot` in `home.footer.status`
(`feature-plugins/home/footer.tsx:95`), keybind/status hints as slots in
`prompt.footer` / `session.composer.top` (`context.ts:195-199`), and a `/workspace`
`CommandPort` slash command (+ keybind) that calls `GridPagePort.navigate`. Nothing else
enters the session.

### 2. Workspace decomposition decision (A006 Open Q4) — **one grid route page**, not per-panel claims

**Decided: the whole configurable grid lives in a single fullscreen TUI plugin route
page** (`GridPagePort.registerPage({ name: "workspace", render })` +
`GridPagePort.navigate({ type: "plugin", name: "workspace" })`, fronting
`ctx.ui.router.register/navigate` (`context.ts:468-472`); host renders it via
`PluginRoute`/`PluginBoundary`, `packages/tui/src/plugin/render.tsx:48-71`).
Precedents: `stats.tsx:186-189`, `diff-viewer.tsx:1219`.

Rejected alternatives and why:

- **Per-panel `session.panel` claims** — impossible to express a grid.
  `CustomViewPort.panel.open` only works on a session route and returns `false` otherwise
  (`api.tsx:203-209`), and a plugin has exactly **one** active panel
  (`CustomViewPort.panel.current()` returns one `{name, sessionID}`, `context.ts:473-480`;
  `context/panel.tsx:10-15` holds a single `current`). Six simultaneous panels cannot
  be claimed.
- **Per-panel slot claims** — slots are named boundaries claimed via `GridPagePort.slot`
  (`SlotMap`, `context.ts:191-202`: `app`, `home.footer*`, `prompt.footer*`,
  `session.composer.top`, `session.panel`, `sidebar.content/footer`), not a layout
  engine; they cannot host stacked/columned cells.
- **Per-panel separate routes** — multiplies registrations and loses the configurable
  multi-column grid + spanning `StatusBar` (`app.tsx:4066-4181`), the workspace's
  defining feature.

The grid source stays `.agents/@montflow/dashboard/layout.json` (version-2 schema;
`Dashboard.decodeLayoutJson`, `dashboard.module.ts:81-90`) or migrates to the adapter
`StoragePort` (→ `ctx.storage.store`, `context.ts:36-41`); the page-local layout math
(`flatten`/`cellRows`/etc., `dashboard.module.ts:97-149`) ports unchanged. Panel keys
become a route-scoped `GridPagePort.keymapLayer({ target, commands })` bound to the
page's focused renderable (`KeymapLayer.target`, `context.ts:418`, backing
`ctx.ui.keymap.layer`); the host owns all other input scope.

### 3. Per-panel placement (draft: A004 §B, folded into the one-route-page decision)

| Panel | Target surface | Container / notes |
|---|---|---|
| Info (name/root/branch/clean) | **slot** `home.footer.status` + **route** cell | persistent global chrome; `info-panel.tsx`, `app.tsx:4096-4097` |
| Skills (list/search/create/modify/delete) | **route** cell | global store; `skills-panel.tsx`; create/modify dispatch → native session |
| Prompts | **route** cell | `prompts-panel.tsx`; also projected via `CommandPort` (→ `ctx.command`) by the server plugin |
| Profiles | **route** cell | `profiles-panel.tsx`; also projected via `AgentPort` (→ `ctx.agent`) by the server plugin |
| Specs | **route** cell | `specs-panel.tsx`; `spec-detail.tsx` as an in-page sub-view |
| Sessions (Active/All list) | **native** (home/session list + host `ui.tabs`) | `sessions-panel.tsx` deleted; tabs are host chrome (`ui.tabs.*`, `context.ts:481-501`); the plugin only navigates via `GridPagePort.navigate` |
| Skill/Profile/Prompt detail (+ action menu) | **route** sub-view, or **panel** `session.panel` when opened in-session | `skill-detail.tsx`/`profile-detail.tsx`/`prompt-detail.tsx`/`detail-actions.tsx` |
| Spec detail | **route** sub-view | `spec-detail.tsx` |
| Session detail (meta + prompt + transcript) | **native session view** (+ optional custom transcript as `session.panel` fullscreen claim) | native `routes/session/**`; `PanelInput`, `context.ts:167-178` |
| Keybind banner / status hints | **slot** `prompt.footer`/`session.composer.top` via `GridPagePort.slot` + `KeymapCommand` | `keybind-banner.tsx`, `status-bar.tsx`, `keybinds.ts` |
| Per-panel search/filter/typing state | **`Keymap` layer** via `GridPagePort.keymapLayer` + `InteractionPort.select` fuzzy search | host-side matcher, `dialog-select.tsx:185-198` |
| Menu/Input/Filter/Remove overlays | **`InteractionPort`** (`select`/`prompt`/`confirm`) + **`CustomViewPort`** (`show`) | `dialogs.tsx`; `context.ts:371-382` |
| Flow / flow-error / toasts | **`InteractionPort.notify`/`.attention`**; `CustomViewPort.show(JSX)` for a locked spinner | `dialogs.tsx:312,373`, `toast.tsx:56`; `context.ts:269-325` |

### 4. What stays out of the main session

A004 §E's list, confirmed as B004's exclusion set: (1) the workspace's own top-level
column grid + spanning `StatusBar` — host owns page/app chrome; (2) arbitrary
whole-screen overlays that steal input — host owns input scope, so they become
`CustomViewPort.show` or a `session.panel` claim; (3) its own renderer lifecycle
(`createCliRenderer`/`process.exit`/SIGHUP, `index.tsx:32-67`) — host owns the
renderer; (4) the `pi`-CLI startup gate (`MissingPi`); (5) global `useKeyboard`
capture (`app.tsx:3109-3117`) — host keymap owns keys; (6) home/non-session chrome in
session-scoped slots (`sidebar.content`/`sidebar.footer` carry `sessionID`,
`context.ts:200-201`) — must use `home.footer*` instead.

### 5. Native-session reuse + receipt/lifecycle overlay fate

**Reuse native sessions; delete the montflow session surfaces** (A003 §2/§5/§6):

- **Session list** — `sessions-panel.tsx` (Active/All) is superseded by the native
  home/session list + host `ui.tabs` (`context.ts:481-501`).
- **Session detail** — `session-detail.tsx`/`session-meta.tsx`/`session-prompt.tsx`
  collapse onto the native session view (`packages/tui/src/routes/session/**`). A
  custom transcript is optional and only as a `session.panel` claim with
  `presentation: "fullscreen"` (`CustomViewPort.panel.open(name, { presentation:
  "fullscreen" })`, `context.ts:473-475`; host `panel-host.tsx:32-58`).
- **Dispatch** — `SessionDispatchPort.create({ parentID })` + native `subagent` + `Job`
  background (A003 §2); navigate with `GridPagePort.navigate` to
  `{ type: "session", sessionID }`.
- **Steer / answer / interrupt** — `SessionDispatchPort.prompt` (delivery `steer`) /
  `question` tool + `Form` (TUI reply via `DataPort.session.form.reply`, `context.ts:98`) /
  `SessionDispatchPort.interrupt`.
- **Receipt/lifecycle overlay — dropped.** `SessionMeta`'s receipt summary
  (`session-meta.tsx:64-70`, reading `detail.receipt`) is deleted; `Receipt`,
  `Store.settle/cancel`, `session_verify`/`verifySession`, and `Replay.*` are gone
  (A003 §5). Terminal outcome derives from `session.execution.succeeded/failed/
  interrupted` + the last assistant message; the only surviving projection is an
  optional minimal status line in `session.composer.top`/`sidebar.footer`.

### 6. OpenTUI/Solid upgrade path + concrete component port

**Pins.** Raise `@opentui/core` and `@opentui/solid` from `^0.5.11` (lockfile
`0.5.11`, `apps/workspace/package.json:42-43`) to **`>=0.5.12`**, resolved `0.5.12`
(host catalog, A002 §5a `packages/plugin/package.json:40-45`). Because TUI plugins must
not bundle `@opentui/*`/`solid-js` (A005 §2), move them to **peerDependencies**
(`@opentui/core|solid >=0.5.12`, `solid-js >=1.9.0`) with devDependencies pinned to the
host catalog. Align `solid-js` to the host catalog **`1.9.15`** (currently `1.9.12`
satisfies `>=1.9.0` but the host overrides force 1.9.15, so pinning 1.9.15 avoids a
second instance). Keep authoring **Effect** (locked); `effect` alignment is parked to
B006 (§Open Questions).

**Component port classes:**

- **Unchanged (lift-and-shift pure OpenTUI/Solid)** — `Panel`, `PanelMessage`,
  `InfoPanel`, `KeybindBanner`, `StatusBar`, `Loader`, `ToastStack`, `DetailActions`,
  `SessionMeta` (minus receipt), `SessionDetail`, `MarkdownBody`/`markdown-window`,
  `spec-markers`, `palette`, `profile-verify-icon`, `session-status-icon`,
  `session-detail-lines`, `session-sections` (A004 §D).
- **Adapt — needs the `0.5.11→0.5.12` spike** — `markdown-body.tsx:97`
  `onSizeChange`; `scrollbox stickyScroll` in the markdown/detail windows; `textarea
  keyBindings` in `session-prompt.tsx`/inputs; `useTerminalDimensions` usage (A004 §D,
  Open Q2).
- **Rewrite / decompose** — `App` (`app.tsx:372-4270`): grid becomes the route page
  `Page.render`; input becomes `GridPagePort.keymapLayer`; renderer/process lifecycle and
  `usePaste`/`useRenderer` are deleted. `index.tsx` composition root loses
  `createCliRenderer`/`render`/SIGHUP. `MissingPi` deleted. Per-panel search/typing
  state machines fold into `InteractionPort.select` fuzzy search or page-local state.
  Dialog/overlay key routers (`handleDialogKey`, `app.tsx:2024`) are replaced by host
  dialog input scope. `@tanstack/solid-query` stays as the route page's page-local
  cache for montflow-store reads (host-agnostic), or is replaced by plain signals.
- **Data source** — `pi` shell-outs become shared-service reads; native domains come
  from the adapter `DataPort` (TUI read facade over `ctx.data`, `context.ts:63-140`) and
  `SessionDispatchPort` (client-backed, `ctx.client`); small durable UI state from
  `StoragePort` (`ctx.storage.store`, `context.ts:36-41`).

### 7. Standalone app + `pi`-probe fate

- **Retire the standalone app.** `apps/workspace` stops being a runnable fullscreen
  app: remove the `start`/`dev` scripts (`apps/workspace/package.json:24-25`) and the
  `src/index.tsx` renderer/composition root. Components/services move into the
  `@montflow/workspace` package's server (`./server`) and TUI (`./tui`) entries;
  `package.json` becomes a plugin manifest
  (`exports { ".": library, "./server": server, "./tui": tui }`, optional `./rpc`; peers
  `@opentui/* >=0.5.12`, `solid-js >=1.9.0`). Where the code physically lands
  (`apps/workspace` reshaped vs a new `packages/*`) is B001's package-architecture call.
- **Remove the `pi`-probe fallback entirely (recommended).** Delete the
  `Pi.isInstalled()` gate (`index.tsx:69`), the `MissingPi` branch (`index.tsx:83`,
  `components/missing-pi.tsx`), and the `pi --version` shell-out
  (`pi.services.module.ts:26`). The host is always present; no fallback. All other
  `pi` shell-outs (`pi list`, headless `spawn('pi', …)`, `npx` installs) are replaced
  by direct store/native reads as in §1.

## Open Questions

1. **Effect dedupe (A006 Q2/Q3) — decision: align montflow's `effect` to the host
   `4.0.0-rc.112`** and declare it an external, since `effect` is outside the six-
   specifier redirect map (A005 §2) and would otherwise dual-instance. Concrete
   dedupe mechanics + drift check are B006's.
2. **`0.5.11→0.5.12` native-usage spike** — confirm `onSizeChange`, `scrollbox
   stickyScroll`, and `textarea keyBindings` behavior at 0.5.12 before porting the
   adapted components (§6). Execution spike + B006.
3. **Cross-process data channel** — B004 leans on the TUI entry importing the shared
   montflow service modules (local fs, no rpc). If the TUI must run against a *remote*
   server, a `./rpc` bridge is required; park for B001/B006.
4. **Stale `layout.json`** — shipped file uses panel id `"runs"` (`layout.json:15`)
   where `PANELS` has `sessions` (`dashboard.module.ts:4-11`); migrate/regenerate
   during the workspace port (execution), not a decision.
5. **SPEC §49 wording** — "OpenTUI `0.5`→`0.6`" is superseded by the evidenced
   `0.5.11→>=0.5.12` target (locked); raise the SPEC correction at B099.

## Handoff

- Feeds B005 plan-migration-sequence and B006 plan-verification-and-distribution.

## Deviations

- None.
