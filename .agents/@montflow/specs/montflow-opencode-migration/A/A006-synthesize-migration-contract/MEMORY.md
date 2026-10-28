# Memory

## Context

Synthesis of A001–A005 into one migration contract for Phase B: the Pi-primitive →
OpenCode v2 surface → port-strategy matrix, confirmation of the retire-`pi-sessions`
verdict and its blockers, the adapter seams that isolate OpenCode, an open-risk table,
a candidate cheapest-and-most-isolating-first execution sequence, and a reconciliation
of contradictions across the five phase-A memories. Source of truth is the pinned
OpenCode reference clone at `v2.0.18` and the five memories A001–A005; every claim cites
the memory section or a file path.

## Progress

- 2026-10-13: complete

## Findings

### 1. Consolidated capability matrix

Columns: Pi primitive (A001 §"Pi-primitive → concern classification") → OpenCode v2
surface (A002 §2/§3, A003 §2, A004 §B/§C) → port strategy. Strategies: **adopt** = use
as-is / keep; **adapt** = same concept, different API shape, wrapper change; **re-layer**
= concept owned by OpenCode, montflow code rewritten onto it; **drop** = no successor /
deleted.

| Pi primitive (A001) | OpenCode v2 surface | Strategy |
|---|---|---|
| Extension entry `ExtensionAPI`, `ExtensionCommandContext` | `Plugin<R> = { id, effect }` / `{ id, setup }`; `define` identity (A002 §1 `plugin.ts:56-65`) | re-layer |
| Command registration `api.registerCommand` | command domain `CommandEditor.add` transform (A002 §2 `command.ts:1-27`); `KeymapCommand.slash` for TUI slash presence (A002 §3 `context.ts:384-410`; A004 §B keymap row) | adapt |
| Tool registration `api.registerTool` | tool domain `ToolEditor.add/update/remove` + `execute.before`/`execute.after` hooks (A002 §2 `tool.ts:1-60`) | adapt |
| Tool definition `defineTool` | tool-domain schema / `execute` contract — **no `tool()` helper in v2.0.18** (A002 §7; the stale `.opencode/tool/*.ts` import is v1-era, A002 §6) | re-layer |
| Lifecycle event `pi.on('session_shutdown', …)` | plugin `setup` cleanup / `Registration.dispose` / scope close (A002 §1); durable+busy event stream via `ctx.event.subscribe` (A002 §2 `event.ts`, A003 §2) | adapt |
| Messaging `api.sendUserMessage` | `ctx.session.prompt` / `synthetic` (A002 §2 session domain; A003 §2 ID-bound ops) | adapt |
| User interaction `ctx.ui.select/confirm/input/notify` | `ctx.ui.dialog.select` / `confirm` / `prompt` + `Toast.show` / `Attention.notify` (A002 §3 `context.ts:269-382`; A004 §C) | adapt |
| Custom TUI `ctx.ui.custom`, `ExtensionUIContext['custom']` | `dialog.show(render: () => JSX.Element, onClose?)`; `session.panel` for fullscreen (A002 §3 `context.ts:372`, `:167-178`; A004 §C/§E) | re-layer |
| Model resolution `ModelRuntime.create` | model/provider domains `ModelEditor`/`ProviderEditor` + `session.model.request` hook (A002 §2 `model.ts`, `provider.ts`) | re-layer |
| Model resolution `resolveCliModel` | model/provider resolution + `ui.model.current()`/`ui.model.variant.*` (A002 §2; A002 §3 `context.ts:502-511`) | re-layer |
| Model catalogue `ModelSource`/`ModelCatalog`/`ModelRef` (not a Pi call) | `ctx.model` / `ctx.provider` list (A002 §2; A004 §C model-picker row) | adopt |
| Session execution `createAgentSession` | `ctx.session.create` + child sessions via `sessions.create({ parentID })` + native `subagent` tool + `Job` background system (`fork` is core `Session.Interface` only — `ctx.session` exposes no `fork`; `.agents/references/opencode/packages/core/src/session.ts:122`) (A003 §2 `tool/plugin/subagent.ts`, `session/subagent-job.ts`; A003 §6) | re-layer |
| `SessionManager.inMemory`/`.open`/`.appendMessage` | native `SessionStore` SQLite + durable Bus (A003 §2 `session/store.ts`, `session-event.ts`) | drop |
| Session `prompt`/`steer`/`followUp`/`abort`/`dispose`/`subscribe`, `messages` | `ctx.session.prompt`/`interrupt`/`synthetic` + durable inbox delivery (`steer`/`queue`); continue/resume → the `subagent` tool with a child `sessionID`; message/history reads → `ctx.data.session.*` / `ctx.event.subscribe` / the client API (`ctx.session` exposes **no** `resume`/`messages`; those are core `Session.Interface` only) (A003 §2 `session/inbox.ts`, `session.ts`) | re-layer |
| Session events `AgentSessionEvent`, `Message` (pi-ai) | `ctx.event.subscribe` typed live stream + the client/session log API (`Session.log` is core, not on `ctx.session`); `session-event.ts` schema (A003 §2) | re-layer |
| Rendering `pi-tui` components | OpenTUI/Solid host components via slots/routes/panels/dialogs/markdown (A002 §3; A004 §B/§C) | re-layer |

