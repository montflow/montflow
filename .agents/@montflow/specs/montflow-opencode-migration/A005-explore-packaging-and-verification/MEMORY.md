# Memory

## Context

Determined how an OpenCode v2 plugin package is authored, resolved, loaded,
verified, and distributed, and how that fits montflow's turbo, Changesets, and
`verify:montflow` tooling. Source of truth is the pinned reference clone
`.agents/references/opencode/` at tag `v2.0.18` (commit `cd9a14a`), the running
host (`opencode --version` → `v2.0.18`), the published `@opencode/plugin@2.0.18`
on npm, the V2 plugin docs (`https://opencode.ai/v2/docs/build/plugins` and
`.../plugins/cli`), and montflow's own root/package manifests, `.changeset`,
`verify` scripts, and workflows. Every claim cites a file path and symbol or a
registry observation. Phase-B decisions are marked "(B006)".

## Progress

- 2026-10-13: complete

## Findings

### 1. Plugin package shape and loader/config model

**Entrypoint exports (`@opencode/plugin` host package)** —
`.agents/references/opencode/packages/plugin/package.json:12-18`:
`.` → `src/promise/index.ts` (Promise authoring), `./effect` → `src/effect/index.ts`
(Effect authoring), `./host` → `src/host.ts` (resolve/load), `./tui` →
`src/tui/index.ts` (CLI/TUI authoring), `./*` → `src/*.ts` (wildcard; e.g.
`./source`, `./promise/session`, `./effect/plugin`, `./tui/context`). The
`#plugin-source` import condition selects the bun/node local-source loader
(`package.json:19-25`). Published dist reshapes this to `./dist/**`
(`npm view @opencode/plugin@2.0.18 exports`: `.`, `./*`, `./tui`, `./host`,
`./effect`).

**Peer deps and `effect` handling** — `package.json:29-59`: regular deps include
`effect: "catalog:"`, `zod: "catalog:"`, workspace `@opencode/{ai,client,protocol,schema,util}`,
`@ai-sdk/provider@3.0.8`, `@standard-schema/spec`. All peers are optional:
`@opencode/theme` (workspace), `@opentui/core >=0.5.12`, `@opentui/solid >=0.5.12`,
`solid-js >=1.9.0` (`:40-59`). The docs' publish manifest
(`https://opencode.ai/v2/docs/build/plugins`, "Publish") is `exports { "." }`
plus optional `./rpc`, and `dependencies { "@opencode/plugin": "latest" }`; the
CLI-plugin manifest (`.../build/plugins/cli`, "Publish and load") adds `./tui`
and peers `@opentui/core >=0.5.8`, `@opentui/solid >=0.5.8`, `solid-js >=1.9.0`.

**`./` / `./tui` / `./rpc` resolution contract** — `Host.resolve`
(`packages/plugin/src/host.ts:17-44`) maps `server = entry(["server",""])`,
`tui = entry(["tui"])`, `rpc = entry(["rpc"])`; it honors package `exports`
(import condition, not require), falls back to `main`/`index`, and admits
conventional `index.ts|js`, `tui.tsx`, `rpc.ts`. Resolution **never executes
plugin code** and a missing exported file yields `undefined`
(`packages/plugin/test/host.test.ts:29-156`, incl. TUI-only packages at
`:131-147` and missing-file `:149-155`). `Host.load = importModule`
(`host.ts:46-48`).

