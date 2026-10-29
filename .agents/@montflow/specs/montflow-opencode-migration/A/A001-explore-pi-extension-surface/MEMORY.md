# Memory

## Context

Inventory of the Pi surface each `packages/pi-*` package consumes, and the seams that
already abstract Pi away. Evidence base: every `packages/pi-*/package.json`, every
`@earendil-works/*` import (via `rg -n "@earendil-works" packages/pi-*`), the
`pi-effect`/`agent-run` modules, the `pi-sessions` `session-runner` services, the
`pi-interactive` ports, and every extension/CLI entrypoint. Every claim below cites a file
path and symbol. All 10 packages are `private: true`.

## Progress

- 2026-10-13: complete

## Findings

### Per-package inventory

`exports` for every package is `"./package.json"` plus `".": "./src/index.ts"`; the two
extra rows add `"./extension": "./src/extension.ts"`. All packages `private: true`.

| Package | `pi` field | `bin` | extra `exports` | `@earendil` in `src/` | `@earendil` dep kind |
|---|---|---|---|---|---|
| pi-workflows | none | none | none | none | peer `pi-coding-agent` (unused) |
| pi-effect | none | none | none | type `ExtensionAPI`/`ExtensionCommandContext`/`ExtensionContext`; type `ModelRuntime`; dynamic `import()` | peer `pi-coding-agent` |
| pi-interactive | none | none | none | `DynamicBorder`, `ExtensionUIContext` (`pi-coding-agent`); `Container`,`Input`,`Key`,`SelectList`,`Text`,`matchesKey`,`Loader`,`Box`,`Spacer`,`Component` (`pi-tui`) | dep `pi-tui`; peer `pi-coding-agent` |
| pi-notifications | `extensions: ["./src/extension.ts"]` | none | none | type `ExtensionAPI` only (no-op stub) | peer `pi-coding-agent` |
| pi-profiles | `extensions: ["./src/extension.ts"]` | `mf-profiles` | none | type `ExtensionAPI`, type `ExtensionUIContext`, dynamic `ModelRuntime` | peer `pi-coding-agent` |
| pi-prompts | `extensions: ["./src/extension.ts"]` | `mf-prompts` | none | type `ExtensionAPI`, dynamic `ModelRuntime` | peer `pi-coding-agent` |
| pi-reviews | `extensions: ["./src/extension.ts"]` | `mf-reviews` | none | type `ExtensionAPI` | peer `pi-coding-agent`, peer `typebox` |
| pi-sessions | `extensions: ["./src/extension.ts"]` | `mf-sessions` | `"./extension"` | type `ExtensionAPI`; type `Message` (`pi-ai`); type `AgentSessionEvent`,`CreateAgentSessionOptions`; dynamic `import()` | peer `pi-ai`, peer `pi-coding-agent`, peer `typebox` |
| pi-skills | `extensions: ["./src/extension.ts"]` | `mf-skills` | none | type `ExtensionAPI`; `DynamicBorder` (`pi-coding-agent`); `Container`,`Input`,`Key`,`SelectList`,`Text`,`matchesKey` (`pi-tui`) | peer `pi-coding-agent`, peer `pi-tui` |
| pi-specs | `extensions: ["./src/extension.ts"]` | `mf-specs` | `"./extension"` | type `ExtensionAPI`, type `ExtensionCommandContext` only | peer `pi-coding-agent` |

Notes:
- Only `pi-sessions` and `pi-specs` add a `"./extension"` export.
- `pi-effect` declares no `dependencies`; `pi-interactive` also depends on
  `@montflow/format`; the `bin`-packages depend on `@effect/platform-node`.

### Pi-primitive → concern classification

