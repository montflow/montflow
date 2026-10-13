# Memory

## Context

Specifies how the migrated packages are **verified headlessly and in CI**, how the
existing `verify:montflow` gate **absorbs** them without weakening, and how they are
**distributed** (private Git-URL / local — no npm publish, no Changesets release).
Also fixes the **compatibility pins** (Effect, OpenTUI, Solid) and the **drift check**
that catches divergence, resolving A006 Open Q2/Q3/Q6/Q9. Grounded in the actual gate
files — root `package.json:15-35` scripts and `overrides`, `turbo.json:3-46`,
`lefthook.yml:19-27`, `.github/workflows/verify.yml`, `.github/workflows/release.yml`,
`.changeset/config.json` — plus the target package set from B001 §1/§3 and the adapter
seams from B002 §1/§5. Current resolved pins (from `bun.lock`): `effect@4.0.3`,
`@opentui/core@0.5.11`, `@opentui/solid@0.5.11`, `solid-js@1.9.12`. Locked inputs (not
revisited): Effect authoring; private Git-URL/local; workspace TUI+server plugin;
OpenTUI `>=0.5.12`; transcripts local-only; `pi-sessions` deleted. This task DECIDES;
it implements nothing.

## Progress

- 2026-10-13: complete

## Findings

### 1. What the existing gate already covers, and how new packages enter it

`turbo.json:3-46` defines generic `lint:check` / `format:check` / `ts:check` / `test` /
`build` tasks; `test` and `ts:check` `dependsOn: ["^build"]`, `build` outputs
`build/**`,`dist/**`. Root `package.json:15-35` exposes them as `turbo <task>`. The
workspace glob is `packages/*`,`tooling/*`,`apps/*` (`package.json:7-11`), so **every
new package under `packages/*` is enrolled automatically** in all five turbo tasks —
no root wiring for lint/format/typecheck/test. Each package only needs the standard
`scripts` block (`lint:check`/`lint:fix`/`format:check`/`format:fix`/`ts:check`/`test`,
plus `build`/`smoke`/`prepare` for plugin packages). `bun run verify:montflow`
(`package.json:33`) = `turbo lint:check && turbo format:check && turbo ts:check &&
turbo test && verify:montflow:extensions`; `:fast` drops `turbo test`
(`package.json:32`). `verify.yml:44-64` runs each as its own matrix cell through the
same root scripts, and `lefthook.yml:19-27` runs `verify:montflow:fast` on pre-push.

Consequence: the new packages are absorbed by the existing `test`/`ts:check`/`lint`/
`format` cells with **zero** changes to those cells. The plan below adds exactly two
things and removes one:

- **add** a `smoke` turbo task (plugin-loader + package-shape checks) — §3;
- **add** a `verify:montflow:compat` drift check — §8;
- **remove** `verify:montflow:sessions` and its `verify.yml` matrix cell, because its
  subject `@montflow/pi-sessions` is deleted (B003 §1/§3). Removing a check whose
  capability is retired is not a weakening; net coverage rises (smoke + compat added).

### 2. Per-package verification table

Target package set is B001 §1. "Kind" drives which checks apply. Every package keeps
the standard four turbo scripts; additions are named per row.

| Package | Kind / entrypoints | `test` (`vitest run --typecheck`) | `ts:check`/`lint`/`format` | Loader smoke (`bun test`) | Adapter contract | Build / externals |
|---|---|---|---|---|---|---|
| `@montflow/opencode` (new adapter) | pure **library** (B001 §2 + §8.11); `.`, `./tui` seam modules | port **contract tests**: types + in-memory fakes (§4) | yes | n/a (library, no plugin entry) | **owner** of the contract suite | source-only as workspace lib; bundled into plugins |
| `@montflow/specs` | plugin; `.`, `./server`, `./tui`, bin `mf-specs` | module tests + server/tui wiring vs fakes | yes | `resolve ./server`→`{id,effect}`, `./tui`→`{id,setup}` | consumes adapter suite | `build`(tsdown)+`prepare`, host externals |
| `@montflow/profiles` | plugin; `.`, `./server`, `./tui`, bin `mf-profiles` | same | yes | same | same | same |
| `@montflow/prompts` | plugin; `.`, `./server`, `./tui`, bin `mf-prompts` | same | yes | same | same | same |
| `@montflow/reviews` | plugin; `.`, `./server`, `./tui`, bin `mf-reviews` | same | yes | same | same | same |
| `@montflow/skills` | plugin; `.`, `./server`, `./tui`, bin `mf-skills` | same | yes | same | same | same |
| `@montflow/workspace` | plugin; `.`, `./server`, `./tui` (B001 §5, B004 §1) | module tests + **TUI component tests** (`bun test`, OpenTUI `testRender`, precedent `apps/workspace/src/components/tests/*.test.tsx`, `apps/workspace/package.json:31`) | yes | `resolve ./server`+`./tui` | consumes adapter suite | same |
| `@montflow/workflows` | pure library; `.` (B001 §1/§7) | module tests | yes | n/a | n/a | source-only |
| `@montflow/core`, `@montflow/format` | unchanged | unchanged | yes | n/a | n/a | unchanged (tsc build) |
| ~~`@montflow/pi-sessions`~~ | **deleted** | — | — | — | — | remove scripts/devDep/CI cell |
| ~~`@montflow/pi-notifications`~~ | **deleted** | — | — | — | — | delete |

