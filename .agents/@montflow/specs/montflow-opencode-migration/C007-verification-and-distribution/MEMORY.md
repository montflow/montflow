# Memory

## Context

Executes C007: absorb the loader-smoke harness into `verify:montflow`, add the
dependency-drift check (including the `@effect/platform-node-shared` trap from
C001), add adapter contract tests for the seam types, wire private
Git-URL/local distribution with a Changesets boundary, and update the CI
matrix. Inputs: B006 §3/§5/§6/§7/§8, A006 §5 step 7, C001 MEMORY (pin trap),
C002–C006 output. Everything is additive to the existing gate; no spec state was
touched.

## Progress

- 2026-10-21: complete. Full `verify:montflow` green, drift and distribution
  checks fail on intentional divergence and pass on the real tree.

## Findings

### 1. Loader smoke absorbed into the gate

- `turbo.json` gains `"smoke": { cache: true, dependsOn: ["^build"] }`.
- Root `package.json` gains `smoke: turbo smoke`; `packages/opencode` already
  owned `smoke: bun test test/plugin-loader.test.ts`.
- `verify:montflow` is now `lint:check → format:check → ts:check → test →
  smoke → compat → distribution → extensions`. `verify:montflow:fast` is the
  same minus `test` and `smoke` (the smoke needs a full dependency install).
- `.github/workflows/verify.yml` gains `smoke`, `compat`, and `distribution`
  cells; the `sessions` cell was already removed by C006.

### 2. Drift check: `tooling/compat-check` (`mf-compat-check`)

New private tooling package, no runtime dependency, bin
`mf-compat-check [deps|distribution|pack|all]`, root script
`verify:montflow:compat`. `deps`:

1. Reads the host catalog from the installed
   `node_modules/@opencode/plugin/package.json` (resolved from
   `packages/opencode`, the sole host importer): version `2.0.18`, exact
   `dependencies.effect = 4.0.0-rc.112`, and the `@opentui/core`,
   `@opentui/solid`, `solid-js` peer ranges.
2. Reads every workspace manifest (root + `packages/*` + `apps/*` +
   `tooling/*`) and asserts every `effect`, `@effect/platform-node`,
   `@effect/platform-node-shared`, `@effect/vitest` declaration equals the host
   effect line exactly; `@opencode/plugin` and `@opencode/schema` equal the host
   release; `@opentui/*` and `solid-js` peer ranges equal the host range and
   exact pins satisfy its floor, with a single exact pin per singleton.
3. Requires the root overrides `effect` **and** `@effect/platform-node-shared`
   at the host line. This is the C001 trap: `@effect/platform-node` declares
   `@effect/platform-node-shared: ^4.0.0-rc.112`, which resolves to `4.0.3`,
   whose entry imports the removed `effect/cluster/Runners`.
4. Reads top-level resolved versions from `bun.lock` and asserts them against
   the same expectations — so the trap is caught at the lockfile, not only at
   the manifest. Nested resolutions (`"@opentui/solid/solid-js": …`) are
   deliberately skipped: they are a distinct graph node, not the workspace's
   declared copy.

Real tree: `compat: … 19 packages, 689 resolved pins, 0 drift`.

### 3. Adapter contract tests (`packages/opencode/src/modules/ports/tests/seams.test.ts`)

`@effect/vitest` + `expectTypeOf`, one suite over the whole `ports` module:
host `Plugin.Context` extends `PortsContext`; every server domain slice extends
its mirror; the TUI context extends `TuiPortsContext` minus the slot seam;
registry seams (`command.register`, `tool.add`, `tool.remove`) are exactly
`Effect<void, never, Scope.Scope>`; read seams are infallible and
requirement-free; the slot seam mirrors the host placement contract
(`SlotPath = keyof SlotMap`, exactly one placement key); and a foreign
montflow `Context.Service` Tag in `R` fails to compile (`@ts-expect-error`).