| Concern | Pi primitive | Local seam / where used |
|---|---|---|
| Extension entry | `ExtensionAPI`, `ExtensionCommandContext` | every `src/extension.ts`; wrapper types in `pi-effect.module.ts` |
| Command registration | `api.registerCommand` | `pi-effect.module.ts:114` `registerCommand`, `:137` `registerCommandEffect`; direct use in `pi-specs/src/extension.ts:55`, `pi-sessions/src/extension.ts:189`, `pi-skills/src/apps/interactive/interactive.apps.module.ts:1483`, `pi-profiles/src/apps/interactive/interactive.apps.module.ts:1536` |
| Tool registration | `api.registerTool` | `pi-sessions/src/extension.ts:197,244,254,264,281,294,304,317`; `pi-prompts/src/extension.ts:257,279`; `pi-reviews/src/extension.ts:34` |
| Tool definition | `defineTool` | `pi-sessions/src/services/session-runner/pi-session.services.module.ts:74,90,103,119` (tools `ask_user`,`notify_user`,`toast_user`,`update_status`) |
| Lifecycle event | `pi.on('session_shutdown', …)` | `pi-sessions/src/extension.ts:187`; `pi-skills/src/extension.ts:182` (no other events used) |
| Messaging | `api.sendUserMessage` | `pi-effect.module.ts:63` `sendUserMessage` |
| User interaction | `ctx.ui.select/confirm/input/notify` | `pi-effect.module.ts:22,34,44,54`; `pi-interactive/src/modules/dialogs/dialogs.module.ts:11` (`InteractiveUi`); wired through interactive app modules |
| User interaction (custom TUI) | `ctx.ui.custom`, `ExtensionUIContext['custom']` | `pi-interactive` widgets: `filter-select.widgets.module.ts:83`, `menu.widgets.module.ts:49`, `model-picker.widgets.module.ts:96`, `loading.widgets.module.ts:63,103`; `pi-skills/src/extension.ts:103` |
| Model resolution | `ModelRuntime.create` | `pi-effect/src/modules/agent-run/agent-run.module.ts:33` (`AgentModelRuntime`), imported at `pi-prompts/src/extension.ts:94`, `pi-profiles/src/extension.ts:257`; `pi-sessions/.../pi-session.services.module.ts:188` |
| Model resolution | `resolveCliModel` | `agent-run.module.ts:108`; `pi-session.services.module.ts:206` |
| Model catalogue (not a Pi call) | `ModelSource`/`ModelCatalog`/`ModelRef` | `pi-interactive/src/modules/model-options/model-options.module.ts:11,17,22` (structurally typed from `ctx`) |
| Session execution | `createAgentSession` | `agent-run.module.ts:124`; `pi-session.services.module.ts:227` |
| Session execution | `SessionManager.inMemory` / `.open` / `appendMessage` | `agent-run.module.ts:126`; `pi-session.services.module.ts:194,195,201` |
| Session execution | session `prompt/steer/followUp/abort/dispose/subscribe`, `messages` | wrapped by `SessionPort` (`session-runner.services.module.ts:41`) via `toPort` (`pi-session.services.module.ts:152`) |
| Session events | `AgentSessionEvent`, `Message` (`pi-ai`) | normalized by `sessionEventOf` (`pi-session.services.module.ts:37`) into `PiSessionEvent` (`session-runner.services.module.ts:14`) |
| Rendering | `pi-tui` components `DynamicBorder`,`Container`,`Input`,`Key`,`SelectList`,`Text`,`Spacer`,`Box`,`Loader`,`Component`,`matchesKey` | `pi-interactive/src/widgets/*`; `pi-skills/src/extension.ts:4-5` |

### Adapter-seam inventory (interface/service + defining file)

