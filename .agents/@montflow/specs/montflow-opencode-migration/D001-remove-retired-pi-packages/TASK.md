---
id: D001
name: remove-retired-pi-packages
type: execution
originator: user
depends-on: C007
related-tasks:
status: complete
---

# Task D001: remove-retired-pi-packages

## Type: execution

## Description

Phase C ported every consumer onto OpenCode but left three Pi-era packages
installed: `@montflow/pi-effect`, `@montflow/pi-interactive`, and
`@montflow/pi-specs`. Their remaining consumers were already ports in all but
name — `pi-effect` only supplied the host-free `Changes` store contract,
`pi-interactive` only supplied dialog/model-picker helpers, and `pi-specs` was a
second copy of the spec engine the workspace still loaded. Remove all three and
point their consumers at the OpenCode-migration packages, so no live
`@montflow/pi-*` package remains.

## Requirements

- Move the `Changes` store contract (and its tests) out of `pi-effect` into
  `@montflow/opencode`; `@montflow/profiles` and `@montflow/workspace` import it
  from there.
- Move the dialog ports and model-picker helpers out of `pi-interactive` into
  `@montflow/prompts`' `interaction` module; drop the Pi `ExtensionUIContext`
  type it carried and the unused `FilterUi` / `MenuFn` aliases.
- Point the workspace specs service at `@montflow/specs` and rename
  `loadPiSpecs` → `loadSpecs`.
- Delete `packages/pi-effect`, `packages/pi-interactive`, `packages/pi-specs`,
  `.pi/`, the root `@montflow/pi-specs` devDependency, and the three Changesets
  ignore entries.
- Update every live doc, `CONTEXT.md`, skill, and spec reference that named a
  deleted package or a Pi-only slash command; historical spec/task memory stays
  untouched.
- `bun run mf:gate` green end to end.

## Completion

- [x] `Changes` moved to `@montflow/opencode` (`src/modules/changes/`), imported by `@montflow/profiles` and the workspace.
- [x] Dialog ports and model-picker helpers moved to `@montflow/prompts/src/modules/interaction/`; the Pi UI type and the dead `FilterUi`/`MenuFn` aliases are gone.
- [x] Workspace specs service loads `@montflow/specs` via `loadSpecs`.
- [x] The three packages, `.pi/`, the root devDependency, and the Changesets ignores are deleted; `bun install` regenerated the lockfile.
- [x] Docs, `CONTEXT.md` files, the utility-CLI standard, and both spec skills name the OpenCode packages and `/specs`.
- [x] `bun run mf:gate` green (turbo lint/format/ts:check, turbo test 13/13, TUI suite, loader smoke, 46 skills / 4 prompts / 5 specs / 11 profiles / 33 reviews, 0 issues).
