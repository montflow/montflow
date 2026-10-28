# Memory

## Context

Inventoried the OpenCode v2 plugin authoring/extensibility surface for task A002.
Source of truth is the pinned reference clone `.agents/references/opencode/` at tag
`v2.0.18` (`packages/plugin/src/**`, `packages/{core,cli,tui,schema}/src/**`,
`specs/v2/*.md`). The installed `@opencode-ai/plugin` v1.17.20 at
`/home/daniel/.opencode/node_modules/@opencode-ai/plugin` is used only as a
cross-check; it is an older, materially different preview of the v2 API (see
§5c) and every primary claim below cites the v2.0.18 clone.

## Progress

- 2026-10-13: complete

## Findings

### 1. Authoring contract and registration semantics

**Effect entrypoint** — `packages/plugin/src/effect/plugin.ts`
- `Plugin<R>` = `{ id: string; effect: (context) => Effect.Effect<void, never, R> }` (`plugin.ts:56-59`); `define<R>(plugin)` is identity (`plugin.ts:61-63`).
- `Context` (`plugin.ts:26-54`) carries `app`, `location` (`Location.Info`), `options`, and the domains: `agent, aisdk, command, event, integration, mcp, model, generate, permission, plugin, provider, reference, rpc, session, shell, skill, storage, tool, vcs, websearch, worktree`, plus inline `experimental.terminal.read` (`plugin.ts:34-36`, typed `Pick<ExperimentalApi["persistentPty"], "read">`) and inline `plugin: Pick<PluginApi, "list">` (`plugin.ts:42`). `generate` is inline `GenerateApi<unknown>` (`plugin.ts:40`) — there is **no** `effect/generate.ts` module.
- `App` = `{ name, version, channel }` (`packages/plugin/src/app.ts:1-5`); `PluginOptions = Readonly<Record<string, any>>` (`packages/plugin/src/options.ts:1`).

**Promise entrypoint** — `packages/plugin/src/promise/plugin.ts`
- `Plugin` = `{ id; setup: (context) => Promise<Cleanup|void>|Cleanup|void }` (`plugin.ts:56-61`); `define` identity (`plugin.ts:63-65`). Same `Context` shape as Effect (`plugin.ts:26-54`). Setup may return a sync/async cleanup awaited on unload (README `packages/plugin/src/README.md`, "Defining A Plugin").

**Registration primitives** — `packages/plugin/src/effect/registration.ts`
- `Registration { dispose: Effect.Effect<void> }` (`registration.ts:3-5`).
- `Hooks<Spec, Failures>` = `(name, callback => Effect<void, Failures[Name]>) => Effect<Registration, never, Scope.Scope>` (`registration.ts:12-17`).
- `ModelHooks` adds optional `{ providerID }` scoping for hooks whose input has a `model` field (`registration.ts:7-10, 19-25`).
- `Transform<Input>` = `(callback: (input) => void) => Effect<Registration, never, Scope.Scope>` (`registration.ts:27`).
- Promise mirrors: `Registration.dispose: () => Promise<void>`; `Hooks`/`ModelHooks`/`Transform` return `Promise<Registration>` (`packages/plugin/src/promise/registration.ts:1-21`); `DeepMutable` helper (`promise/types.ts:1-9`).

**`transform` vs `hook` vs `reload`** — `packages/plugin/src/effect/README.md`
- `transform` contributes to stateful domains; editor callbacks are **synchronous** (`README.md:33-48, 50-64`). Available transforms: agent, command, integration, mcp, model, provider, reference, skill, tool, vcs, websearch (`README.md:53-63`).
- `hook` intercepts live operations; hooks run **sequentially in registration order** and later hooks observe earlier mutations (`README.md:83-107`).
- `reload()` reruns every transform for one stateful domain (`README.md:128-163`); available reloads: agent, command, integration, mcp, model, provider, reference, skill, tool, vcs, websearch (`README.md:151-162`). Provider reload also invalidates the model result (`README.md:145-147`).