| Seam | Kind | Defining file |
|---|---|---|
| `PiUi` | type (`Pick<ExtensionContext['ui'],'select'\|'confirm'\|'input'\|'notify'>`) | `pi-effect/src/modules/pi-effect/pi-effect.module.ts:13` |
| `notify`,`confirm`,`select`,`input`,`sendUserMessage`,`runAndNotify` | Effects over `PiUi`/`ExtensionAPI` | `pi-effect.module.ts:22,34,44,54,63,77` |
| `registerCommand`,`registerCommandEffect`,`CommandFailureSeverity` | command-registration seam | `pi-effect.module.ts:114,137,90` |
| `AgentModelRuntime` | `Context.Service<…, ModelRuntime>` | `pi-effect/src/modules/agent-run/agent-run.module.ts:33` |
| `runAgent` | `Effect` (dynamic-imports Pi, resolves model, `createAgentSession` + in-memory `SessionManager`) | `agent-run.module.ts:94` |
| `AgentRunRequest`,`AgentRunError`,`AgentContentBlock`,`AgentMessageStruct`,`buildPrompt`,`finalText` | types/pure helpers | `agent-run.module.ts:8,24,38,44,55,68` |
| `SessionPort` | interface (prompt/steer/followUp/abort/messages/subscribe/dispose) | `pi-sessions/src/services/session-runner/session-runner.services.module.ts:41` |
| `SessionFactory` / `SessionFactoryImpl` | `Context.Service` + interface | `session-runner.services.module.ts:75` / `:71` |
| `SessionRequest`,`SessionUi`,`PiSessionEvent` | types | `session-runner.services.module.ts:52,33,14` |
| `WorkspaceBridge` / `NoopWorkspaceBridge` | `Context.Service` (toast/notify) | `session-runner.services.module.ts:88,92` |
| `SessionRunner` / `SessionRunnerImpl` | `Context.Service` (session lifecycle) | `session-runner.services.module.ts:152,124` |
| `createPort`,`PiSessionFactory`,`interactionTools`,`sessionEventOf`,`toPort`,`withInteractionTools` | real Pi implementation of the seams | `pi-sessions/src/services/session-runner/pi-session.services.module.ts:183,244,69,37,152,145` |
| `SessionRunnerHost` / `createSessionRunnerHost` / `setActiveSessionRunnerHost` / `activeSessionRunnerHost` | shared in-session dispatch host | `pi-sessions/src/apps/runtime/runtime.apps.module.ts:84,98,129,138` |
| `InteractiveUi`,`FilterUi`,`ModelPickerFn`,`LoadingFn`,`MenuFn`,`CustomUi`,`SearchSelect`,`ModelOption`,`ModelSource`,`ModelCatalog`,`ModelRef` | injected interaction ports | `pi-interactive/src/modules/dialogs/dialogs.module.ts:11,21,36,43,53,26`; `pi-interactive/src/widgets/filter-select/filter-select.widgets.module.ts:12,17`; `pi-interactive/src/modules/model-options/model-options.module.ts:11,17,22` |
| `filterSelectDialog`/`searchSelectFor`,`modelPickerDialog`,`Loading.run`,`Menu.menuDialog` | TUI widget implementations of the ports | `pi-interactive/src/widgets/{filter-select,model-picker,loading,menu}/*.module.ts` |
| `SurfaceContext`,`PiSessionsExtensionOptions` | `pi-sessions` extension injection seam | `pi-sessions/src/extension.ts:28,36` |
| `SkillSessionPorts` / `makeSkillSessionPorts` | `pi-skills` dispatch ports over `SessionRunner` | `pi-skills/src/apps/sessions/sessions.apps.module.ts:107,143` |

### Package classification

