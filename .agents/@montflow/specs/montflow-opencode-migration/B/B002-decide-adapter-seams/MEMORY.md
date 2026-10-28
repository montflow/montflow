# Memory

## Context

Decides the adapter seams (ports) that isolate OpenCode v2 so montflow domain code
stays host-agnostic and testable without a running server. Primary input is A006 §3
(the required seam list) and §4/§6; grounded in the pinned reference clone
`.agents/references/opencode/` at `v2.0.18` (`packages/plugin/src/**`,
`packages/tui/src/plugin/**`) and montflow's existing seams (`packages/pi-effect`,
`packages/pi-sessions`, `packages/pi-interactive`, `apps/workspace`). Locked inputs:
Effect authoring via `@opencode/plugin/effect`; private Git-URL/local distribution;
TUI plugin + server plugin; OpenTUI `>=0.5.12`; transcripts local-only; `pi-sessions`
deleted. This task DECIDES; it does not implement.

Two structural facts drive every decision below:

1. **The server entry is Effect; the TUI entry is Promise.** `Plugin<R> = { id; effect:
   (context) => Effect.Effect<void, never, R> }` (`packages/plugin/src/effect/plugin.ts:56-59`),
   but the TUI authoring contract is `Definition = { id; setup: (context) => Cleanup |
   void | Promise<Cleanup|void> }` (`packages/plugin/src/tui/plugin.ts:7-14`). "Effect
   authoring" therefore binds the **server** entry; the TUI entry is host-mandated
   `setup` and wraps an Effect runtime internally.
2. **`effect` core is not reachable through the redirect map.** The runtime redirects
   exactly six specifiers — `@opencode/plugin`, `@opencode/plugin/promise/plugin`,
   `@opencode/plugin/promise/tool`, `@opencode/plugin/effect`, `@opencode/plugin/effect/plugin`,
   `@opencode/plugin/effect/tool` (`packages/cli/vite.node.config.ts:160-167`) — and
   `@opencode/plugin/effect` re-exports `Plugin` + schemas only, **not** `effect`
   (`packages/plugin/src/effect/index.ts:1-19`). A plugin must therefore supply its own
   `Effect` combinators to build the root program the host runtime runs. This is the
   crux of the injection decision (§Effect injection).

## Progress

- 2026-10-13: complete

## Findings

### 1. Port inventory

Layout decision (mechanism now; B001 owns the final package name): the ports live in
the re-layered adapter package, the successor to `packages/pi-effect` (A006 §5 step 2).
Folder-per-port mirrors the repo convention (`modules/<group>/<name>/<name>.module.ts`
+ `index.ts`, e.g. `packages/pi-effect/src/modules/agent-run/`). The adapter package
exposes a library barrel (`.`) and a TUI seam module (`./tui`); it declares no plugin
entry (B001 §2/§8.11). Target root in the table: `packages/pi-effect/src/modules/ports/`.