**Per-`pi-*` package** (classifications A001 §"Package classification"; targets A003/A004/A005):

| Package | Classification | Port strategy |
|---|---|---|
| `pi-workflows` | pure-Effect, no Pi runtime, no extension; vestigial peer (A001 §Notes) | adopt (drop peer dep) |
| `pi-effect` | seam/library wrapping Pi; dynamic-import only in `runAgent` (A001) | re-layer → adapter package |
| `pi-interactive` | seam/library TUI widgets (A001) | re-layer → `ctx.ui.dialog`/slots/panels |
| `pi-notifications` | `pi.extensions` entry but no-op stub, type-only Pi import (A001) | drop (subsumed by `Toast`/`Attention`) |
| `pi-profiles` | CLI + slash + agentic child runs (`ModelRuntime`) (A001) | CLI adopt; extension re-layer |
| `pi-prompts` | CLI + slash + agentic child runs (`ModelRuntime`) (A001) | CLI adopt; extension re-layer |
| `pi-reviews` | CLI + slash + in-session dispatch (`SessionRunner`) (A001) | CLI adopt; dispatch re-layer |
| `pi-skills` | CLI + slash + in-session dispatch (`SessionRunner`) (A001) | CLI adopt; dispatch re-layer |
| `pi-specs` | pure-Effect CLI + thin slash, type-only Pi (A001) | CLI adopt; single command re-layer |
| `pi-sessions` | session-loop-owning (A001) | **drop / retire** (A003 §4) |

Every `mf-*` CLI (`mf-specs`, `mf-sessions`, `mf-profiles`, `mf-prompts`, `mf-reviews`,
`mf-skills`) is **filesystem-only at runtime** except `mf-sessions`, whose engine is
retired (A001 §"`mf-*` CLI inventory"; A003 §4). CLIs are therefore **adopt** targets.

### 2. Retire-`pi-sessions` confirmation

**Confirmed.** OpenCode's native `Session.Service` facade + `SessionExecution` +
`SessionRunCoordinator` + the `subagent` tool + `Job` background system is the single
session mechanism; no montflow-owned engine is re-introduced (A003 §4). Every
capability in A003 §3 is covered; the native surface is equal or richer (object
transport, durable inbox with `queue`, crash recovery, background jobs). All
`Runtime.activeSessionRunnerHost` consumers (A003 §6) re-point to `ctx.session` /
subagent dispatch; the workspace session adapter becomes an OpenCode client (A004 §E).

**Escalated blockers** — none retain the engine, but three items have no exact native
analog and are decisions, not engine work (A003 §4):
1. **Copyable/portable transcripts** — OpenCode persists sessions in local SQLite; the
   old `.agents/@montflow/sessions` file tree is **also local-only** (git-ignored,
   `.gitignore:266-267`). Both are durable and local; the delta is durable local file
   tree vs durable local SQLite. If a product flow needs portable session artifacts,
   re-specify as an export/projection step (A003 Open Q1). The single candidate product
   blocker, contingent on that requirement.
2. **`notify_user`/`toast_user`/`update_status`** — agent-invocable tools; no first-class
   native tool, so the replacement is a montflow-registered tool (via `ctx.tool`/ToolPort)
   bridging to `Toast.show` / `Attention.notify` / `session.synthetic` (A003 §3; A004 §C).