**Scope-owned disposal, ordering, boot batching** — `packages/plugin/src/effect/PLAN.md` (target design; `PLAN.md:5` states it is a plan, not current API docs)
- Every `transform()`/`hook()` call is an independent registration attached to the current `Scope.Scope`; closing the scope removes it; `dispose` removes early and is idempotent (`PLAN.md:93-109, 112-125, 142-150`).
- Order: plugin registration order, then transform registration order within the plugin (`PLAN.md:97`). Hooks run sequentially in plugin+registration order (`PLAN.md:145`).
- Registering/disposing a transform rebuilds its domain; during **bulk plugin boot**, automatic rebuilds are deferred and each affected domain rebuilds once after the batch (`PLAN.md:100-104, 280-295`). Rebuilds serialize and coalesce; a rebuild snapshots its registration list at start (`PLAN.md:104-108`).
- Runtime hooks are **not** replayed during rebuilds (`PLAN.md:149`).
- Same-ID replacement retains order position; old plugin disabled before replacement setup (`PLAN.md:278`).

**Runtime enforcement** — `packages/core/src/plugin.ts`
- `Service` activates plugins under `State.batch`, keeps a prefix of unchanged slots, closes removed scopes, restores a prior healthy activation if replacement setup fails, and disables a plugin after a transform failure (`plugin.ts:89-180, 182-236`). `Plugin.load` runs `plugin.effect({ ...host, storage: PluginHost.storage(kv, plugin.id) })` (`plugin.ts:64-75`). `activate` rejects duplicate IDs (`plugin.ts:94-98`). `slotInfo.features.server = true` plus `slot.plugin.features` (`plugin.ts:285-293`).

### 2. Server domain + operation + hook inventory

Effect modules all live under `packages/plugin/src/effect/` unless noted. "Op API" = the Effect client interface (`@opencode/client/effect/api`) the domain extends. Concrete method names come from the Promise adapter's endpoint map (`promise/adapter.ts:224-239` endpoint groups; `adapter.ts:291-599` method wiring).

| Domain | Module | Server operations exposed | transform | reload | hook names |
|---|---|---|---|---|---|
| agent | `agent.ts:1-17` | `AgentApi` (`get`, `list`) | `AgentEditor` (list/get/default/update/remove) | yes | — |
| tool | `tool.ts:1-60` | `transform`, `list` | `ToolEditor` (list/get/namespace/add/update/remove) | yes | `execute.before`, `execute.after` (`tool.ts:20-52`) |
| command | `command.ts:1-27` | `CommandApi` (`list`) | `CommandEditor.add` | yes | — |
| skill | `skill.ts:1-17` | `SkillApi` (`list`) | `SkillEditor` (list/get/add/update/remove) | yes | — |
| session | `session.ts:1-170` | `SessionApi` pick: create/get/switchAgent/switchModel/prompt/generate/command/synthetic/interrupt/update/move/wait/context (`session.ts:153-169`) | — | — | `prompt`, `context`, `compaction`, `generate`, `title`, `model.request`, `http.request`, `http.response`, `experimental.ws.handshake`, `experimental.ws.send`, `experimental.ws.receive`, `retry` (`session.ts:138-151`) |
| model | `model.ts:1-28` | `ModelApi` | `ModelEditor` (list/get/update/remove/default/provider) | yes | — |
| provider | `provider.ts:1-33` | `ProviderApi` | `ProviderEditor` (list/get/add/update/remove/models) | yes | — |
| mcp | `mcp.ts:1-17` | `McpApi` (`list`) | `MCPEditor` (list/get/set/update/remove) | yes | — |
| integration/credential | `integration.ts:1-96` | `IntegrationApi` minus `wellknown` | `IntegrationEditor` + `method`; `connection.active/resolve` (`integration.ts:89-95`) | yes | — |
| permission | `permission.ts:1-24` | `PermissionApi` pick: list/get/reply | — | — | `evaluate` (`permission.ts:18-20`) |
| shell | `shell.ts:1-17` | — | — | — | `create.before` (`shell.ts:11-13`) |
| event | `event.ts:1-3` | `EventApi` (`subscribe`) | — | — | — (typed `Stream` per discriminant; PLAN.md:184-211) |
| storage | `storage.ts:1-9` | get/set/remove/scan (own interface) | — | — | — |
| rpc | `rpc.ts:1-29` | `RpcApi` + `register(definition, handlers)` (`rpc.ts:24-28`) | — | — | — |
| generate | inline `plugin.ts:40` (`GenerateApi`); method `text` (adapter.ts:339-341) | — | — | — | — |
| reference | `reference.ts:1-16` | `ReferenceApi` | `ReferenceEditor` (add/remove/list/get) | yes | — |
| vcs | `vcs.ts:1-47` | `VcsApi` (`get`, `base`, `branch.list`, `status`, `diff`) | `VcsEditor` (add/default) | yes | — |
| websearch | `websearch.ts:1-23` | `WebSearchApi` (`providers`, `query`) | `WebSearchEditor` (add/default) | yes | — |
| worktree | `worktree.ts:1-21` | `WorktreeApi` (`list`, `create`, `remove`, `refresh`) | `WorktreeEditor.add` | yes | — |
| aisdk | `aisdk.ts:1-22` | — | — | — | `sdk`, `language` (`aisdk.ts:5-18`) |
| plugin | inline `plugin.ts:42` (`PluginApi` `list`) | list | — | — | — |
| experimental.terminal | inline `plugin.ts:34-36` | `persistentPty.read` | — | — | — |
| catalog | **no module** | replaced by model+provider domains; only referenced in `PLAN.md:57,77` (planning) and present in installed v1.17.20 preview | — | — | — |