| Class | Packages | Rationale |
|---|---|---|
| Pure-Effect, no Pi runtime import | `pi-workflows`, `pi-specs`, `pi-notifications` | `pi-workflows` has no `@earendil` import and no extension; `pi-specs` and `pi-notifications` import only `ExtensionAPI`/`ExtensionCommandContext` as **types** (no runtime) |
| Seam/library, no `bin` | `pi-effect`, `pi-interactive` | wrap Pi (command/ui/agent-run; TUI widgets) behind Effect; `pi-effect` dynamically imports Pi only inside `runAgent` |
| CLI + thin slash command (filesystem-only) | `pi-specs` | single `registerCommand` (`pi-specs/src/extension.ts:55`); CLI has zero `@earendil` imports |
| CLI + slash + agentic child runs (`ModelRuntime`) | `pi-profiles`, `pi-prompts` | `AgentModelRuntime` layers at `pi-profiles/src/extension.ts:254` and `pi-prompts/src/extension.ts:91`, both calling `AgentRun.runAgent` |
| CLI + slash + in-session dispatch (`SessionRunner`) | `pi-reviews`, `pi-skills` | dispatch via `Runtime.activeSessionRunnerHost()` (`pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts:102`) and `makeSkillSessionPorts` (`pi-skills/src/apps/sessions/sessions.apps.module.ts:143`) |
| Session-loop-owning | `pi-sessions` | registers commands + 8 agent tools + `on('session_shutdown')`, and owns `SessionRunner` with `SessionFactory`→`PiSessionFactory` (`pi-sessions/src/extension.ts`) |

### `mf-*` CLI inventory (binary → package → entry → subcommands → touches Pi?)

Entry is always `src/apps/cli/main.ts`; subcommands read from the root command tree.

| Binary | Package | Root command file | Subcommands | Touches Pi at runtime? |
|---|---|---|---|---|
| `mf-specs` | pi-specs | `packages/pi-specs/src/apps/cli/cli.apps.module.ts:925` `rootCommand` | `check, status, state, next, list, create, doctor` | **No** — `main.ts` imports only `NodeServices` + `rootCommand`; `rg "@earendil" packages/pi-specs/src/apps/cli` → none |
| `mf-sessions` | pi-sessions | `packages/pi-sessions/src/apps/cli/cli.apps.module.ts:26` `runCli` → `commands.apps.module.ts:342` `execute` | `doctor, list, status, verify, start, resume, interrupt, steer, answer` | **Yes, lazily** — `main.ts:4` builds `sessionRunnerLayer` → `PiSessionFactory` (`runtime.apps.module.ts:69`), which `import('@earendil-works/pi-coding-agent')` only on `start`/`resume` (`pi-session.services.module.ts:235`) |
| `mf-profiles` | pi-profiles | `packages/pi-profiles/src/apps/cli/binary.apps.module.ts:189` `rootCommand` | `list, show, verify, create, modify, delete` | **No** — `rg "@earendil" packages/pi-profiles/src/apps/cli` → none (`create`/`modify` are file-backed) |
| `mf-prompts` | pi-prompts | `packages/pi-prompts/src/apps/cli/binary.apps.module.ts:301` `rootCommand` | `doctor, list, inspect, execute, show, verify, render, create, modify, delete` | **No** — `execute` validates/renders only, by design (`binary.apps.module.ts:199-203`) |
| `mf-reviews` | pi-reviews | `packages/pi-reviews/src/apps/cli/binary.apps.module.ts:172` `rootCommand` | `doctor, list, show, verify, create, new, resume` | **No** — the Pi-hitting dispatch is the `review_create` extension tool (`pi-reviews/src/extension.ts:34`), not the binary |
| `mf-skills` | pi-skills | `packages/pi-skills/src/apps/cli/binary.apps.module.ts:213` `rootCommand` | `doctor, list, show, verify, create, modify, delete` | **No** — Pi-hitting dispatch is in the extension (`pi-skills/src/apps/sessions/sessions.apps.module.ts`) |

## Open Questions

- `pi-notifications` ships a `pi.extensions` entry but a no-op stub and is otherwise pure-Effect; confirm whether it should be classified with `pi-workflows`/`pi-specs` or flagged as a Pi-Package boundary in A006. (Parked; no `ask_user`.)
- `pi-workflows` declares a peer `@earendil-works/pi-coding-agent` but imports it nowhere in `src/`; confirm the peer dep is vestigial before dropping it in migration.

## Handoff

- Feeds A006 synthesize-migration-contract (and A004/A005 indirectly).

## Deviations

- None.