3. **Mechanical `session_verify`/`verifySession` ledger + `Receipt`/`Replay.*`** — dropped;
   functional minimum derives from `session.execution.*` + last assistant message
   (A003 §5).

### 3. Required adapter seams

Each seam isolates one OpenCode surface; montflow code depends on the seam, never the
host API directly. "Serves" = pi-* packages / apps the seam fronts.

| Seam | Interface (shape) | Serves |
|---|---|---|
| `PluginEntry` | `{ id: string; effect: (ctx) => Effect<void, never, R> }` or `{ id; setup }` (A002 §1) | all ported packages |
| `CommandPort` | register/list slash commands → `ctx.command` transform (A002 §2) | pi-specs, pi-profiles, pi-prompts, pi-reviews, pi-skills |
| `ToolPort` | register tool + before/after hooks → `ctx.tool` transform (A002 §2) | pi-prompts (`execute`), pi-reviews (`review_create`), pi-skills |
| `InteractionPort` (was `PiUi`/`InteractiveUi`) | `select`/`confirm`/`input`/`notify` → `ui.dialog.*` + `Toast`/`Attention` (A001; A004 §C) | pi-effect, pi-interactive, all interactive packages |
| `CustomViewPort` (was `CustomUi`/`FilterUi`) | `show(render: () => JSX.Element, onClose?)`, `set({size})` → `dialog.show` / `session.panel` (A002 §3; A004 §C/§E) | pi-interactive (filter-select, model-picker, menu, loading), pi-skills |
| `ModelPort` (was `AgentModelRuntime`) | resolve/select model, variants → `ctx.model`/`ctx.provider` + `ui.model.*` (A001 `agent-run.module.ts:33`; A002 §2; A004 §C) | pi-prompts, pi-profiles, pi-interactive (model-picker) |
| `SessionDispatchPort` (was `SessionPort`/`SessionFactory`/`SessionRunner`) | create/prompt (delivery `steer`)/interrupt/wait → `ctx.session.*`; continue/resume → the `subagent` tool with a child `sessionID`; message reads → `ctx.data.session.*` / `ctx.event.subscribe` / the client API. (`ctx.session.*` is the plugin `SessionDomain` `Pick` — it exposes **no** `resume`/`messages`/`list`; those are core `Session.Interface` only, so the missing plugin methods are a gap.) (A001 `session-runner.services.module.ts:41,71,75`; A003 §2/§6) | pi-reviews, pi-skills, pi-specs, workspace |
| `NotifyPort` | `notify_user`/`toast_user`/`update_status` (agent-invocable tools) → a montflow-registered tool (via `ctx.tool` transform / ToolPort) bridging to `Toast.show`/`Attention.notify`/`session.synthetic`; no first-class native tool (A003 §3) | pi-sessions (re-projected), workspace |
| `StoragePort` | get/set/remove/scan → `ctx.storage` (A002 §2 `storage.ts:1-9`) | packages with local state (pi-specs, pi-profiles) |
| `EventPort` | subscribe → `ctx.event.subscribe` typed stream (A002 §2; A003 §2) | lifecycle/stream consumers |
| `SkillPort` / `AgentPort` | skill/agent registry → `ctx.skill` `SkillEditor`, `ctx.agent` `AgentEditor` (A002 §2) | pi-skills; pi-profiles, pi-reviews |
| `DataPort` (workspace) | stores → `ctx.data` reactive state (A002 §3 `context.ts:63-140`) | workspace panels, pi-interactive |
| `GridPagePort` | grid + chrome → `ui.router` route page / `ui.slot` / `ui.panel.open` (A002 §3; A004 §B/§E) | workspace, pi-interactive |

### 4. Open risks

