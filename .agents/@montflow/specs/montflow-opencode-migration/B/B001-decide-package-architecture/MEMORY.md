# Memory

## Context

Ratifies the target package/plugin architecture for the Pi → OpenCode v2 migration:
which `pi-*` packages become server plugins, TUI plugins, shared libraries, or retained
CLIs; the plugin entrypoint/export contract; package naming; where the shared Effect
domain code lives relative to the OpenCode adapter; and the workspace's fate. Every
decision rests on the A001–A006 evidence and the actual manifests. Source of truth for
host shapes: `@opencode/plugin@2.0.18` / the pinned clone
`.agents/references/opencode/` (`packages/plugin/package.json`, `src/host.ts`).
Locked inputs (not revisited): Effect authoring (`@opencode/plugin/effect`), private
Git-URL/local distribution, workspace → TUI+server plugin, OpenTUI `>=0.5.12`,
local-only transcripts, `pi-sessions` deleted.

## Progress

- 2026-10-13: complete

## Findings

### 1. Package fate table

Legend: **port** = keep package, re-layer onto OpenCode; **merge** = dissolve into
another package; **delete** = remove; **library** = pure host-agnostic package with no
plugin entry; **new** = package created by the migration.

| Package (current) | Fate | Target name | Entrypoints | Retained CLI | Evidence / rationale |
|---|---|---|---|---|---|
| `@montflow/pi-workflows` | library (port) | `@montflow/workflows` | `.` | — | Pure Effect, no `@earendil` runtime import (`packages/pi-workflows/src/**`; only `src/extension.ts` absent — package has no `pi` field). A006 §1 "adopt (drop peer dep)". |
| `@montflow/pi-effect` | merge | → `@montflow/opencode` (new) + `@montflow/core` | adapter `.`, `./tui` | — | A006 §1 `pi-effect` → adapter. Pi seams (`PiUi`, `registerCommand`, `AgentModelRuntime`, `runAgent`) are the adapter's `InteractionPort`/`CommandPort`/`ModelPort`/`SessionDispatchPort` (A006 §3); host-free bits move to `core`. |
| `@montflow/pi-interactive` | merge | → `@montflow/opencode` (`./tui`) | (part of adapter) | — | A006 §1 "re-layer → `ctx.ui.dialog`/slots/panels". Widgets map to host dialogs (`dialog.select` has host-side search), so the widget bodies are deleted and only the TUI seam helpers remain (A004 §C). |
| `@montflow/pi-notifications` | delete | — | — | — | No-op stub, type-only Pi import (`packages/pi-notifications/src/extension.ts:1`, `void pi; return Promise.resolve()`); subsumed by `Toast.show`/`Attention.notify` (A006 §1; A002 §3). Confirmed against src. |
| `@montflow/pi-profiles` | port | `@montflow/profiles` | `.`, `./server`, `./tui` | `mf-profiles` | CLI filesystem-only (A001 CLI inventory); extension = child runs (`AgentModelRuntime`) → `ModelPort` + `subagent`. |
| `@montflow/pi-prompts` | port | `@montflow/prompts` | `.`, `./server`, `./tui` | `mf-prompts` | CLI filesystem-only; extension child runs → `ModelPort` + `subagent`; `execute` tool → `ToolPort` (A006 §3). |
| `@montflow/pi-reviews` | port | `@montflow/reviews` | `.`, `./server`, `./tui` | `mf-reviews` | CLI filesystem-only; in-session dispatch (`Runtime.activeSessionRunnerHost`, `review-dispatch.apps.module.ts:102`) → `SessionDispatchPort` + `subagent` (A003 §6). |
| `@montflow/pi-skills` | port | `@montflow/skills` | `.`, `./server`, `./tui` | `mf-skills` | CLI filesystem-only; dispatch (`makeSkillSessionPorts`) → `SessionDispatchPort` + `subagent` (A003 §6). |
| `@montflow/pi-specs` | port | `@montflow/specs` | `.`, `./server`, `./tui` | `mf-specs` | Single slash command (`src/extension.ts:55`, type-only Pi) → server command + TUI notify; CLI filesystem-only. |
| `@montflow/pi-sessions` | delete | — | — | — | A003 retire verdict; A006 §1/§2. Nothing takes the slot (see §6). |
| `@montflow/workspace` (`apps/workspace`) | port | `@montflow/workspace` (keep) | `.`, `./server`, `./tui` | — | Locked: becomes TUI+server plugin. A004 §B/§E: grid = route page; sessions/detail = native; retire standalone renderer. |
| `@montflow/core`, `@montflow/format`, `@montflow/stlx`, `@montflow/linting` | keep | unchanged | unchanged | — | Existing pure/shared packages; unrelated to the migration. |
| **`@montflow/opencode`** | **new** | `@montflow/opencode` | `.`, `./tui` | — | The OpenCode adapter (successor to `pi-effect`+`pi-interactive`); sole importer of `@opencode/plugin`. A006 §3 seam table. |