- Plan-level `rebuild` vocabulary (`PLAN.md:52-58, 60-70`) is realized in v2.0.18 as the per-domain `reload()` method (not `rebuild()`).
- Promise parity: same domain set under `packages/plugin/src/promise/` (e.g. `tool.ts`, `session.ts`, `agent.ts`), with async executors and `ToolContext.progress: Promise` (`promise/tool.ts:11-24`). The adapter maps the whole Promise surface onto the Effect host (`promise/adapter.ts:216-607`).

### 3. TUI plugin surfaces

Authoring contract — `packages/plugin/src/tui/plugin.ts:7-14`: `Definition { id; setup(context) => Promise<Cleanup|void>|Cleanup|void }`, `define`. `Context` is `packages/plugin/src/tui/context.ts:516-532`: `options, location, app, renderer (CliRenderer), client (OpenCodeClient), data, attention, theme, themeMode, markdown, keymap, storage, ui`. `PluginContextProvider`/`usePlugin` from `packages/plugin/src/tui/solid.ts:4-19`. `@opencode/plugin/tui` re-exports both (`tui/index.ts:1-2`).

- **Slots** — `SlotMap` (`context.ts:191-202`): `app`, `home.footer`, `home.footer.status`, `prompt.footer`, `prompt.footer.status`, `prompt.footer.file`, `session.composer.top`, `session.panel`, `sidebar.content`, `sidebar.footer`. `SlotClaim` placement keys `prepend|append|before|after|replace`, mutually exclusive, last-enabled wins, ancestor replacement beats descendant (`context.ts:205-262`); `ui.slot(claim)` claims and returns a disposer (`context.ts:512-513`). Host resolver: `packages/tui/src/plugin/structure.ts` + `render.tsx` (`<Slot>`), error-isolated per claim (`render.tsx:19-38`).
- **`session.panel`** — `PanelInput` (`context.ts:167-178`); `ui.panel.open(name, {presentation})` / `close()` / `current()` (`context.ts:473-480`). Host: `packages/tui/src/component/panel-host.tsx`.
- **Routes/pages** — `Route` = home | session | plugin (`context.ts:142-150`), `Destination` (`context.ts:152`), `Page { name, render({data}) }` (`context.ts:154-157`); `ui.router.register/navigate/current` (`context.ts:468-472`).
- **Dialogs** — `Dialog` (`context.ts:371-382`): `show(render: () => JSX.Element, onClose?)`, `set(options)`, `clear()`, `alert`, `confirm`, `prompt`, `select<Value>({title, placeholder?, options, current?})`. `DialogSize = medium|large|xlarge` (`context.ts:327`). Options carry `title/description/footer/category/disabled` (`context.ts:355-369`). **Search** is host-side inside the select dialog (fuzzy filter over title/category/searchText), not a separate plugin flag — `packages/tui/src/ui/dialog-select.tsx:185-198`; host wiring in `packages/tui/src/plugin/api.tsx:359`.
- **Toasts** — `Toast.show({title?, message, variant?: info|success|warning|error, duration?, sessionID?})` (`context.ts:269-282`).
- **Attention** — `Attention.notify({title?, message, notification?, sound?})` returns `{ok, notification, sound, skipped?}`; `AttentionWhen = always|focused|blurred`; sound names `default|question|permission|error|done|subagent_done` (`context.ts:284-325`).
- **Keymap (palette/slash/binds)** — `Keymap.layer/dispatch/shortcuts/commands/pending/active/mode` (`context.ts:440-460`). `KeymapCommand` supports `id`, `bind`, `palette: true`, `slash { name, aliases?, arguments? }`, `suggested`, `group`, `enabled`, `run(input?, event?)` (`context.ts:384-410`). `KeymapLayer { mode?, enabled?, target?, priority?, commands?, bindings? }` (`context.ts:412-425`).
- **Tabs** — `ui.tabs` (`context.ts:481-501`): `enabled/list/open/focus/move/close`.
- **Model** — `ui.model.current()` and `ui.model.variant.list()/set()` (`context.ts:502-511`).
- **Storage** — `Storage.store(key, {initial})` durable, live-synced, returns `[Store, mutate]`; `Storage.memory(key, {initial})` ephemeral, survives hot reload (`context.ts:31-53`).
- **Markdown renderers** — `markdown.registerCodeBlockRenderer(language, render)` (`context.ts:526-528`); host merge is last-wins/shallow-equal (`packages/tui/src/plugin/markdown.ts:1-20`).
- **Data/reactive state** — `Data.on/listen/session{list,get,root,family,cost,status,pending,message,permission,form}/project{...,permission}/shell/location{...,vcs,agent,command,integration,mcp,model,provider,reference,skill}` (`context.ts:63-140`).
- **Host impl** — `packages/tui/src/plugin/context.tsx`, `api.tsx`, `discovery.ts`, `watch.ts`, `builtins.ts` (builtins: home/prompt/sidebar/system feature plugins + Merman + Latex, `builtins.ts:1-31`). `packages/session-ui/src` holds message/markdown/timeline components consumed by the TUI (e.g. `src/context/markdown.tsx`, `src/components/markdown.tsx`); it has no separate plugin registration surface.