| Risk | Likelihood | Impact | Resolving phase |
|---|---|---|---|
| Portable transcripts (local-only SQLite vs local-only git-ignored `.jsonl`) — A003 Open Q1 | Medium | High | B003 |
| `effect` pin drift: montflow `4.0.3` vs host `4.0.0-rc.112`; `effect` is **not** in the runtime redirect map → dual instances (A005 §2; A002 §5b) | High | High | B006 |
| OpenTUI `0.5.11` below host peer floor `>=0.5.12` → markdown/scrollbox/textarea breakage (A004 §D, Open Q2; A005 §2) | High | Medium | B004 + B006 (spike) |
| Workspace decomposition unknown: one grid route page vs per-panel slots/panels — decides how much of `App` survives (A004 Open Q1) | Medium | High | B004 |
| v2.0.18 plugin API maturity: `PLAN.md` non-authoritative, experimental ws hooks, deferred decisions (A002 §6) | Medium | High | B002 |
| Plugin must not vendor/inline `@opencode/*` or `@opentui/*`/`solid-js` singletons (runtime redirection covers 6 specifiers only) (A005 §2) | Medium | High | B006 |
| `catalog` domain absent in v2.0.18; split into model+provider — installed v1.17.20 previews differ (A002 §2, §7) | Low | Medium | B001 + B002 |
| Distribution path: npm (Changesets `release.yml`) vs private Git-URL/local; all `pi-*` private (A005 §4) | Medium | Medium | B006 |
| `Host.load`/`runtime-import` native loading not cleanly interceptable by vitest → smoke-test home (A005 §3, Open Q) | Medium | Medium | B006 |
| `notify_user`/`toast_user`/`update_status` have no first-class native tool (A003 §4) | Low | Medium | B003 + B004 |
| `defineTool`/`tool()` helper absent in v2.0.18; stale `.opencode/tool/*.ts` examples (A002 §6, §7) | Low | Low | B002 |
| Stale `layout.json` uses panel id `"runs"` where `PANELS` has `sessions` (A004 Open Q4) | Certain | Low | execution (workspace port) |
| Session-scoped slots (`sidebar.*`) cannot host home chrome — must use `home.footer*` (A004 §E) | Low | Medium | B004 |
| `pi-workflows` vestigial peer; `pi-notifications` classification (A001 Open Qs) | Low | Low | B001 |

### 5. Candidate execution sequence (cheapest + most isolating first)

Phase B ratifies; each step is reversible at a named cut. Ordering principle per SPEC
§51: pure-Effect domain packages before session/TUI-dependent ones.

1. **Pure-Effect packages** — `pi-workflows` (drop vestigial peer), `pi-notifications`,
   and the `pi-specs`/`pi-profiles`/`pi-prompts`/`pi-reviews`/`pi-skills` **CLIs**
   (filesystem-only; zero `@earendil` runtime). Entrypoint/peer cleanup only.
2. **Adapter package** (successor to `pi-effect`) — implement `PluginEntry` +
   `InteractionPort` + `ModelPort` + `StoragePort`/`EventPort` with contract tests
   against `@opencode/plugin@2.0.18` types. Isolates OpenCode behind seams before any
   feature moves.
3. **Child-run extensions** — `pi-prompts`, `pi-profiles` (`ModelRuntime` →
   `ModelPort` + `subagent`).
4. **In-session dispatch extensions** — `pi-reviews`, `pi-skills`, `pi-specs`
   (`SessionRunner` → `SessionDispatchPort` + `subagent`).
5. **TUI/workspace** — `pi-interactive` widgets + workspace panels onto
   `CustomViewPort`/`GridPagePort`/`InteractionPort`; includes the OpenTUI `0.5.12`
   bump.
6. **Retire `pi-sessions`** — delete engine and ledger; re-point every consumer
   (A003 §6) to steps 3–5 seams.
7. **Verification + distribution** — pins/dedupe, loader smoke test, adapter contract
   tests, Changesets/Git-URL wiring (B006).

### 6. Reconciliation of A001–A005

- **(a) `cli.json`** — A002 §4 said none exists; A005 §1 said it does. **Resolved from
  actual files: A005 is correct.** `/home/daniel/.config/opencode/cli.json` exists
  (schema `https://opencode.ai/v2/cli.json`; fields `theme`, `diffs`, `session`,
  `animations`). It is the global v2 CLI/TUI config (`packages/cli/src/config/config.ts:31`,
  `schema.ts:4`); `tui.json` is the **v1 legacy** file migrated into `cli.json`
  (`packages/cli/src/config/migrate.ts:100-116`). A002's claim held only for the repo
  and pinned clone (neither ships one). Split stands: server plugins → `opencode.jsonc`
  `plugins`; CLI-only plugins → `cli.json` `plugins`.
