# Memory

## Context

Executes C001: stand up `@montflow/opencode` (the OpenCode v2 adapter seams), add the
pilot plugin `@montflow/specs` ported from `pi-specs`, align the workspace `effect` pin
to the host line `4.0.0-rc.112`, and prove the real `@opencode/plugin@2.0.18` loader
(`Host.resolve` + `Host.load`) end to end. Inputs: B001 §2/§3, B002 §1/§5 (seam shapes,
plain factories, `R = Scope.Scope`), B005 §2, B006 §8 (pin set). Additive phase: `pi-*`
stays installed.

## Progress

- complete — adapter seams, specs pilot, pin alignment, loader smoke, and the full
  `verify:montflow` gate all green.

## Findings

### What landed

- `@montflow/opencode` (`packages/opencode`): the sole importer of `@opencode/*`.
  - `PluginEntry`: `MontflowPlugin<R = Scope.Scope> = Plugin.Plugin<R>`, `PluginContext =
    Plugin.Context`, `entry(id, program)` building a host plugin whose program receives
    `makePorts(ctx)`.
  - `CommandPort`: `register(definition)` → `Effect<void, never, Scope.Scope>` (honest:
    the host `transform` needs `Scope.Scope`); `list()` → `Effect<readonly Command.Info[]>`
    per B002 §2, mapping the host `{ location, data }` envelope to `data`.
  - `InteractionPort`: `select/confirm/prompt/alert/notify/attention` over a structural
    mirror of the TUI `ctx.ui`/`ctx.attention` slice (no `@opentui/*`/`solid-js` types
    leak into `ts:check`).
  - `makePorts(ctx)` = `{ command, interaction }`; a port built over the wrong half fails
    only at call time (`Effect.die`).
- `@montflow/specs` (`packages/specs`): copy of `pi-specs` with exports `.`, `./server`
  (`default { id: 'specs', effect }`), `./tui` (`default { id: 'specs', setup }`), and the
  `mf-specs` bin. `server.ts` registers `/specs`; `execute` runs `runSlash` against a
  `Live` `SpecStore` layer.
- Loader smoke in `packages/opencode/test/plugin-loader.test.ts` (bun:test): asserts
  `Host.resolve` picks `./server`/`./tui` (never executes code), `Host.load` yields
  `{ id, effect }` / `{ id, setup }`, and the `/specs` command registers through the host
  command transform.

### Pin alignment fallout (the material discovery)

Aligning the whole workspace to `4.0.0-rc.112` (root `overrides.effect` + every package
dep/peer + `@effect/vitest` + `@effect/platform-node`) exposed two breaks that B006 §8's
pin list did not name:

1. **`@effect/platform-node-shared` must be pinned too.** `@effect/platform-node@4.0.0-rc.112`
   declares `"@effect/platform-node-shared": "^4.0.0-rc.112"`, which semver-resolves to
   `4.0.3` (higher than the pre-release). That `4.0.3` copy imports `effect/cluster/Runners`,
   removed in rc.112, so the server entry failed to load at runtime (`Cannot find module
   'effect/cluster/Runners'`). Fixed with a second root override
   `"@effect/platform-node-shared": "4.0.0-rc.112"`. After this, every workspace package
   resolves a single `effect@4.0.0-rc.112` and no `effect@4.0.3` remains in `bun.lock`.
2. **`effect/cli` moved to `effect/unstable/cli`.** rc.112 has no `effect/cli/*` subpaths;
   the module is `effect/unstable/cli` (barrel only). Primitive names also lowercased:
   `Flag.String|Boolean|Int` → `Flag.string|boolean|integer`, `Argument.String` →
   `Argument.string`. Six packages import the old paths (`pi-profiles`, `pi-prompts`,
   `pi-reviews`, `pi-skills`, `pi-specs`, and the new `packages/specs`); without migrating
   them the pin change alone turns the gate red. Migrated mechanically (imports + renames);
   `Command.make`/`run`/`withDescription`/`withSubcommands`/`provide` and
   `Flag.withDescription|optional|withDefault` are unchanged.

### Adapter decisions worth recording

- `CommandPort.list` returns bare `readonly Command.Info[]` (B002 §2), so `CommandContext`
  narrows the host `list` to `() => Effect<{ data: ReadonlyArray<Command.Info> }, unknown>`
  — still assignable from the host `CommandDomain`, yet fake-able without constructing a
  branded `Location.PublicRef`.
- The ports are plain factories, not Effect services (B002 §6). The local rule
  `anti-slop-effect/no-service-constructor-imports` flags any project-local `make*` import,
  so `ports.module.ts` and `plugin-entry.module.ts` carry scoped
  `oxlint-disable-next-line` comments with the B002 §6 justification.
- `TuiPluginContext` is an opaque `Record<string, never>` for now; no TUI port reads the
  host TUI context yet (C005 widens it).

## Open Questions

- **Pin-set completeness (feeds C007/B006 §8).** The listed pin set omits
  `@effect/platform-node-shared`; it is required for the runtime to load at all. C007's
  drift check should pin and assert it. B006 §8 should be amended.
- **CLI migration ownership.** The `effect/cli` → `effect/unstable/cli` migration touches
  five `pi-*` packages, which is nominally C002's "library+`bin` split" territory. Done
  here only because the mandated pin change otherwise reddens the gate; C002 may supersede
  these files when it splits library from bin.
- **`@effect/vitest`.** The host declares none; montflow pins `4.0.0-rc.112` (validated, all
  suites pass). This remains a montflow pin, not a host match.

## Handoff

- C001 deliverable is complete and independently verified. Files: `packages/opencode/**`,
  `packages/specs/**`, root `package.json` (overrides), `bun.lock`, every
  `packages/*/package.json` + `apps/workspace/package.json` (effect pins), and the six
  migrated CLI modules.
- Gate evidence: `bun run verify:montflow` → 18/18 turbo tasks + all six extension verifies
  green; `bun run --cwd packages/opencode test` → 22 tests / no type errors;
  `bun run --cwd packages/opencode smoke` → 4 pass; `bun run --cwd packages/specs test` →
  326 tests.
- The loader smoke is a package script (`smoke`), intentionally not wired into `turbo`
  yet — C007 owns the `smoke` turbo task and `verify:montflow` absorption (B006 §3).

## Deviations

- Loader smoke lives at `packages/opencode/test/plugin-loader.test.ts` rather than in
  `@montflow/specs` (B006 §3's per-plugin location), to keep `@opencode/*` imports inside
  the sole-importer adapter; it resolves `@montflow/specs` by directory, adding no package
  dependency or build cycle.
- Added the `@effect/platform-node-shared` root override beyond the listed pin set (see
  Findings); required for correctness.
- Migrated the five `pi-*` CLIs to `effect/unstable/cli` (see Findings); required to keep
  the gate green under the mandated pin.