Standard scripts per package (mirroring `packages/pi-specs/package.json:30-40`):
`"lint:check": "oxlint --deny-warnings ."`, `"format:check": "oxfmt --check ."`,
`"ts:check": "tsc --noEmit"`, `"test": "vitest run --typecheck"`; plugin packages add
`"build": "tsdown"`, `"smoke": "bun test test/plugin-loader.test.ts"`,
`"prepare": "tsdown"` (in-repo/dev only; the Git-install artifact is prebuilt with no
`workspace:*` manifest — §6, so `prepare` must not be relied on for distribution). `vitest.config.ts`
keeps the module convention (`environment: 'node'`, `include/typecheck.include:
['src/**/*.test.ts']`, `packages/pi-specs/vitest.config.ts:3-12`). Tests live inside the
module: `src/[group]/[module]/tests/[utility].test.ts` (`montflow-typescript-testing`
Core Rule 1); the loader smoke is the one deliberate exception, living at
`test/plugin-loader.test.ts` because it exercises the package's `exports` surface, not
a single module (documented deviation from the module-test location).

### 3. Plugin-loader smoke test — home and shape

**Decision (A006 Q9): a dedicated `smoke` turbo task, run by `bun test`.** `Host.resolve`
is pure filesystem and never executes plugin code (`packages/plugin/src/host.ts:17-44`;
`packages/plugin/test/host.test.ts:29-156`), so it is safe anywhere; but `Host.load =
importModule` uses `@opencode/util/runtime-import` native loading (`host.ts:46-48`) that
vitest does not intercept cleanly (A005 §3). Running the whole smoke under `bun test`
keeps both phases in one place and matches the existing workspace TUI-test precedent
(`bun test ...test.tsx`, `apps/workspace/package.json:31`).

New turbo task (`turbo.json`): `"smoke": { "cache": true, "dependsOn": ["^build"] }`,
so the smoke runs against the built `dist` exports. Wired as root
`"smoke": "turbo smoke"` and appended to `verify:montflow` (full only, not `:fast`,
since `:fast` is intentionally test-free — `package.json:32`).

`packages/<plugin>/test/plugin-loader.test.ts` asserts, per plugin package:

1. **Resolve (fs-only):** `Host.resolve({ directory })` from `@opencode/plugin/host`
   yields a `server` entry (for packages declaring `./server`) and a `tui` entry (for
   packages declaring `./tui`), each pointing at an existing path; a missing subpath
   yields `undefined` (`host.test.ts:131-155`).
2. **Load shape (native):** `Host.load(entrypoint)` default export is `{ id, effect }`
   for `./server` (Effect authoring, locked) and `{ id, setup }` for `./tui`
   (host-mandated Promise `setup`, B002 fact 1).
3. **No code executes on resolve** — asserted indirectly by providing a directory whose
   plugin module throws at import time and confirming `resolve` still succeeds.

Package-shape static assertions (same smoke file, fs-only): `exports` contains exactly
the declared subpaths (`.`, `./server`, `./tui`, `./package.json`) plus `bin` for the
five concern CLIs; `@opencode/plugin` is declared and **not inlined** into `dist/**`
(grep the built output for host-internal markers such as `opencode.plugin.v2.effect`
and for a vendored `@opencode/plugin` body); **`@opencode/schema`/`@opencode/client` are
`import type`-only and not inlined** (grep `dist/**` for a vendored schema body — e.g. a
`Tool.Error`/`Model.Info` definition — since they are outside the redirect map; §6);
`@opentui/*`/`solid-js` are declared peers and not inlined. For the Git-install path,
additionally assert the **published-shape manifest** contains no `workspace:` specifier
and no `@montflow/*` `dependencies` (all internal deps bundled into `dist`; §6). This
enforces A005 §2 (the host redirects six specifiers at runtime, so a plugin must keep
them external).