**Local dev/load workflow** — local plugins live in `.opencode/plugin` and
`.opencode/plugins` (`packages/core/src/plugin/source-directory.ts:7`); config
roots are scanned by `ConfigPluginSource.scan`
(`packages/core/src/config/plugin/source.ts:122-189`). The TUI discovers only
`<dir>/plugins` (`packages/tui/src/plugin/discovery.ts:8-22`). Non-discovered
plugins are declared in config and loaded by specifier:
`opencode.jsonc plugins` is `string | { package, options? }`
(`packages/schema/src/config/plugin.ts:6-14`); a leading `-` removes a target
(`source.ts:113-119`); explicit config is applied last so it can remove
auto-discovered packages (`source.ts:158-159`); `./`, `../` resolve against the
config directory and `file://` is converted (`source.ts:140-144`). Resolution
(`packages/core/src/plugin/module.ts:80-133`): an **absolute** target loads
locally through `createPluginSources` (fingerprint + watch, `plugin/src/source.ts:8-59`,
`source.bun.ts:11-69`, `source.node.ts:10-51`); a **non-absolute** target goes
through `Npm.add` (`npm.resolve` when `install:false`); no server entrypoint with
`install:false` → `{ pending: true }`; otherwise `LoadError`. The default export
must be `{ id, effect }` or `{ id, setup }` (Promise setup wrapped by
`PluginPromise.fromPromise`) (`module.ts:60-73,107-116`); resolved features mark
tui/rpc availability (`module.ts:119-122`). Hot reload: core `PluginModule.watch`
(`module.ts:16-58`) and the TUI `createSourceWatcher` + debounced `reconcile`
(`packages/tui/src/plugin/watch.ts:16-103`, `context.tsx:252-389`).

**Config file reality — corrects A002 §4.** `cli.json` **does exist** and is the
v2 CLI/TUI config: global `path.join(global.config, "cli.json")`
(`packages/cli/src/config/config.ts:31`), schema `https://opencode.ai/v2/cli.json`
(`packages/cli/src/config/schema.ts:4`), embedding the TUI `Config.Info` fields
(`schema.ts:6-9`) whose `plugins` array is `string | { package, options }`
(`packages/tui/src/config/index.tsx:47-55,76-78`) and is consumed as
`config.data.plugins` (`packages/tui/src/plugin/context.tsx:306,529`).
`tui.json` is the **V1 legacy** file migrated into `cli.json`
(`packages/cli/src/config/migrate.ts:100-116`). There is no `cli.json` in this
repo or in the pinned clone, but one exists on this machine
(`/home/daniel/.config/opencode/cli.json`), so A002's "no cli.json" was true only
for the repo/clone. Split: server plugins go in `opencode.jsonc plugins`, CLI-only
plugins in `cli.json plugins` (docs `.../plugins/cli`, "Publish and load").

**Install command routing** — `opencode plugin add` requires
`Npm.isInstallablePackage` ("npm registry package or Git package specifier"),
runs `npm.add`, `Host.resolve`, then routes a **server** entrypoint to the global
`opencode.jsonc` (`resolveConfigPath(global.config)` + `writePluginConfig` JSONC
edit) and a **tui-only** entrypoint to `cli.json` (`config.update` on
`.plugins`) (`packages/cli/src/commands/handlers/plugin/add.ts:14-50,52-80`;
`configurationTarget` server wins over tui, `add.ts:47-50`).
`Npm.isInstallablePackage` accepts registry specs and `github:`, `git+ssh:`,
`git@…`, `git+https…#<sha>::path:` forms, and rejects `./…`,
`https://….tgz`, and `alias@npm:` (`packages/core/test/npm.test.ts:139-153`).
`plugin list/check` reads server runtime via the client and TUI/CLI items from
`cli.json` (`add.ts` sibling `inventory.ts:38-64`).

### 2. Version pins and the Effect-redirection constraint

**Runtime module redirection** — the Node bundle redirects exactly six
specifiers: `@opencode/plugin`, `@opencode/plugin/promise/plugin`,
`@opencode/plugin/promise/tool`, `@opencode/plugin/effect`,
`@opencode/plugin/effect/plugin`, `@opencode/plugin/effect/tool` to
`opencode:*` virtual modules (`packages/cli/vite.node.config.ts:160-167`) via
`module.registerHooks` resolve/load short-circuit (`:176-187`). Each virtual
module reads `globalThis[Symbol.for("opencode.plugin.v2.promise" | "opencode.plugin.v2.effect")]`
(`:124-149`). Those globals are populated at host startup from the host's own
`@opencode/plugin/effect` / `@opencode/plugin` re-exports
(`packages/cli/src/node/plugin-runtime.effect.ts:15-28`,
`plugin-runtime.promise.ts:14-26`).