- **(b) `catalog` vs model/provider** — A002 §2/§7: no `catalog` module in v2.0.18; it
  is split into the `model` and `provider` domains and appears only in `PLAN.md` and the
  installed v1.17.20 preview. **Resolved:** target v2.0.18 → montflow's catalogue
  concept maps to `ctx.model`/`ctx.provider`; `catalog` is not a target domain.
- **(c) `effect` pin semantics (`4.0.3` vs host `4.0.0-rc.112`)** — semver: stable
  `4.0.3` is newer than pre-release `4.0.0-rc.112`, but the host ships `rc.112` and
  `effect` is absent from the six-specifier redirect map (A005 §2). **Partially
  resolved:** the two are not interchangeable and plugin code resolves `effect` to its
  own copy, so dedupe is required; the strategy (align montflow to the host, or isolate)
  is unresolved (see Open Questions).
- **(d) OpenTUI `0.5.11`→`0.5.12` bump** — A004 §D and A005 §2 agree the host peer floor
  is `>=0.5.12` and the workspace pins `^0.5.11` (resolved `0.5.11`) → **violated**;
  bump required. Note SPEC §49 phrases this as a "`0.5`→`0.6` gap", but no `0.6`
  requirement is evidenced anywhere in A001–A005 — the evidenced gap is `0.5.11 → 0.5.12`.
- **(e) v1.17.20 preview vs target names** — A002 §5c/§7: installed
  `/home/daniel/.opencode` plugin is v1.17.20 with different entrypoints (`./v2/*`),
  `PluginContext`, and a `catalog` domain. **Resolved:** running host is v2.0.18
  (A005 §2), so v2.0.18 names (`./effect`, `.`, `./tui`, `Context`, model/provider)
  are authoritative; v1.17.20 is a stray preview, not the target.
- **(f) Package set** — A001 lists 10 `pi-*` packages; consistent across A003/A004/A005.

## Open Questions

Phase B must answer:
1. **Portable transcripts** — is cross-machine replay of the old
   `.agents/@montflow/sessions` file tree (git-ignored, local-only) a product
   requirement? Both the old store and OpenCode's SQLite are local-only; if yes,
   specify the export/projection step (A003 Q1). *(single candidate blocker)* — B003.
2. **Effect dedupe** — align montflow's `effect` to host `4.0.0-rc.112`, or isolate the
   plugin's copy? `effect` is outside the redirect map (A004 Q3, A005 Q). — B006.
3. **OpenTUI bump** — raise `@opentui/core|solid` to `>=0.5.12`, and is `solid-js
   1.9.12` (host catalog 1.9.15, peer `>=1.9.0`) acceptable? Needs a spike (A004 Q2,
   A005 Q). — B004 + B006.
4. **Workspace decomposition** — one grid route page vs per-panel `session.panel`/slot
   claims (A004 Q1). — B004.
5. **Authoring API** — Promise (`.`) vs Effect (`./effect`) for migrated plugins
   (A005 Q). — B001.
6. **Distribution** — npm-public (Changesets/`release.yml`) vs private Git-URL/local; and
   does any plugin need the optional `./rpc` export? (A005 Q). — B006.
7. **Notify/status semantics** — is `Toast`/`Attention`/`session.synthetic` sufficient,
   or is a native replacement tool needed? (A003 Q2). — B003.
8. **`session_verify` verdict** — does anything rely on the mechanical resumability
   check? (A003 Q3). — B003.
9. **Plugin-loader smoke test home** — `vitest`, `bun test`, or a dedicated task, given
   `Host.load`/`runtime-import` native loading (A005 Q). — B006.
10. **`cli.json` usage** — register TUI-only montflow plugins in `cli.json` vs
    `opencode.jsonc` (A005 §1). — B001 + B006.
11. **Classifications** — `pi-notifications` (drop vs Pi-Package boundary) and
    `pi-workflows` vestigial peer dep (A001 Qs). — B001.
12. **SPEC wording** — SPEC §49 says OpenTUI "`0.5`→`0.6`" but evidence shows
    `0.5.11`→`0.5.12`; confirm the intended target. — B004.

## Handoff

- Feeds A099 review-phase and all of Phase B (B001–B006).

## Deviations

- None.