### 4. Adapter contract tests — no running OpenCode server

**Location:** the adapter `@montflow/opencode`, alongside each port module
(`src/modules/ports/<port>/tests/<port>.test.ts`; B002 §1 folder-per-port). **Runs under
the package's existing `test` script** (`vitest run --typecheck`), so it is absorbed by
`turbo test` with no new task. `@opencode/plugin@2.0.18` is added as a **dependency for
types** (A005 §2) with a dev pin `2.0.18`, imported `import type` so nothing host-side is
executed or bundled.

Two layers (B002 §5), both server-free:

- **Type contract** — `Vitest.expectTypeOf` (precedent
  `packages/format/src/structs/color/tests/make.test.ts:8`, run via
  `vitest --typecheck`): `Ports`' members satisfy the consumed domain shapes
  (`Plugin.Context` from `@opencode/plugin/effect`; `Context` from
  `@opencode/plugin/tui/context`; schema types from `@opencode/schema/*`, `import
  type`-only); `MontflowPlugin<R>` matches `Plugin<R>`
  (`packages/plugin/src/effect/plugin.ts:56-59`); and a **negative
  assertion** that `R` is exactly `Scope.Scope` — a foreign montflow `Context.Tag` in `R`
  must fail to compile (`// @ts-expect-error`), enforcing B002 §3's decision that no
  montflow Tag crosses into the host runtime.
- **Behavioral, with in-memory fakes** — a hand-written fake
  `PluginContext`/`TuiContext` carrying only consumed domains (B002 §5): `command.transform`
  captures `CommandEditor.add` inputs; `tool` captures `ToolEditor` + hooks; `session`
  records calls; `storage` is a `Map`; `event.subscribe` is `Stream.fromIterable`;
  `ui.dialog.select/confirm/prompt` return scripted answers; `ui.toast.show` /
  `ctx.attention.notify` record calls. Runs under `Vitest.it.effect`
  (`@effect/vitest` pinned to the aligned `effect` line `4.0.0-rc.112`; the host
  declares **no** `@effect/vitest`, so this is a montflow pin, not a host match — §8).
  Assertions: register a
  command → the captured `add` definition; `NotifyPort.notify` → `Toast.show` /
  `Attention.notify` / `ToolPort` registration; `ModelPort.resolve("provider/model")` →
  `Model.Ref`; `EventPort.subscribe` → fold a `Stream`. No host, no network, no global.

### 5. `verify:montflow` absorption and its headless limits

**Absorption (no weakening).** `verify:montflow` becomes:
`turbo lint:check && turbo format:check && turbo ts:check && turbo test && turbo smoke &&
verify:montflow:compat && verify:montflow:extensions` (minus `:sessions`).
`verify:montflow:fast` becomes the same minus `turbo test`/`turbo smoke`
(lint, format, ts:check, compat, extensions). `verify:montflow:extensions`
(`package.json:31`) drops `verify:montflow:sessions`; skills/prompts/specs/profiles/
reviews remain because their `mf-*` CLIs survive (B001 §1; A001/A006 show the CLIs are
filesystem-only). `verify.yml` matrix (lines 44-64) drops the `sessions` cell and adds
`smoke` (script `smoke`) and `compat` (script `verify:montflow:compat`); the `test`
cell already runs every new package's contract tests. `lefthook.yml:19-27` needs no
edit (it calls `verify:montflow:fast`, whose expansion changed inside `package.json`).
`release.yml` needs no edit (§7).

**Cannot be covered headlessly** (A005 §3, B002 §5) — named honestly:

1. **Live TUI rendering** — Solid slots/routes/dialogs/panels/keymap/markdown/theme
   (`packages/tui/src/plugin/context.tsx`, `api.tsx`). TUI *component* tests (OpenTUI
   `testRender`) cover pure rendering, but not host-owned chrome/input scope; requires a
   live run against an elected server (host repo's `bun run dev:live`, see
   `.agents/references/opencode/AGENTS.md` "Live V2 TUI Testing"). Carried as a manual
   checkpoint per execution phase.