**What a plugin must avoid bundling.** Because the host replaces those six
specifiers at runtime, a plugin must **not** vendor or inline `@opencode/plugin`
or its `@opencode/*`/schema singletons (e.g. `Model.Info`, `Provider.Info`,
`Tool.Error`); it should import `@opencode/plugin` / `@opencode/plugin/effect` /
`@opencode/plugin/tui` by specifier and declare `@opencode/plugin` as a normal
dependency for types only. Note the map does **not** include `effect`: a direct
`import { Schema } from "effect"` in plugin code (as the docs show) resolves to
the plugin's own installed copy, so effect dedupe/drift must be handled
explicitly (see pins below; B006). TUI plugins similarly must not bundle
`@opentui/core`, `@opentui/solid`, or `solid-js` (declared peers).

**Host pins (v2.0.18).** Clone root catalog
(`.agents/references/opencode/package.json`): `effect 4.0.0-rc.112` (`:82`),
`@opentui/core|keymap|solid 0.5.12` (`:55-57`), `solid-js 1.9.15` (`:110`),
`zod 4.1.8` (`:97`); overrides force effect/opentui/solid to catalog
(`:156-167`). Published `@opencode/plugin@2.0.18` depends on
`effect 4.0.0-rc.112`, `@opencode/schema@2.0.18`, etc., with peers
`@opentui/* >=0.5.12` and `solid-js >=1.9.0`.

**Montflow pins.** Root `overrides { effect: "4.0.3" }`
(`package.json:12-14`); `bun.lock` resolves `effect@4.0.3`,
`@opentui/core@0.5.11`, `@opentui/solid@0.5.11`, `solid-js@1.9.12`; packages
declare `peerDependencies { effect: "^4.0.3" }` (e.g.
`packages/core/package.json:63-65`, `packages/pi-effect/package.json:44-47`).
No montflow package currently depends on any `@opencode/*` (grep empty).
Concrete drifts to catch: **effect 4.0.3 vs host rc.112**; **OpenTUI 0.5.11 vs
host peer `>=0.5.12` (violated)**; solid-js 1.9.12 vs host catalog 1.9.15 (peer
`>=1.9.0`, satisfied). Running host confirmed: `opencode --version` → `v2.0.18`.

### 3. Verification matrix — headless vs not

**CAN be verified without running OpenCode (turbo + vitest + bun):**
- **Unit tests** — existing per-package `vitest run` (and `--typecheck`), with
  `@effect/vitest 4.0.3` (e.g. `packages/pi-effect/package.json:31-42`,
  `packages/core/package.json:47`).
- **Adapter contract tests** — assert montflow adapter implementations satisfy
  their interfaces and map to/from `@opencode/plugin` types/schemas, using
  in-memory Effect Layers (no host). Feasible because `@opencode/plugin@2.0.18`
  is published and can be added as a devDependency.
- **Type-level tests** — `tsc --noEmit` (turbo `ts:check`) and
  `Vitest.expectTypeOf` under `vitest --typecheck` (e.g.
  `packages/format/src/structs/color/tests/make.test.ts:8`).
- **Plugin-loader smoke test** — `Host.resolve({ directory })` is pure fs, never
  executes plugin code, and is safe headlessly (proven by the host's own
  `packages/plugin/test/host.test.ts`). A load smoke test can call
  `Host.load(entrypoint)` and assert the default export is `{ id, effect|setup }`.
  `Host.load` uses `@opencode/util/runtime-import` (native/hook loading), which
  vitest may not intercept cleanly, so the load case is best run under `bun test`
  or as its own script (B006 decision).
- **Package-shape/static checks** — assert `package.json` exports (`.`, `./tui`,
  `./rpc`, `./effect`), that `@opencode/plugin` stays an external dependency and
  is not inlined in build output, and that TUI peers are declared.
- **Compatibility-pin drift check** — a script comparing montflow's resolved
  effect/opentui/solid against the host catalog / `@opencode/plugin@2.0.18`
  deps+peers (B006 to define).
- **Existing extension verifies** — `verify:montflow:skills|prompts|specs|profiles|sessions|reviews`
  run each package's CLI (`mf-*`) over repo artifacts, wired through root
  `package.json:25-35`, `.github/workflows/verify.yml:44-64`, `lefthook.yml:19-27`.

