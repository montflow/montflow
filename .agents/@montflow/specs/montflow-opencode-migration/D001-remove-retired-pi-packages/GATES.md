## Stage 0: Move

- [x] `Changes` resolves from `@montflow/opencode` in profiles and the workspace (`packages/profiles/src/services/profile-store/profile-store.services.module.ts:1`, `apps/workspace/src/services/profiles/profiles.services.module.ts:5`)
- [x] the prompts interaction module owns the dialog ports and model-picker helpers (`packages/prompts/src/modules/interaction/`)
- [x] the workspace specs service loads `@montflow/specs` (`loadSpecs`, `SpecsLib`)

## Stage 1: Delete

- [x] `packages/pi-effect`, `packages/pi-interactive`, `packages/pi-specs`, and `.pi/` are gone (`ls packages`; `git ls-files .pi` is empty)
- [x] no root devDependency or Changesets ignore entry names a `pi-*` package (`package.json`, `.changeset/config.json`)
- [x] `bun.lock` holds no `@montflow/pi-*` resolution (`grep -c 'pi-effect\|pi-interactive\|pi-specs' bun.lock` → 0)

## Stage 2: Gate

- [x] the three deleted packages have no live reference: `grep -rn '@montflow/pi-effect\|@montflow/pi-interactive\|@montflow/pi-specs\|packages/pi-effect\|packages/pi-interactive\|packages/pi-specs'` over `.ts/.tsx/.json/.md/.yml` (excluding `node_modules`, `dist`, `build`, `.turbo`, `.agents/@montflow/specs/**`, `.agents/@montflow/reviews/**`) returns nothing. The retained `.agents/@montflow/pi-prompts` store path and the installed `montflow-*-pi-*` skill names are public surface, not package references
- [x] the surviving packages' old names are not left behind as live package references: `grep -rn 'pi-skills\|pi-prompts' packages .agents/@montflow/profiles apps` returns only retained surface — the `.agents/@montflow/pi-prompts` store path, installed `montflow-*-pi-*` skill names, and one test temp-dir prefix (see D001 MEMORY §5)
- [x] `bun run mf:gate` reports zero issues — 13/13 turbo test tasks, TUI suite, loader smoke, 46 skills, 4 prompts, 5 specs, 11 profiles, 33 reviews, 0 issues