2. **Host-dependent transform/hook/session behavior** — `setup`/`transform`/`hook`/
   `reload` against live registries, the event stream, session execution, model/provider
   resolution, storage durability (`packages/core/src/plugin.ts`). Fakes prove shape and
   call-capture, not host semantics.
3. **The packaged redirect map** — the SEA/Node import map that replaces the six
   specifiers (`packages/cli/vite.node.config.ts:160-167`) is only exercised by the
   packaged host, never by a unit test.
4. **Real Git install + host load end-to-end** — network + host (`Npm.add` →
   `Host.resolve`/`load`). Verify with a documented manual smoke: install the pinned Git
   subpath into a scratch host and load it. The `Host.load` smoke (§3) approaches this but
   runs in-repo, not through `Npm.add`.

### 6. Distribution path

**Decision (A006 Q6): private Git-URL / local, no npm publish.** All new/changed plugin
and library packages are `private: true`; consumption is `workspace:*` (in-repo),
`file:`/absolute-path (local iteration, `Host.resolve`'s `createPluginSources` path —
A005 §4), or Git-URL (per-package install).

- **The `workspace:*` constraint (stated precisely).** npm does not understand the
  `workspace:` protocol outside a monorepo: it errors during dependency resolution,
  **before** any `prepare`/`tsdown` hook can run, and it does so for `dependencies`,
  `devDependencies`, `optionalDependencies`, and `peerDependencies` alike. Therefore a
  committed manifest containing `@montflow/*: workspace:*` is **uninstallable** via
  `Npm.add` (Git-URL), and bundling into `dist` does not change what npm reads in
  `package.json`. In-repo (bun monorepo) consumption keeps `workspace:*`; out-of-repo
  private consumption uses one of two npm-free / manifest-clean forms:
  - **Local path (primary, no npm):** an absolute/`./`/`../` target, e.g.
    `opencode plugin add /abs/path/packages/<name>`, loads through
    `createPluginSources`/`Host` and does **not** run `Npm.add` (A005 §1/§4), so
    `workspace:*` is never parsed by npm. Works against the source tree as-is.
  - **Git-URL (self-contained published artifact):**
    `opencode plugin add git+https://github.com/montflow/montflow.git#<sha>::path:packages/<name>`
    (accepted by `Npm.isInstallablePackage`, `packages/core/test/npm.test.ts:139-153`)
    must point at a **generated** published-shape package — not the committed source
    manifest. That artifact ships prebuilt `dist` (committed to the release ref or
    produced by a `pack:` step), `files: ["dist"]`, `exports` → `dist/*.js`(+`.d.ts`),
    and a `package.json` whose `dependencies` list **only external host/runtime
    specifiers** (`@opencode/plugin@2.0.18`, `effect@4.0.0-rc.112`) — every `@montflow/*`
    dependency is **bundled into `dist`** and absent from the manifest. `prepare` is
    therefore optional (the artifact is prebuilt); relying on `prepare` while leaving
    `workspace:*` in the committed manifest cannot work.
- **Externalized singletons** (bundled **out**, must stay external; A005 §2). The
  redirect map covers exactly six specifiers (`packages/cli/vite.node.config.ts:160-167`):
  `@opencode/plugin`, `@opencode/plugin/effect`, `@opencode/plugin/effect/plugin`,
  `@opencode/plugin/effect/tool`, `@opencode/plugin/promise/plugin`,
  `@opencode/plugin/promise/tool`. Every one of those (plus the non-redirected host
  subpaths `@opencode/plugin/tui`, `@opencode/plugin/host`) stays external, **as do
  `@opencode/schema` and `@opencode/client`**: they are host singletons *not* in the
  redirect map, so any runtime value inlined from them (brand constructors, `Tool.Error`,
  codecs) would create a second instance. montflow may import them **`import type`-only**;
  any runtime constructor must be reached through a redirected `@opencode/plugin/*`
  specifier. Also external: `@opentui/*`, `solid-js`, and `effect`.
- **Peer deps** (must not be bundled; mirrors host
  `packages/plugin/package.json:40-45`): `@opentui/core >=0.5.12`,
  `@opentui/solid >=0.5.12`, `solid-js >=1.9.0`, all with
  `peerDependenciesMeta.*.optional: true`; devDependencies pin the host catalog
  (`@opentui/* 0.5.12`, `solid-js 1.9.15`). `effect` is **not** a peer — it is a normal
  external dependency pinned exactly (§8) because it is outside the redirect map and the
  plugin supplies its own copy. `@opencode/plugin` is a normal dependency pinned
  `2.0.18` (A005 §2; host redirects it at runtime).