| Seam | Interface (shape) | OpenCode impl | Target file | Serves |
|---|---|---|---|---|
| `PluginEntry` | `Plugin<R>` + `makePorts(ctx)` factory | `Plugin.define` re-export; port factory over the host `Context` | `ports/plugin-entry/plugin-entry.module.ts` | all ported packages |
| `CommandPort` | `register(def)`, `list()` | `ctx.command.transform` → `CommandEditor.add`; `ctx.command.list` | `ports/command/command.module.ts` | pi-specs, pi-profiles, pi-prompts, pi-reviews, pi-skills |
| `ToolPort` | `add/update/remove`, `onBefore`, `onAfter`, `list()` | `ctx.tool.transform` → `ToolEditor`; `ctx.tool.hook("execute.before"/"execute.after")` | `ports/tool/tool.module.ts` | pi-prompts, pi-reviews (`review_create`), pi-skills, NotifyPort |
| `InteractionPort` | `select/confirm/prompt/alert`, `notify`, `attention` | TUI `ctx.ui.dialog.*`, `ctx.ui.toast.show`, `ctx.attention.notify` | `ports/interaction/interaction.module.ts` | pi-effect, pi-interactive, workspace, all interactive packages |
| `CustomViewPort` | `show<A>(render, onClose?)`, `set(opts)`, `clear()`, `panel.*` | TUI `ctx.ui.dialog.show/set/clear`, `ctx.ui.panel.open/close/current` | `ports/custom-view/custom-view.module.ts` | pi-interactive (filter-select, model-picker, menu, loading), pi-skills |
| `ModelPort` | `list`, `get`, `default`, `current`, `variants`, `setVariant`, `resolve` | server `ctx.model`/`ctx.provider`; TUI `ctx.ui.model.*`, `ctx.data.location.model` | `ports/model/model.module.ts` | pi-prompts, pi-profiles, pi-interactive (model-picker) |
| `SessionDispatchPort` | `create`, `prompt`, `interrupt`, `wait`, `synthetic`, `messages`, `list`, `resume` | server `ctx.session` Pick; reads via `ctx.data.session.*`/`ctx.event.subscribe`; `resume` → `subagent` child `sessionID` | `ports/session-dispatch/session-dispatch.module.ts` | pi-reviews, pi-skills, pi-specs, workspace |
| `NotifyPort` | `notify`, `toast`, `status`, `registerTools()` | ToolPort-registered tools (`notify_user`/`toast_user`/`update_status`) bridging `Toast`/`Attention`/`session.synthetic` | `ports/notify/notify.module.ts` | workspace; the retired `pi-sessions` notify capability, re-exposed (A006 §2 item 2) |
| `StoragePort` | `get<A>(key, schema)`, `set`, `remove`, `scan(prefix?)` | `ctx.storage.get/set/remove/scan` | `ports/storage/storage.module.ts` | pi-specs, pi-profiles local state |
| `EventPort` | `subscribe<T>(type): Stream<…>`, `onAny(handler)` | server `ctx.event.subscribe`; TUI `ctx.data.on/listen` | `ports/event/event.module.ts` | lifecycle/stream consumers |
| `SkillPort` | `list`, `get`, `add`, `remove` | `ctx.skill.transform` → `SkillEditor`; `ctx.skill.list`; TUI `ctx.data.location.skill` | `ports/skill/skill.module.ts` | pi-skills |
| `AgentPort` (conditional) | `list`, `get`, `setDefault` | `ctx.agent.transform` → `AgentEditor`; TUI `ctx.data.location.agent` | `ports/agent/agent.module.ts` | pi-profiles — **only if profiles map to `ctx.agent`** (see Open Questions) |
| `DataPort` | `session.{list,get,status,message.list}`, `location.{vcs,model,provider,skill,agent}`, `on` | TUI `ctx.data` slice (`context.ts:63-140`) | `ports/data/data.module.ts` | workspace panels, pi-interactive |
| `GridPagePort` | `registerPage(page)`, `navigate(dest)`, `slot(claim)`, `keymapLayer(layer)` | TUI `ctx.ui.router.register/navigate`, `ctx.ui.slot`, `ctx.ui.keymap.layer` (`context.ts:418,468-513`) | `ports/grid-page/grid-page.module.ts` | workspace, pi-interactive |

Barrel `packages/pi-effect/src/modules/ports/index.ts`; injector
`packages/pi-effect/src/modules/ports/ports.module.ts` exporting
`makePorts(ctx: PluginContext | TuiContext): Ports`. Library barrel
`packages/pi-effect/src/index.ts`; TUI seam module `packages/pi-effect/src/tui.tsx`.

### 2. Exact interface signatures (Effect-typed)

All `Effect`/`Stream`/`Scope` names come from `effect`; `JSX` from `@opentui/solid`.
Schema types are **`import type`-only** (nothing host-side is bundled): `Model`,
`Provider`, `Skill`, `Agent`, `Command` are re-exported by `@opencode/plugin/effect`
(`packages/plugin/src/effect/index.ts:4-19`); `Session`, `Tool`, `SessionInbox`, and
`PromptInput` are **not** re-exported there and come from
`@opencode/schema/{session,tool,session-inbox,prompt-input}` (wildcard `./*`,
`@opencode/schema/package.json:18-21`).