### 4. Loader/config model

- **Auto-discovery dirs** — `PluginSourceDirectory.names = ["plugin", "plugins"]` (`packages/core/src/plugin/source-directory.ts:7`); `discover` admits `.ts`/`.js` files, directories, and symlinks (`source-directory.ts:9-33`). Config-root scanning: `ConfigPluginSource.scan` (`packages/core/src/config/plugin/source.ts:122-189`); plugin-source watch filter uses those dir names (`source.ts:191-197`). TUI discovers only the `plugins` subdirectory (`packages/tui/src/plugin/discovery.ts:8-22`).
- **`opencode.jsonc` `plugins`** — schema `ConfigPlugin.Plugin = string | { package, options? }` (`packages/schema/src/config/plugin.ts`), array `Plugins`; wired at `packages/schema/src/config.ts:99-101`. A leading `-` means remove: `"−target"` (`source.ts:113-119`); explicit config is applied last so it can remove auto-discovered packages (`source.ts:158-159`).
- **`cli.json`** — no `cli.json` exists in the clone or `.opencode/`; CLI configuration is the global/`opencode.jsonc` path resolved by `resolveConfigPath(global.config)` and written by `plugin add` (`packages/cli/src/commands/handlers/plugin/add.ts`, `writePluginConfig`). Treat "cli.json" as absent. TUI config is `tui.json` (`.opencode/tui.json`), schema `packages/tui/src/config/index.tsx:66-...`, with its own `plugins` array of `string | {package, options}` (`index.tsx:47-55`) used as ordered enablement directives (`context.tsx:320-330`).
- **Package entrypoints** — `Host.resolve` resolves `server` (via `["server", ""]`), `tui` (`["tui"]`), `rpc` (`["rpc"]`) from a directory's `package.json` `exports`/`main` or conventional files, without executing plugin code (`packages/plugin/src/host.ts:11-44`; behavior pinned by `packages/plugin/test/host.test.ts:29-156`). `Host.load` uses `@opencode/util/runtime-import` (`host.ts:46-48`).
- **Module shape** — a plugin module's `default` must be `{ id, effect }` (Effect) or `{ id, setup }` (Promise); decoded by `PluginModule.Module` and a Promise `setup` is wrapped with `PluginPromise.fromPromise` (`packages/core/src/plugin/module.ts:60-73, 107-116`). Resolved features mark tui/rpc availability (`module.ts:117-130`).
- **Git-vs-npm resolution** — `module.ts:85-105`: an absolute target is loaded locally via `createPluginSources` (with fs watching); a non-absolute target goes through `Npm.Service` (`npm.add` to install, or `npm.resolve` when `install:false`). `plugin add` requires `Npm.isInstallablePackage` — "npm registry package or Git package specifier" (`packages/cli/src/commands/handlers/plugin/add.ts:14-16`) — then installs and writes the spec to config; it routes a server entrypoint to global config and a tui-only entrypoint to location config (`add.ts:17-40`, `configurationTarget`).
- **Local source loading** — `createPluginSources` fingerprints the dependency graph (Bun-transpiler scan / Node `registerHooks`) and `Host.load`s the entrypoint, caching failed attempts (`packages/plugin/src/source.ts:8-59`, `source.bun.ts:11-69`, `source.node.ts:10-51`). TUI watches sources via `packages/tui/src/plugin/watch.ts` and reconciles generations (`packages/tui/src/plugin/context.tsx:255-374`).
- **Package exports** (`@opencode/plugin`) — `.` → `src/promise/index.ts`, `./effect` → `src/effect/index.ts`, `./host`, `./tui`, `./*` → `src/*.ts` (`packages/plugin/package.json:12-18`); the `#plugin-source` import condition picks the bun/node loader (`package.json:19-25`). Existing plugin packages use `.` and `./tui` entrypoints; `./rpc` is resolved by `Host.resolve`/rpc.ts.