- **Version pins (monorepo manifests).** Internal deps `workspace:*` in the committed
  monorepo manifests only (see the constraint above). Cross-package pins are exact where
  identity matters (`effect`, `@opencode/plugin`) and caret/range only where the host
  itself uses a range (`@opentui/* >=0.5.12`, `solid-js >=1.9.0`).

### 7. Changesets and CI impact of NOT publishing to npm

- **`.changeset/config.json`** (`:1-25`): keep the file (core/format still publish), keep
  `privatePackages { version: false, tag: false }` (`:21-24`) and `access: "public"`
  (for core/format). **Refresh the `ignore` list**: remove the deleted
  `@montflow/pi-effect` / `@montflow/pi-sessions` entries and rename the retained
  `pi-profiles`/`pi-prompts`/`pi-reviews`/`pi-skills` entries to their new names
  (`.changeset/config.json:9-20`; note `@montflow/pi-notifications` is **not** in the
  current list — verified — so there is nothing to remove for it), then list the new
  private packages (`@montflow/opencode`, `@montflow/workflows`, `@montflow/profiles`,
  `@montflow/prompts`, `@montflow/reviews`, `@montflow/skills`, `@montflow/specs`,
  `@montflow/workspace`). Listing private packages in `ignore` is the existing repo
  pattern (six of ten `pi-*` are listed today) and is required for Changesets to skip
  them; `privatePackages.version:false` already prevents versioning but `ignore` makes
  the intent explicit and avoids "package not found in changesets" surprises.
- **`release.yml`**: **no change.** Its `setup` job already filters
  `manifest.private || !manifest.version || ignored.has(name)` (`release.yml:80`) and
  publishes only packages whose version is not yet on npm (`:86-97`). New `private:true`
  packages are therefore skipped by `checks` and `release`; `changeset:publish` still
  builds only `@montflow/core` + `@montflow/format` (`package.json:18`). Leaving
  `release.yml` untouched is the correct outcome of "no npm publish" — the workflow
  already gates publishing, not pushes (`verify.yml:10-16`).
- **`verify.yml`**: remove the `sessions` matrix cell (`:61-62`); add `smoke` and
  `compat` cells. No other change; the `test` cell runs the contract tests.
- **Root `package.json`**: change `overrides.effect` to `4.0.0-rc.112` (`:12-14`) and
  align `@effect/vitest`/`@effect/platform-node` to the same line; remove the
  `@montflow/pi-sessions` devDependency (`:40`); drop `verify:montflow:sessions` (`:29`)
  from `:extensions` (`:31`) and both gates (`:32-33`); **rewire the five
  `verify:montflow:{skills,prompts,specs,profiles,reviews}` scripts** from
  `--cwd packages/pi-*` to the renamed package dirs (`:25-28,:30`) so the CI cells and
  the extensions gate keep resolving, and **repoint the root `@montflow/pi-specs`
  devDependency** (`:41`) to `@montflow/specs` (or drop it if no longer needed); add
  `smoke` and `verify:montflow:compat`.
- **Decision — do not remove Changesets.** core/format remain public packages; the
  release machinery still owns them. The migration only stops *adding* releasable
  packages.

### 8. Compatibility pins and the drift check

Pins (target ↔ host evidence):

| Dependency | Host v2.0.18 | montflow target | Basis |
|---|---|---|---|
| `effect` | `4.0.0-rc.112` (clone `package.json:82`) | **exact `4.0.0-rc.112`** (root `overrides` + every peer/dep) | B002 §3; not in the six-specifier redirect map (`vite.node.config.ts:160-167`), so alignment is the only dedupe |
| `@effect/vitest` | **none** (host declares no `@effect/vitest`) | same pre-release line as `effect` (`4.0.0-rc.112`); currently `4.0.3` in every montflow package | must match the aligned `effect` line; montflow pin, **not** a host match (validate the exact published version at execution) |
| `@effect/platform-node` | `4.0.0-rc.112` (catalog, clone `package.json:46`) | same line as `effect` (`4.0.0-rc.112`); currently `4.0.3` (pi-profiles/prompts/reviews/skills/sessions/specs) | host catalog; align to the same line |
| `@opencode/plugin` | `2.0.18` | `2.0.18` (dependency, types; external) | A005 §1/§2 |
| `@opentui/core` | catalog `0.5.12`, peer `>=0.5.12` (`packages/plugin/package.json:42`) | peer `>=0.5.12`, dev `0.5.12` | B004 §6; current 0.5.11 violates the floor |
| `@opentui/solid` | catalog `0.5.12`, peer `>=0.5.12` (`:43`) | peer `>=0.5.12`, dev `0.5.12` | same |
| `solid-js` | catalog `1.9.15` (`:110`), peer `>=1.9.0` (`:44`) | peer `>=1.9.0`, dev `1.9.15` | B004 §6 (avoid a second instance) |
| `zod` | catalog `4.1.8` (`:97`) | `4.1.8` **if** a package imports it | host catalog; none currently |