```ts
// ports/plugin-entry
import type { Plugin } from "@opencode/plugin/effect"            // the Plugin namespace
import type { Context as TuiContext } from "@opencode/plugin/tui/context"
export type PluginContext = Plugin.Context                       // @opencode/plugin/effect
export interface Ports { readonly command: CommandPort; readonly tool: ToolPort; /* … */ }
export const makePorts: (ctx: PluginContext | TuiContext) => Ports
export type MontflowPlugin<R = Scope.Scope> = Plugin.Plugin<R>   // re-exported identity
export const entry: <R = Scope.Scope>(id: string,
  program: (ports: Ports) => Effect.Effect<void, never, R>) => Plugin.Plugin<R>

// ports/command
export interface CommandPort {
  readonly register: (def: {
    readonly name: string
    readonly description?: string
    readonly execute: (input: CommandInvocation) => Effect.Effect<void, unknown>
  }) => Effect.Effect<void>
  readonly list: () => Effect.Effect<readonly Command.Info[]>          // ctx.command.list
}
// CommandInvocation mirrors effect/command.ts:8-12
// { sessionID: Session.ID; prompt: PromptInput.Prompt; delivery: SessionInbox.Delivery }

// ports/tool
export interface ToolPort {
  readonly add: <I extends Tool.ValueSchema<any>, O extends Tool.ValueSchema<any> | undefined>(
    tool: Tool.Info<I, O>) => Effect.Effect<void>
  readonly update: (id: string, update: (tool: Types.Mutable<Tool.Info>) => void) => Effect.Effect<void>
  readonly remove: (id: string) => Effect.Effect<void>
  readonly list: () => Effect.Effect<readonly (Tool.Info & { readonly id: string })[]>
  readonly onBefore: (cb: (input: ToolHooks["execute.before"]) => Effect.Effect<void, Tool.Error>) => Effect.Effect<Registration>
  readonly onAfter:  (cb: (input: ToolHooks["execute.after"]) => Effect.Effect<void>) => Effect.Effect<Registration>
}

// ports/interaction (TUI-only)
export interface InteractionPort {
  readonly select: <V>(options: DialogSelectOptions<V>) => Effect.Effect<V | undefined>
  readonly confirm: (options: DialogConfirmOptions) => Effect.Effect<boolean | undefined>
  readonly prompt: (options: DialogPromptOptions) => Effect.Effect<string | undefined>
  readonly alert: (options: DialogAlertOptions) => Effect.Effect<void>
  readonly notify: (options: ToastOptions) => Effect.Effect<void>
  readonly attention: (options: AttentionNotifyOptions) => Effect.Effect<AttentionNotifyResult>
}

// ports/custom-view (TUI-only)
export interface CustomViewPort {
  readonly show: <A>(render: (resolve: (value: A | undefined) => void) => JSX.Element,
    onClose?: () => void) => Effect.Effect<A | undefined>
  readonly set: (options: DialogOptions) => Effect.Effect<void>
  readonly clear: () => Effect.Effect<void>
  readonly panel: {
    readonly open: (name: string, options?: { readonly presentation?: PanelPresentation }) => Effect.Effect<boolean>
    readonly close: () => Effect.Effect<void>
    readonly current: () => Effect.Effect<{ readonly name: string; readonly sessionID: string } | undefined>
  }
}

// ports/model
export interface ModelPort {
  readonly list: (providerID?: string) => Effect.Effect<readonly ModelOption[]>  // ModelOption = { label; providerID; modelID; current }
  readonly get: (providerID: string, modelID: string) => Effect.Effect<Model.Info | undefined>
  readonly default: () => Effect.Effect<{ providerID: string; modelID: string } | undefined>
  readonly current: () => Effect.Effect<{ providerID: string; modelID: string; variant?: string } | undefined>
  readonly variants: () => Effect.Effect<readonly string[]>
  readonly setVariant: (variant: string | undefined) => Effect.Effect<boolean>
  readonly resolve: (label: string) => Effect.Effect<Model.Ref, ModelResolveError>  // "provider/model-id" → Ref
}

// ports/session-dispatch
export interface SessionDispatchPort {
  readonly create: (input: { parentID?: Session.ID; agent?: Agent.ID; model?: Model.Ref }) => Effect.Effect<Session.ID>
  readonly prompt: (sessionID: Session.ID, prompt: PromptInput.Prompt,
    delivery?: SessionInbox.Delivery) => Effect.Effect<void>          // steer = delivery: "steer"
  readonly interrupt: (sessionID: Session.ID) => Effect.Effect<void>
  readonly wait: (sessionID: Session.ID) => Effect.Effect<void>
  readonly synthetic: (sessionID: Session.ID, part: SystemPart) => Effect.Effect<void>
  readonly messages: (sessionID: Session.ID) => Effect.Effect<readonly AgentMessageStruct[]>  // ctx.data.session.message.list / client
  readonly list: () => Effect.Effect<readonly SessionSummary[]>                                  // ctx.data.session.list
  readonly resume: (sessionID: Session.ID, prompt?: PromptInput.Prompt) => Effect.Effect<void>  // GAP: see §4
}

// ports/notify
export interface NotifyPort {
  readonly notify: (input: { readonly title?: string; readonly body: string }) => Effect.Effect<void>
  readonly toast: (input: { readonly message: string; readonly variant?: "info" | "success" | "warning" | "error" }) => Effect.Effect<void>
  readonly status: (input: { readonly message: string }) => Effect.Effect<void>
  readonly registerTools: () => Effect.Effect<void>   // notify_user/toast_user/update_status via ToolPort
}

// ports/storage
export interface StoragePort {
  readonly get: <A>(key: string, schema: Schema.Schema<A>) => Effect.Effect<A | undefined>
  readonly set: <A>(key: string, value: A) => Effect.Effect<void>
  readonly remove: (key: string) => Effect.Effect<void>
  readonly scan: (options?: StorageScanOptions) => Effect.Effect<StorageScanResult>
}

// ports/event
export interface EventPort {
  readonly subscribe: <T extends OpenCodeEvent["type"]>(type: T) =>
    Stream.Stream<Extract<OpenCodeEvent, { readonly type: T }>>     // server ctx.event.subscribe
  readonly onAny: (handler: (event: OpenCodeEvent) => void) => Effect.Effect<() => void>  // TUI ctx.data.listen
}

// ports/skill
export interface SkillPort {
  readonly list: () => Effect.Effect<readonly Skill.Info[]>
  readonly get: (id: string) => Effect.Effect<Skill.Info | undefined>
  readonly add: (skill: Skill.Info) => Effect.Effect<void>
  readonly remove: (id: string) => Effect.Effect<void>
}

// ports/agent  (conditional)
export interface AgentPort {
  readonly list: () => Effect.Effect<readonly Agent.Info[]>
  readonly get: (id: string) => Effect.Effect<Agent.Info | undefined>
  readonly setDefault: (id: string | undefined) => Effect.Effect<void>
}

// ports/grid-page (TUI-only)
export interface GridPagePort {
  readonly registerPage: (page: Page) => Effect.Effect<() => void>
  readonly navigate: (destination: Destination) => Effect.Effect<void>
  readonly slot: (claim: SlotClaim) => Effect.Effect<() => void>
  readonly keymapLayer: (layer: KeymapLayer) => Effect.Effect<() => void>
}
```