Net: **10 `pi-*` packages → 5 concern plugins (server+TUI, CLIs retained) + 1 pure
library + 1 adapter; 2 deleted.** Every concern package is one package with a library
face, a server-plugin face, a TUI-plugin face, and its `mf-*` binary.

### 2. Target architecture (layers + dependency rule)

Four layers, dependency direction downward only:

1. **Pure domain** — `@montflow/core`, `@montflow/format`, `@montflow/workflows`, and the
   `src/modules/**` / `src/services/**` of each concern package. Import only `effect` +
   each other. **Never** import `@opencode/*`.
2. **Adapter** — `@montflow/opencode` (new). Implements every A006 §3 seam
   (`PluginEntry`, `CommandPort`, `ToolPort`, `InteractionPort`, `CustomViewPort`,
   `ModelPort`, `SessionDispatchPort`, `NotifyPort`, `StoragePort`, `EventPort`,
   `SkillPort`/`AgentPort`, `DataPort`, `GridPagePort`) against `@opencode/plugin/effect`
   and `@opencode/plugin/tui`, and re-exports the narrowed `PluginContext` / `define`.
   It is the **only** package that imports `@opencode/plugin` (plus `./tui` peers
   `@opentui/*`, `solid-js`). It is a **plain library**, not a plugin (it registers
   nothing on its own). Because it has no server/TUI plugin entry, it is **not** the
   loader-smoke subject: that targets a real plugin package with `./server`+`./tui`
   entries (B002 §5; B005 §2 names `@montflow/specs`).
