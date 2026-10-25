# Memory

## Context

C007 closed phase C with three Pi-era packages still installed because each had
one live consumer that phase C had not moved:

- `@montflow/pi-effect` — only its host-free `Changes` store contract was used
  (`@montflow/profiles`, and a type-only import in the workspace).
- `@montflow/pi-interactive` — only the dialog ports and model-picker helpers
  were used (`@montflow/prompts`' interactive app re-exported them).
- `@montflow/pi-specs` — the workspace lazily imported it for spec parse/verify
  and series naming, duplicating `@montflow/specs`.

The user asked for the leftovers to be removed rather than carried.

## Progress

- 2026-10-25: complete. Gate green; no live `@montflow/pi-*` package remains.

## Findings

### 1. `Changes` belongs next to the adapter, not in `@montflow/core`

B001 §"host-free bits move to core" assumed `@montflow/core` was consumable from
source. It is not: it is a published package whose `exports` point at `build/`
(absent in a checkout), so importing it from `@montflow/profiles` would need a
build first and would break single-package test runs. The module therefore
landed in `@montflow/opencode`, which every plugin already depends on and which
resolves from source. Deviation recorded here; `core` is untouched.

### 2. The prompts interaction surface was Pi-shaped in two places

`Dialogs.FilterUi` extended `ExtensionUIContext['custom']` and `MenuFn` was
unused. Both were dropped, so `packages/prompts` now has zero `@earendil` import
of any kind, runtime or type.

### 3. `pi-specs` was a silent second spec engine

`apps/workspace/src/services/specs` imported `Task`, `Spec`, `Structure`,
`Lifecycle`, and `ReviewLink` from `@montflow/pi-specs`. `@montflow/specs`
exports the same five namespaces with the same signatures (it was the fork), so
the swap is mechanical: `loadPiSpecs` → `loadSpecs`, `PiSpecsLib` → `SpecsLib`.

### 4. Stale references outlived the packages

Live files that named a deleted package or a Pi-only command, now fixed:

- `packages/{profiles,prompts,skills}/**/CONTEXT.md` — `@montflow/pi-effect` /
  `@montflow/pi-interactive` → `@montflow/opencode` ports.
- `apps/workspace/src/services/specs/CONTEXT.md` — `@montflow/pi-specs` →
  `@montflow/specs`, `loadPiSpecs` → `loadSpecs`.
- `packages/specs/src/apps/cli/CONTEXT.md`, `packages/specs/README.md`,
  `packages/specs/src/{modules,skills}/**` — `packages/pi-specs` paths, the
  "pi-specs contract" wording, and the Pi `extension.ts` slash surface.
- `packages/specs/skills/montflow-{find,create}-pi-specs` — `/mf-specs` slash
  form → `/specs` (the binary stays `mf-specs`); versions bumped to 1.3.0 and
  2.3.0 with changelog entries, mirrors refreshed with `mf-specs doctor`.
- `.agents/documentation/author-mf-utility-cli.md` — package table and the
  `packages/pi-<domain>` convention.

### 5. What deliberately still says "pi"

- Installed skill names `montflow-*-pi-*` (and the store paths
  `.agents/@montflow/pi-prompts`, `pi-prompts` JSON) are public surface: the
  README, profiles, prompts, and doctor constants all address them. Renaming
  them is a separate, breaking change with its own install/mirror migration.
- `.agents/@montflow/specs/montflow-opencode-migration/**` and
  `.agents/@montflow/reviews/**` are historical records of what was true then,
  and are left as written.

## Open Questions

- None.

## Handoff

- Phase D is additive to the spec's requirements: "no live `@montflow/pi-*`
  package remains". Historical phases A–C keep their original text.

## Deviations

- None.