`DataPort` mirrors the consumed `ctx.data` slice verbatim (`tui/context.ts:63-140`);
its methods return plain values (client-local reactive state), not Effects, so it is a
**reactive read facade**, not an Effect service.

### 3. Effect injection (the `effect`-redirection decision)

**Decision: single physical `effect` instance — pin-aligned, not injected through a Tag.**

- The OpenCode Effect domain client is **not** dependency-injected. It arrives as the
  plain `context` argument to `plugin.effect(context)` / `setup(context)`. `makePorts(ctx)`
  closes over the domains it needs (e.g. `ctx.command`, `ctx.session`, `ctx.ui`). No
  montflow-defined `Context.Tag`/`Layer` ever appears in the returned program's `R`.
- The returned program's `R` is **exactly `Scope.Scope`** (the host-injected scope). The
  port layer is closed: every internal montflow `Context.Service` is provided inside
  montflow's own runtime, so the host runtime is never asked to satisfy a foreign Tag.
  This removes the Tag-identity half of the dual-instance risk.
- The version-drift half is removed by **aligning montflow's `effect` to the host's exact
  version `4.0.0-rc.112`** (host catalog, clone root `package.json:82`; montflow currently
  `overrides.effect: "4.0.3"`, `package.json:12-14`). `@opencode/plugin/effect` is
  redirected to the host copy, but `@opencode/plugin/effect` does **not** re-export
  `effect` (`effect/index.ts:1-19`), so the plugin has no host accessor for `Effect.gen`
  etc.; it must build the root program from its own copy. A byte-identical copy is the
  only way to guarantee the host runtime can execute that program. Isolation of the entry
  Effect is therefore **not** a viable alternative — the entry Effect necessarily crosses.
- Scope of alignment: the whole workspace (or at minimum the adapter package + every
  caller that builds the entry program) must resolve one `effect`. Aligning only the
  adapter re-creates the drift between the adapter and montflow domain code. Full-workspace
  alignment is the recommended path; enforcement/drift-check is B006.

Enforcement (B006 owns the **full** pin set — §8 — and C001 lands it before any loader
cut, B005): root `overrides.effect`, every package's `effect` peer/dep, **and**
`@effect/vitest` + `@effect/platform-node` pinned to the aligned line `4.0.0-rc.112`; a
resolved-version drift check; and a rule that no montflow `Context.Tag` is named in
`Plugin<R>`'s `R` (type-level assertion in the contract tests).