### 5. Runtime/version facts

**(a) Pins** — `packages/plugin/package.json`:
- dependencies: `@ai-sdk/provider@3.0.8`, `"effect": "catalog:"`, `"zod": "catalog:"`, workspace `@opencode/{ai,client,protocol,schema,util}` (`package.json:29-39`).
- peerDependencies (all **optional**): `@opencode/theme` (workspace), `@opentui/core >=0.5.12`, `@opentui/solid >=0.5.12`, `solid-js >=1.9.0` (`package.json:40-45`, meta `package.json:46-...`).
- devDependencies: `@opentui/core`/`@opentui/solid`/`solid-js` via `catalog:` (`package.json`).
- Root catalog (`package.json:44-...`): `effect 4.0.0-rc.112` (`:82`), `@opentui/core|keymap|solid 0.5.12` (`:55-57`), `solid-js 1.9.15` (`:110`), `zod 4.1.8` (`:97`). Root `overrides` force `effect`, `@opentui/*`, `solid-js` to `catalog:` (`package.json:156-167`), and `solid-js@1.9.15` is patched (`:174`).

**(b) `effect` redirection to the host copy** — third-party plugin imports are redirected to the running host's in-process SDK rather than a private install:
- The Node CLI bundle prelude registers a module resolver/loader mapping `@opencode/plugin`, `@opencode/plugin/promise/plugin`, `@opencode/plugin/promise/tool`, `@opencode/plugin/effect`, `@opencode/plugin/effect/plugin`, `@opencode/plugin/effect/tool` to virtual modules backed by `globalThis[Symbol.for("opencode.plugin.v2.promise" | "opencode.plugin.v2.effect")]` (`packages/cli/vite.node.config.ts:124-166`).
- The globals are populated at host startup by `packages/cli/src/node/plugin-runtime.effect.ts:15-28` and `plugin-runtime.promise.ts:14-26` (re-exporting the host's `@opencode/plugin/effect` / `@opencode/plugin` values). This is how a plugin's `effect`/domain imports share the host copy.

**(c) Installed v1.17.20 cross-check (older preview, materially different)** —
- Entrypoint names differ: v1.17.20 exports `./v2/effect`, `./v2/promise`, `./tui`, `./tool` (`/home/daniel/.opencode/node_modules/@opencode-ai/plugin/package.json`), whereas v2.0.18 uses `./effect`, `.` (promise), `./tui`, `./host` (`packages/plugin/package.json:12-18`).
- v1.17.20 `dist/v2/effect/index.d.ts` exports `define` + `PluginContext` with a **narrow** domain set `agent, aisdk, catalog, command, integration, plugin, reference, skill`, and hooks shaped as `Hooks<{ transform: Draft }>` (transform-as-hook, no separate runtime `hook`/`reload`). It ships `catalog`, `context`, `filesystem`, `location`, `npm`, `path` modules under `dist/v2/effect/` that **do not exist** in v2.0.18.
- v1.17.20 pins `effect 4.0.0-beta.83`, peer `@opentui/* >=0.4.3` and `@opentui/keymap`; v2.0.18 pins `effect 4.0.0-rc.112`, `@opentui/* 0.5.12` (no `@opentui/keymap` peer).
- v1.17.20 top-level `.` is the legacy Promise `Plugin = (input, options) => Promise<Hooks>` type (huge `Hooks` with `event`, `config`, `tool`, `auth`, `provider`, `chat.*`, `permission.ask`, `tool.execute.*`, `experimental.*`), and its `./tui` exports a deprecated legacy TUI API (`TuiCommand` marked `@deprecated ... Remove in v2`). Treat all of this as **v1 legacy**, not the target.

### 6. Maturity signals / unstable surface

- `packages/plugin/src/effect/PLAN.md:5` — "implementation plan, not documentation for the current API."
- Deferred decisions (`PLAN.md:507-515`): Promise API shape; typed error model; transform timeouts; cross-domain atomic rebuilds; automatic dependency tracking; whole-Location generation reload; exact editors and runtime hooks not required by current plugins. Promise API and the domain set have since landed, but the plan itself is explicitly non-authoritative.
- Experimental hooks: session WebSocket hooks `experimental.ws.handshake/send/receive`, each documented "Experimental" (`session.ts:89-125, 147-149`); `ctx.experimental.terminal.read` (`plugin.ts:34-36`).
- Historical/decision docs: `specs/v2/catalog-config-plugin-lifecycle.md:3` is a "Historical decision record" using obsolete names; `specs/v2/README.md:20-38` marks only **Session** and **Tools** as current contracts, Event stream and Provider policy as accepted decision records, and catalog/config/plugin lifecycle as historical context.
- v1.17.20's `./tui` marks `TuiCommand` deprecated and its top-level `Hooks` is v1 legacy → the installed package is not a reliable v2 reference.
- Gap: `.opencode/tool/github-triage.ts:2` and `.opencode/tool/github-pr-search.ts:2` import `{ tool } from "@opencode/plugin"`, but v2.0.18 exports no `tool` helper (only the promise `Plugin` namespace + schemas, `packages/plugin/src/promise/index.ts:1-20`); these examples are v1-era/stale.

### 7. Gap findings (domains/modules with no matching module in v2.0.18)

- **`catalog`** — no `packages/plugin/src/effect/catalog.ts`; the catalog concept was split into the `model` and `provider` domains. `catalog` appears only in `PLAN.md` planning text and in the installed v1.17.20 preview.
- **`path`, `npm`, `filesystem`, `location`, `context`** — present in installed v1.17.20 `dist/v2/effect/` but **absent** from v2.0.18 `packages/plugin/src/effect/` (verified by file check).
- **`generate`** — no `effect/generate.ts` module; exposed inline as `ctx.generate` / `GenerateApi` (`plugin.ts:40`).
- **`location`, `context`, `app`, `options`, `plugin`, `experimental`** are inline fields on `plugin.ts` `Context`, not standalone domain modules.
- **TUI:** no plugin-package module for `session-ui` registration; `packages/session-ui/src` is a component library consumed by the TUI, not a plugin surface.

## Open Questions

- Whether the migration should target the v1.17.20 preview API names (`./v2/effect`, `PluginContext`, `catalog` domain) or the v2.0.18 shipped names (`./effect`, `Context`, model/provider domains) — the running host is v2.0.18, so v2.0.18 names are authoritative; confirm with A006.
- Whether any `cli.json` config file is supported elsewhere (none found in the clone or `.opencode/`); the task named it but no artifact exists.
- Whether `.opencode/tool/*.ts` (`tool()` import) is intentionally retained as a legacy-compat path in v2.0.18 or is stale — no `tool` export exists in v2.0.18 `@opencode/plugin`.
- Exact semantics of `generate` domain hooks (none declared in v2.0.18; `ctx.generate` is a plain `GenerateApi`).

## Handoff

- Feeds A004 (workspace/TUI), A005 (packaging), A006 synthesize-migration-contract.

## Deviations

- None.