**Pin-set owner (single).** B006 owns the full set — root `overrides.effect`, every
package's `effect` peer/dep, `@effect/vitest`, and `@effect/platform-node` — and the drift
check; C001 lands the whole set in one phase before any loader cut (B005).

**Drift check (A006 Q2/Q3).** New private tooling package
`tooling/compat-check` (follows the existing `tooling/*` + `mf-*` CLI pattern, so a CI
cell names one failing target), bin `mf-compat-check`, run by root
`verify:montflow:compat`. Algorithm:

1. Read the **host contract from the installed dev dependency**
   `node_modules/@opencode/plugin/package.json` (pin `2.0.18`): expected `effect` =
   its `dependencies.effect`; the `@opentui/*` and `solid-js` peer ranges.
2. Read montflow's declared pins: root `package.json.overrides.effect` and every
   package's `effect` peer/dep, plus `@effect/vitest` and `@effect/platform-node`, must
   **equal** the expected effect line exactly (`4.0.0-rc.112`).
3. Read resolved versions from `bun.lock` (or `node_modules/*/package.json`):
   `effect === expected`; `Bun.semver.satisfies(opentuiCore, ">=0.5.12")` and
   `(opentuiSolid, ">=0.5.12")` true; `satisfies(solidJs, ">=1.9.0")` true and
   resolved `solid-js === 1.9.15` (the chosen pin); `@opencode/plugin === 2.0.18`.
4. Any mismatch exits non-zero with the package, expected, and actual printed.

The type-level half of the dedupe guard (no foreign `Context.Tag` in `Plugin<R>`'s `R`)
lives in the adapter contract tests (§4), not the script. Wired into both
`verify:montflow` and `verify:montflow:fast` and into `verify.yml` as its own cell.
This check is cheap and offline, so it runs on pre-push (`lefthook.yml:19-27`).

## Open Questions

1. **Git-install artifact.** The Git-URL path requires a generated published-shape
   package (prebuilt `dist`, no `workspace:` specifier, no `@montflow/*` deps — §6); the
   local-path form needs no npm. Confirm with an execution spike that the packaged host
   (Node SEA) loads the generated artifact (or that a source-only local path is used).
2. **`tooling/compat-check` vs a root script.** Recommended as a package for CI
   attribution; trivially collapsible to `scripts/compat-check.ts` if the extra package
   is unwanted. Not blocking.
3. **`smoke` in `:fast`?** Currently full-gate + CI only because `:fast` is defined as
   test-free and the smoke needs `^build`. Revisit if a pre-push loader regression
   escapes.
4. **TUI component tests in the gate.** Wiring the workspace's OpenTUI `testRender`
   suite into `turbo test`/`smoke` closes C002's long-open "should `verify:montflow` run
   `test:tui`" question; confirm the runtime cost is acceptable on CI.
5. **Whole-repo Git identity.** Per-package Git subpath installs pin one sha each; if
   the toolchain grows, consider a single private registry instead. Parked (B099).

## Handoff

- Feeds B099 review-phase and the execution phases' verification work.
- Resolves A006 Open Q2 (align `effect` to `4.0.0-rc.112` + drift check), Q3 (raise
  `@opentui/*` to `>=0.5.12`, pin `solid-js 1.9.15`), Q6 (private Git-URL/local, no npm
  publish, no Changesets release for new packages), Q9 (loader smoke runs under
  `bun test` in a dedicated `smoke` turbo task).
- Constrains B005: the first execution phase must land the loader smoke + adapter
  contract tests (A006 §5 step 2) so the plugin loader is validated end-to-end before
  feature work.

## Deviations

- None.