### 4. `SessionDispatchPort` gap (recorded honestly)

The plugin `SessionDomain` is `Pick<SessionApi, "create" | "get" | "switchAgent" |
"switchModel" | "prompt" | "generate" | "command" | "synthetic" | "interrupt" | "update" |
"move" | "wait" | "context">` (`packages/plugin/src/effect/session.ts:153-169`). It exposes
**no `resume`, `messages`, or `list`** — those are core `Session.Interface` only
(`.agents/references/opencode/packages/core/src/session.ts:122`; A003 §2/§6). Mapping:

- create/prompt/interrupt/wait/synthetic → `ctx.session.*` (present).
- `resume` → the native `subagent` tool spawning a child `sessionID` (A003 §6). There is
  no plugin method to resume an arbitrary prior session; a "resume" is a **new child
  session** with the continuation prompt.
- `messages`/`list` → `ctx.data.session.message.list` / `ctx.data.session.list` (TUI)
  and `ctx.event.subscribe` for live deltas; the client API is the fallback. `ctx.session.*`
  cannot answer these.
- Because `ctx.data.*` / `ctx.event.*` are **TUI-plugin** surfaces and `ctx.session.*` is a
  **server-plugin** surface, `SessionDispatchPort` has a real server/client split: the
  server port dispatches; the TUI port both dispatches (via the client) and observes. The
  adapter exposes the union and each entrypoint supplies the half it can (server:
  create/prompt/interrupt/wait/synthetic via `ctx.session.*`; TUI: create/prompt/interrupt
  via `ctx.client.session.*` **and** messages/list/resume-observe via
  `ctx.data.*`/`ctx.event.subscribe`). This split is a design consequence, not a defect,
  and B003 owns the exact resume/transcript semantics.

### 5. Testing without a running OpenCode server

- **Type contract against `@opencode/plugin@2.0.18`.** Add `@opencode/plugin@2.0.18` as a
  normal dependency (types only; never inlined — A005 §2) and assert mapping with
  `Vitest.expectTypeOf` + `@effect/vitest` under `vitest --typecheck`
  (`packages/format/src/structs/color/tests/make.test.ts:8` precedent). Assertions:
  `Ports` satisfies the consumed domain shapes; `MontflowPlugin<R>` matches
  `Plugin<R>`; `R` contains only `Scope.Scope`.
- **In-memory fakes, not the server.** Each port adapter is a function of a domain slice we
  can fake. Build a hand-written fake `PluginContext`/`TuiContext` with only consumed
  domains: `command.transform` captures `CommandEditor.add` inputs and returns
  `Effect.succeed({ dispose: Effect.void })`; `tool` captures `ToolEditor` and hooks;
  `session` records calls; `storage` is a `Map`; `event.subscribe` is `Stream.fromIterable`;
  `ui.dialog.select/confirm/prompt` return scripted answers; `ui.toast.show` /
  `ctx.attention.notify` record calls. No host, no network.
- **Behavioral contract tests**: register a command → assert the captured `add` definition;
  invoke `NotifyPort.notify` → assert `Toast.show`/`Attention.notify`/ToolPort registration;
  `ModelPort.resolve("provider/model")` → assert `Model.Ref`; `EffectPort` → fold a
  `Stream`. Run under `it.effect` (`@effect/vitest`).
- **Loader smoke test** — `Host.resolve({ directory })` is pure fs and never executes
  plugin code (`packages/plugin/src/host.ts:17-44`; `packages/plugin/test/host.test.ts:29-156`),
  so it can assert a **plugin package's** server (`./server`) / TUI (`./tui`) entrypoints
  resolve and the default export is `{ id, effect }` / `{ id, setup }`. The subject must be
  a package with real `./server`+`./tui` entries — the pilot `@montflow/specs` in C001
  (B005 §2) — **not** the adapter: `@montflow/opencode` is a library-only package with no
  `./server` (B001 §2), so `Host.resolve` would map its server entry to the `.` barrel,
  whose default is not `{ id, effect }` (B006 §2 marks it n/a). `Host.load` uses native
  loading; home is B006 (bun test vs dedicated script).
- **Not headlessly testable**: live Solid slot/route/dialog rendering, host transform/hook
  registration against live registries, storage durability, the actual Node import map
  (A005 §3). Covered by the smoke test + manual TUI runs.

### 6. Deliberate non-abstractions