3. **Concern plugins** — the five ported packages. Their `./server` and `./tui` entries
   import the adapter, not the host API directly, honoring A006 §3 ("montflow code
   depends on the seam, never the host API directly").
4. **Workspace plugin** — `@montflow/workspace`; depends on the adapter + the concern
   libraries; owns the route page/grid and slot/panel claims. Both its `./server` and
   `./tui` entries reach the host **only through adapter ports** — dispatch via
   `SessionDispatchPort`, chrome/slots/routes via `GridPagePort`, dialogs/notify via
   `InteractionPort`/`CustomViewPort`, reads via `DataPort`/`StoragePort` — and never
   `@opencode/*`, `ctx.client`, or `ctx.ui` directly (B002 §1/§4; B004 §1).

Rationale: this isolates the entire OpenCode surface behind one package, so a host API
bump touches only the adapter, and it matches montflow's "everything is a module/group"
structure and SPEC §52's pure-before-session/TUI ordering. A single implementation of
each seam also satisfies A005 §2's "must not vendor/inline `@opencode/plugin`": the
adapter imports the six redirected specifiers by name, keeping them external.

### 3. Plugin entrypoint / export contract

Decision — every plugin package (`specs`, `profiles`, `prompts`, `reviews`, `skills`,
`workspace`) exposes, in `package.json` `exports` (`packages/pi-specs/package.json:25-29`
today has only `.`/`./extension`):

- `"."` → the **domain library barrel** (`src/index.ts`, unchanged semantics).
- `"./server"` → the **server plugin** module; `default` = `{ id, effect }`, Effect
  authoring via the adapter (locked). Resolved by `Host.resolve`'s `entry(["server",""])`
  (`.agents/references/opencode/packages/plugin/src/host.ts:17-44`).
- `"./tui"` → the **TUI plugin** module (`Definition` via `@opencode/plugin/tui`), only
  where a TUI surface exists (all five concern packages have slash/dialog flows;
  `workspace` has the route/grid).
- `"./package.json"`.
- `"bin"` → the retained `mf-<concern>` CLI (filesystem-only; A001 CLI inventory).

Deliberate choices:
- **`.` stays the library barrel; the plugin entry is `./server`.** `Host.resolve` tries
  `server` before `""`, so `./server` is first-class (`host.ts:43`). This preserves the
  existing rich barrels and the workspace's library imports, and lets the host treat the
  plugin half as an additive subpath. The docs' `exports { "." }` idiom puts the plugin
  at `.`; rejected here because these packages are libraries-first (see §8).
- **No `"./rpc"`** on any package. `Host.resolve` supports `rpc` (`host.ts:43`) but
  montflow has no cross-process RPC need; the notify/status tool (§6) is a normal server
  tool, not RPC. Rejecting avoids a dead surface (answers A006 Open Q6's `./rpc` half).
- **A package with both `./server` and `./tui` is registered once** (see §7); the host
  loads both entrypoints from the same package.

### 4. Shared Effect domain code location

- **Concern-specific pure modules stay in their concern package** (`src/modules/**`,
  `src/services/**`), exactly as `packages/pi-specs/src/modules/**` does today. They
  remain the source the retained CLI and the workspace consume (via the `.` barrel).
- **Cross-cutting pure primitives live in `@montflow/core` / `@montflow/format`**
  (existing). Host-free modules extracted from `pi-effect` (e.g. `changes`) and any
  host-free `pi-interactive` helpers are promoted here rather than into the adapter.
- **The adapter contains only host-facing code.** It is a sibling package to the pure
  domain packages, sitting between them and `@opencode/plugin`.
- **Invariant (enforceable by lint/import boundary):** `@opencode/*` may be imported only
  by `@montflow/opencode` (and by concern tests as a devDependency). Pure modules and
  library barrels must not import it — the direct expression of A006 §3. This includes
  the workspace plugin: its `./server` and `./tui` entries reach the host only through
  adapter ports, never `@opencode/*`/`ctx.client`/`ctx.ui` directly (B002 §1/§4,
  B004 §1).

### 5. Workspace decision (locked: plugin)

`apps/workspace` becomes `@montflow/workspace`, a plugin package with `./server` and
`./tui`; the standalone app is retired. Concretely (A004 §B/§E):
- TUI half: the configurable grid is a fullscreen **route page**; Info/keybind chrome
  become `home.footer*`/`sidebar.footer` slot claims; a custom transcript may claim
  `session.panel`; dialogs/keymap move to the host.
- Server half: the data/dispatch operations (spec/skill/profile/prompt flows, the
  notify/status tool) run server-side; the session list/detail/dispatch reuse the native
  session view + `subagent`.
- Retired: `createCliRenderer` bootstrap, the `MissingPi` gate, global `useKeyboard`
  capture, and the `start`/`dev` standalone scripts (`apps/workspace/package.json:23-25`,
  `apps/workspace/src/index.tsx`). Physical path is parked (§Open Questions).

### 6. `pi-sessions` slot — nothing takes it

Decision: **no package replaces `pi-sessions`.** Rationale: A003 shows every capability is
covered by native `Session.Service` + `subagent` + `Job`; the engine owns no state that
must survive. The `mf-sessions` CLI and `verify:montflow:sessions` are retired with it
(`package.json:29`). The one residual — an agent-invocable `notify`/`status` tool (A003
§3, A006 §4 gap) — is implemented as an adapter `NotifyPort` helper (`@montflow/opencode`)
that registers the three agent-invocable tools via `ToolPort` (B002 §1/§2; B003 §7),
not a new package. Rejected: a thin `@montflow/sessions` client wrapper (no owned state ⇒
no package) — see §8.

### 7. Parked-answer decisions (A006 Open Q10, Q11)

**Q11 — `pi-notifications` / `pi-workflows`.**
- `pi-notifications` → **delete** (confirmed: no-op stub, `packages/pi-notifications/src/extension.ts`;
  `Toast`/`Attention` subsume it). It is **not** a Pi-Package boundary; its notification
  descriptors are dropped, and no adapter import is needed.
- `pi-workflows` → **adopt as a pure library** `@montflow/workflows`; drop the vestigial
  `@earendil-works/pi-coding-agent` peer (`packages/pi-workflows/package.json:44-47`; no
  `@earendil` import in `src/`). No plugin entry.

**Q10 — `cli.json` for TUI-only plugins.** Recommendation: register every montflow
plugin in **`opencode.jsonc` `plugins`**, because each exposes a `./server` entry and
therefore carries server transforms/tools (`plugin add` routes a server entrypoint to
global `opencode.jsonc`, a tui-only one to `cli.json`; A005 §1 `add.ts:47-50`). **No
montflow package is TUI-only, so `cli.json` is unused.** Use `cli.json` only if a future
package opts out of a server entry. Rejected: `cli.json`-only registration (drops all
server-side transforms/hooks/tools); listing a package in both files (double load).

### 8. Rejected alternatives

1. **One monolithic plugin package** (all concerns + adapter + TUI). Rejected: destroys
   per-concern modularity, one giant dependency graph, contradicts montflow's
   module/group structure and SPEC §52's pure-before-session/TUI ordering.
2. **Plugin package per concern *plus* a separate CLI package per concern.** Rejected:
   the CLI is filesystem-only and dependency-free (A001); one package per concern with a
   `bin` keeps the domain library, CLI, and plugin faces cohesive.
3. **Promise authoring (`.`) instead of Effect (`./effect`).** Rejected: locked; montflow
   is Effect-first and A006 §1 re-layers the extension entry onto the Effect `Plugin<R>`.
4. **Retain `pi-sessions` (or a thin `@montflow/sessions` client wrapper).** Rejected:
   A003 retire verdict; no owned state; native session surface is equal or richer.
5. **Keep the `pi-` package prefixes.** Rejected: the infix denotes the Pi runtime that
   will be absent; all packages are `private: true` with only `workspace:*` consumers and
   private Git-URL/local distribution (A001; A005 §4), so there is no external
   name-stability contract and the rename is low-cost. Namespaces: keep `@montflow/`,
   drop `pi-`. The old packages are **removed** (not deprecated) once ported, per-concern,
   at port time (B005 sequence).
6. **npm publish / Changesets for the plugins.** Rejected: locked private
   Git-URL/local; `.changeset/config.json` already ignores most `pi-*` (`release.yml`
   gates public packages only; A005 §4).
7. **Register plugins in `cli.json`.** Rejected: loses server transforms/tools (§7).
8. **`./rpc` entrypoint.** Rejected: no cross-process RPC need (§3).
9. **Put the server plugin at `"."` (docs idiom).** Rejected: these packages are
   libraries-first (the workspace imports the `.` barrel); `Host.resolve` prefers
   `./server`, so the plugin half is an additive subpath and the barrel survives.
10. **Keep the standalone workspace app alongside the plugin.** Rejected: locked; the
    host owns the renderer/input/app chrome (A004 §E), so a standalone app cannot coexist.
11. **Make the adapter a plugin package.** Rejected: it registers nothing; it is a seam
    library consumed by the concern plugins.
12. **Split the adapter into `@montflow/opencode` + `@montflow/opencode-tui`.** Rejected:
    the seams share types; TUI peers are optional peers, so one package with `.`/`./tui`
    avoids duplicated seam definitions.
13. **Port `pi-notifications`.** Rejected: no-op stub, subsumed by host notifications (§7).
14. **Merge `@montflow/workflows` into `@montflow/core`.** Rejected: a distinct pure
    concern with its own module/tests; keep separate (revisit only if it stays a
    single-module library — parked).

## Open Questions

1. **Concern-package `./tui` scope vs workspace-owned routes** — do the five concern
   packages each ship a `./tui` half, or does all TUI live in the workspace plugin?
   Recommendation: keep per-concern `./tui` for slash-command dialog flows; route pages
   (Skills/Profiles/Prompts/Specs grids) live in the workspace plugin. Resolves with
   B004's workspace decomposition.
2. **Final adapter package name** — `@montflow/opencode` recommended; confirm no collision
   with a future `@montflow/opencode-*` family (trivial to rename while private).
3. **On-disk prompt artifact dir** — the only `pi-`-prefixed data dir is
   `.agents/@montflow/pi-prompts` (`packages/pi-prompts/src/services/prompt-store/prompt-store.services.module.ts:10`); rename to
   `.agents/@montflow/prompts` to match the package rename, or keep for data
   compatibility? (B005.)
4. **`@montflow/workflows` size** — keep as its own library, or fold into `@montflow/core`
   if it remains a single module. (B005.)
5. **Workspace physical location** — keep `apps/workspace` (an app-level artifact) or move
   to `packages/workspace` now that it is a plugin package? (B004/B005.)

## Handoff

- Feeds B005 plan-migration-sequence and B006 plan-verification-and-distribution.

## Deviations

- None.