**CANNOT be verified headlessly (needs OpenCode/host):**
- Live TUI rendering — Solid slots/routes/dialogs/panels/keymap/markdown/theme
  (`packages/tui/src/plugin/context.tsx`, `api.tsx`).
- Host-dependent behavior — plugin `setup`/`transform`/`hook`/`reload` against
  live domain registries (`packages/core/src/plugin.ts`), event stream, session
  execution, model/provider resolution, permissions, storage durability,
  attention/notifications, worktrees.
- The actual redirection behavior (the SEA/Node import map) — only exercised by
  the packaged host.
- npm/Git install + host load end-to-end (network + host).

### 4. Distribution options and Changesets/release impact

**npm (Changesets-managed).** `.changeset/config.json`: GitHub changelog,
`access: "public"`, `baseBranch: "main"`, an `ignore` list of private `pi-*`
packages, and `privatePackages { version: false, tag: false }`.
`.github/workflows/release.yml` computes releasable packages (under
`packages|tooling|apps`, not private, has version, not ignored, version not on
npm) and gates each with per-package `test`/`ts:check`/`lint:check`/`format:check`
before `changesets/action` version+publish (`release.yml:60-100,155-208`). The
only public published montflow packages are `@montflow/core` (`private: false`)
and `@montflow/format` — `changeset:publish` builds both (`package.json:18`). A
new **public** plugin package under `packages/*` is auto-included in this gate; a
**private** one is skipped.

**Git URL.** `opencode plugin add github:acme/plugin#main` or
`git+https://…#<sha>::path:packages/plugin`; these are accepted by
`Npm.isInstallablePackage` (`npm.test.ts:139-153`) and installed by `npm.add`;
version identity is the resolved git revision
(`module.ts:105,123,129`). Changesets does not version Git installs, so Git
distribution bypasses npm publish. Whether the package is *also* published to npm
is orthogonal: if it stays public and not ignored, `release.yml` still publishes
it.

**Local / `file://`.** Absolute and `./`/`../` targets load through
`createPluginSources` with fs watching; standalone server source files are still
admitted while configured local plugins must be directories
(`module.ts:92-97`, `source.ts:150-155`) — the dev/iteration path.

**Private-package impact.** All `pi-*` packages are `private: true`; they are neither
versioned nor published because `release.yml` filters on `manifest.private` and
`.changeset/config.json` sets `privatePackages { version: false, tag: false }`. The
`ignore` list is only **partial** — it lists six (`pi-effect`, `pi-profiles`,
`pi-prompts`, `pi-reviews`, `pi-sessions`, `pi-skills`) of the ten `pi-*` packages;
`pi-interactive`, `pi-notifications`, `pi-specs`, and `pi-workflows` are private but
absent from it. A private plugin package must therefore be consumed via Git URL, local
path, or a private registry; `cli.json` is the docs-recommended place for CLI-only
packages so they stay active against remote servers.

## Open Questions

- Promise (`.`) versus Effect (`./effect`) authoring for the migrated plugins —
  depends on the domain-contract decision owned by A002/A006.
- Whether montflow publishes any plugin to npm (public → Changesets + `release.yml`)
  or distributes privately via Git URL (private → excluded). (B006)
- How the plugin-loader smoke test runs given `Host.load`/`runtime-import` native
  loading: under `vitest`, `bun test`, or a dedicated turbo/verify task. (B006)
- Whether to raise montflow's `@opentui/core|solid` to `>=0.5.12` to satisfy the
  host peer (currently 0.5.11), and whether workspace `solid-js 1.9.12` is
  acceptable (host catalog 1.9.15, peer `>=1.9.0`). (B006)
- How to share/dedupe `effect` (host `4.0.0-rc.112` vs montflow `4.0.3`) given
  `effect` is not in the runtime redirect map. (B006)
- Whether any migrated plugin needs the optional `./rpc` export surface
  (docs mark it optional; rpc domain covered by A002).
- `@opencode/util` is absent from the pinned clone (partial clone), so
  `runtime-import` internals are cited indirectly via `host.ts` and
  `packages/core/test/npm.test.ts`; confirm if its source is needed.

## Handoff

- Feeds B006 plan-verification-and-distribution and A006 synthesize-migration-contract.

## Deviations

- None.