- **Unconsumed domains are not wrapped**: `permission`, `mcp`, `integration`/`credential`,
  `reference`, `vcs`, `websearch`, `worktree`, `rpc`, `shell`, `aisdk`, `generate`,
  `experimental`, `plugin.list`, `app`, `options`, `location`. Pass-through or unused;
  no port (avoids speculative indirection).
- **No generic tool/command framework**: `ToolPort`/`CommandPort` expose only what
  montflow actually registers (`notify_user`, `toast_user`, `update_status`,
  `review_create`, skill/profile dispatch). No `ToolBuilder`, no registry mirror.
- **No `EffectPort` / DI container**: ports are plain interfaces closed over the host
  `Context`; `effect` is not abstracted (see §3).
- **No separate `ClientPort`**: the TUI half of `SessionDispatchPort` is the only client
  surface the workspace uses, wrapping `ctx.client.session.*`; other client/read surfaces
  go through `DataPort`/`StoragePort` (§1/§4). No raw `ctx.client`/`ctx.ui` access escapes
  the adapter.
- **No transcript/store port**: transcripts are local-only and OpenCode owns the store;
  `SessionDispatchPort` reads via `ctx.data`/client and there is no montflow engine
  (pi-sessions deleted).
- **No port for the `mf-*` CLIs**: they are filesystem-only and already host-agnostic
  (A001 §"`mf-*` CLI inventory"); they stay as-is.
- **`EventPort` is a thin consumed-event slice**, not a full typed event mirror.
- **`AgentPort` is conditional** — built only if pi-profiles maps profiles onto `ctx.agent`;
  otherwise it is not created. **`DataPort` is a reactive facade**, not an Effect service.
- **No layout port** for arbitrary layout JSON; `GridPagePort` covers only the route/slot
  claims the workspace uses.

### 7. Notable adaptation deltas

- Pi `ctx.ui.custom<T>(render)` resolved a Promise of the pick; OpenCode
  `dialog.show(render, onClose?)` is void + callback (`tui/context.ts:372-382`).
  `CustomViewPort.show` therefore threads a `resolve` callback through `render` and
  resolves a `Deferred` on `onClose` — the pi-interactive widgets
  (`filter-select`, `model-picker`, `menu`, `loading`) must be rewritten around a Solid
  component + callback, not a Promise-returning render.
- `ModelPort` replaces both `AgentModelRuntime` (`agent-run.module.ts:33`) and
  `resolveCliModel` (`agent-run.module.ts:108`) with `ctx.model`/`ctx.provider` +
  `ui.model.*`.
- `NotifyPort` spans the server/client boundary: tools are registered server-side via
  `ToolPort`; `Toast`/`Attention` are TUI-only (`tui/context.ts:280-325`). Delivery from
  a server tool back to the TUI needs a bridge (event or `session.synthetic` + TUI
  observation) — see Open Questions.
- `InteractionPort`/`CustomViewPort`/`DataPort`/`GridPagePort` are **TUI-plugin** ports;
  `CommandPort`/`ToolPort`/`SessionDispatchPort`/`NotifyPort.*Tools` are **server-plugin**;
  `ModelPort`/`StoragePort`/`EventPort`/`SkillPort`/`AgentPort` exist on both (model/skill/
  agent are server domains; `ui.model.*`/`data.location.*` are the TUI read side).

## Open Questions

1. Final adapter package name/layout (re-layer `pi-effect` in place vs rename) — B001.
2. Workspace-wide `effect` pin alignment to `4.0.0-rc.112` (downgrade from stable `4.0.3`)
   vs isolate — mechanism decided here (single instance, §3); the bump and drift guard — B006.
3. Does pi-profiles map profiles onto `ctx.agent` (activate `AgentPort`) or stay
   filesystem-only (drop the port)? — B001/A006.
4. NotifyPort cross-boundary delivery mechanism (server tool → TUI toast): event bridge vs
   `session.synthetic` + TUI observation — B003/B004.
5. Exact `resume`/transcript semantics for `SessionDispatchPort` (subagent child
   `sessionID`; read via `ctx.data`/client) — B003.
6. Confirm the TUI entry's Promise `setup` (host-mandated) is acceptable under the
   "Effect authoring" lock, with the Effect runtime wrapped inside — B001/B005.

## Handoff

- Feeds B005 (migration sequence: adapter package is step 2) and B006 (verification +
  distribution: `effect` pin/dedupe, adapter contract tests, loader smoke test).
- Also informs B003 (session dispatch gap) and B004 (TUI/workspace ports).

## Deviations

- None.