Writing those assertions found **three real mirror drifts** that no existing
test could see, because `tuiEntry` is typed against the montflow mirror, not
the host `Definition`:

1. `VcsSnapshot.branch` was `string`; the host `VcsInfo.branch` is
   `{ current?, default? }`. Fixed to mirror the host.
2. `data.location.model.list()` was non-optional; the host
   `LocationCollection.list()` returns `undefined` until the location syncs.
   Fixed to `ReadonlyArray<ModelEntry> | undefined` (the port already handled
   it).
3. `SlotClaim` allowed any combination of placement keys; the host union
   requires exactly one. Rewritten as a mutually exclusive union, matching the
   host. `SlotPath` already equalled `keyof SlotMap`.

Deliberate, documented erasure: the slot seam's `render` output and per-slot
input types stay erased (`RenderOutput = object | null | undefined`) so
`@opentui/*`/`solid-js` types never enter the adapter's `ts:check`; the
contract test asserts the placement contract instead of the JSX return type.

### 4. Private distribution wired, boundary verified mechanically

- `verify:montflow:distribution` (`mf-compat-check distribution`) asserts, with
  no network:
  - every plugin package (`exports['./server']`) is `private: true`, has
    `repository.directory` equal to its directory, and every `exports`/`bin`
    target exists; `./package.json`, `./server`, `./tui`, `.` are all present;
  - every private workspace package is listed in `.changeset/config.json`
    `ignore`, and every ignore entry names a real package;
  - `privatePackages.version/tag` are `false`; `changeset:publish` filters no
    private package; `release.yml` still contains the private/ignored skip.
- It also **packs** every plugin (Bun build, `--target=node --format=esm`,
  externals `@opencode/*`, `effect`, `effect/*`, `@opentui/*`, `solid-js`,
  `solid-js/*`) into a temp published-shape artifact and audits it: no
  `workspace:` specifier, no `@montflow/*` dependency, every export target
  present, and every top-level emitted import is a Node builtin, the allowlist,
  or relative. Real tree: `distribution: 6 plugin packages packed, 0 problems`.
- `bun run pack:plugins` emits the same artifacts under `dist/pack/<name>/`
  for the Git subpath install; `INSTALL.md` documents the local-path form
  (primary) and the `git+…::path:dist/pack/<name>` form.
- `.changeset/config.json` ignore list refreshed for the current set: the
  six plugins, `@montflow/opencode`, `@montflow/workflows`, the retained
  `pi-effect`/`pi-interactive`/`pi-specs`, the tooling packages, plus
  `@montflow/linting` and `@montflow/stlx`; stale `pi-profiles`/`pi-prompts`/
  `pi-reviews`/`pi-skills` entries removed.

### 5. Gate evidence (verbatim)

Drift on an intentional `effect` divergence (`packages/workflows`, 4.0.0-rc.112
→ 4.0.3, restored from a `/tmp` copy):

```
$ bun run verify:montflow:compat
drift: packages/workflows effect — expected 4.0.0-rc.112, actual 4.0.3
drift: packages/workflows effect — expected 4.0.0-rc.112, actual 4.0.3
compat: host @opencode/plugin 2.0.18, effect 4.0.0-rc.112, opentui >=0.5.12,
solid-js >=1.9.0 — 19 packages, 689 resolved pins, 2 drift
error: script "cli" exited with code 1   (exit=1)
```

Missing `@effect/platform-node-shared` override (the C001 trap):

```
drift: . @effect/platform-node-shared — expected 4.0.0-rc.112, actual (missing)
compat: … 0 drift for everything else; 1 drift   (exit=1)
```

Lockfile simulating the `^` range resolving to 4.0.3:

```
drift: bun.lock @effect/platform-node-shared — expected 4.0.0-rc.112, actual 4.0.3
compat: … 1 drift   (exit=1)
```

Restored tree:

```
compat: host @opencode/plugin 2.0.18, effect 4.0.0-rc.112, opentui >=0.5.12,
solid-js >=1.9.0 — 19 packages, 689 resolved pins, 0 drift   (exit=0)
```

Scoped checks, touched packages:

```
packages/opencode:       tsc --noEmit clean; oxlint clean; oxfmt clean;
                         vitest 30 files / 146 tests passed, no type errors
tooling/compat-check:    tsc --noEmit clean; oxlint clean; oxfmt clean;
                         vitest 4 files / 38 tests passed, no type errors
bun run --cwd packages/opencode smoke:  12 pass, 0 fail, 58 expect() calls
```

Full gate:

```
$ bun run verify:montflow   → exit=0
turbo test: 17 successful / 17 total, 3050 tests passed
turbo smoke: 2 successful / 2 total, 12 pass / 0 fail
compat: … 0 drift
distribution: 6 plugin packages packed, 0 problems
skills 45 · 0 issues · prompts 4 · 0 issues · specs 4 · 0 failed · 0 issues
profiles 11 · 0 issues · reviews 17 files · 0 issues
```

## Open Questions

1. **Runtime `@opencode/schema` imports (B006 §6 strictness).** The adapter
   imports `@opencode/schema/{agent,model,tool}` as values (`AgentSchema`,
   `Tool`), which the plugin artifacts keep external under `@opencode/*`. B006
   says those packages are host singletons **not** in the redirect map and may
   be imported `import type`-only; a Git-installed artifact would otherwise
   resolve its own copy. The distribution audit treats `@opencode/*` as a
   host-provided external, so it does not fail on this. Fixing it means
   removing runtime schema constructors from the adapter (or routing them
   through a redirected specifier) — out of C007's scope, worth a C099 finding.
2. **Git-ref artifact commit.** `dist` is git-ignored, so a Git subpath install
   needs `git add -f dist/pack/**` on a release ref (documented). Nothing in CI
   produces or publishes that ref; the boundary check proves the artifact shape,
   not the ref.
3. **`bun.lock` is the resolved-version source of truth.** The drift check reads
   its text, not `node_modules`, so it keeps working in a bare worktree before
   install; a stale lockfile would be reported as drift (intended).
4. **`verify:montflow:specs` still runs `packages/pi-specs`, not
   `packages/specs`.** Pre-existing (B006 §7 asked for the repoint); C007 did not
   own it and both check the same 4 specs today. Orchestrator should decide.

## Handoff

- C007 deliverables: `tooling/compat-check/**` (new), `packages/opencode/src/
  modules/ports/tests/seams.test.ts` (new), the three mirror fixes, root
  `package.json`, `turbo.json`, `.github/workflows/verify.yml`,
  `.changeset/config.json`, `oxlint.config.ts` (scoped override for the CLI),
  `AGENTS.md`, `INSTALL.md`, `bun.lock`.
- Commits: `53a2d03 test(opencode): assert the port seams against the host
  types`, `3433cd9 feat(tooling): check dependency drift and private
  distribution`, `7e7da57 build(verify): absorb the loader smoke and the compat
  checks`. Nothing under `.agents/@montflow/specs/**` was committed.
- C099 should verify: the two open questions above, and that the mirror fixes
  have no consumer relying on the old `VcsSnapshot.branch: string` shape (none
  found: `DataPort.vcs` has no workspace consumer).

## Deviations

- Profile step 5 (BOARD broadcast / MAILBOX) was not performed: the task
  instructed "write only your own MEMORY.md".
- Added a path-scoped `oxlint.config.ts` override turning
  `montflow/no-node-platform-imports` off for `tooling/compat-check/**`. The
  package's whole job is reading the repository and generating artifacts; the
  rule sanctions suppression at a composition root.
- The distribution audit allowlists `@opencode/*` (including `@opencode/schema`)
  as host-provided; see Open Question 1 for why that is a known gap, not a
  weakening of the checked invariant (no `workspace:` / `@montflow/*` leaks).
