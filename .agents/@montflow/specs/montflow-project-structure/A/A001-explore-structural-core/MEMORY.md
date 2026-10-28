# Memory

## Context

Task A001: inventory the structural-core TypeScript skills
(`typescript-conventions`, `typescript-file-structure`, `typescript-modules`,
`setup-typescript-package`).

## Progress

- 2026-10-06: complete.

## Findings

### Per-skill summary

| Skill | Purpose | When-to-use | Hard rules | Defaults | Pipeline | Artifacts | Gates |
|---|---|---|---|---|---|---|---|
| `typescript-conventions` | Index + quick-reference map of TS skills | Any TS task; picking which TS skill applies | Load `executing-skills` first (frontmatter `dependencies`; prerequisite note) | Category → skill routing only | 1 Identify category → 2 Browse index → 3 Load & execute | none (index) | none (no GATES.md) |
| `typescript-file-structure` | Verify/scaffold source-tree structure — test colocation, `.test.ts` naming, `index.ts` chain | Creating/auditing folders & files; fixing stray tests/missing indexes | Core Rules 1–3; Conventions bullets; GATES Phases 1–3 | Pipeline is prescriptive but resolves ambiguities via `typescript-modules` | 1 Map tree → 2 Verify test colocation → 3 Verify index chain → 4 Verify imports resolve | `index.ts` per folder (except `src/`), moved test files | GATES.md Phase 1 (colocation+naming), Phase 2 (index chain), Phase 3 (integrity) |
| `typescript-modules` | Create tree-shakable modules with namespace exports in group folders | Scaffold new module; organize code into tree-shakable modules | Core Rules 1–3; GATES Phases 1,3,4 | No-Echo Rule (strong suggestion); some Conventions style points | 1 Pick group+name → 2 Create dir (+`tests/`,`CONTEXT.md`) → 3 Create module file → 4 Create index → 5 Use | `src/[group]/[module]/`, `[module].[group].module.ts`, `index.ts`, `CONTEXT.md`, `tests/[util].test.ts` | GATES.md Phase 1 (group/file), Phase 2 (naming), Phase 3 (exports), Phase 4 (quality) |
| `setup-typescript-package` | Scaffold monorepo packages (`packages/`) and services (`services/`) with tooling | New package/service; init library/service | Context table + GATES Phases 1–4; `CHECKLIST.md` marked MUST READ (file absent) | Platform default `neutral`; script extras | 1 Gather inputs → 2 Detect context → 3 Common files → 4 Configure package → 5 Configure service → 6 Verify | dir + `src/index.ts` + `package.json` + `tsconfig.json`; packages add `tsconfig.build.json`,`tsdown.config.ts`,`build/` | GATES.md Phase 1 (common), Phase 2 (package), Phase 3 (service), Phase 4 (verify) |

### Structural rules

- Everything exported lives inside a module (`[module].module.ts` re-exported via `index.ts`); no loose top-level exports — **hard** — `typescript-modules`/Core Rules §1
- Every module lives inside a group folder (`modules/`, `utils/`, `services/`, `layers/`) — never loose — **hard** — `typescript-modules`/Core Rules §2, GATES Phase 1
- One canonical module structure: `[group]/[module]/` with `index.ts`, `[module].[group].module.ts`, `CONTEXT.md`, `tests/` — **hard** — `typescript-modules`/Directory Structure, GATES Phase 1
- Group infix: `[module].[group].module.ts` for all groups except `modules`, which uses `[module].module.ts` — **hard** — `typescript-modules`/Directory Structure Exception, GATES Phase 2
- Test files live in `tests/` inside the module they test (imports resolve to `../index.ts`); never top-level `test/` or `__tests__/` — **hard** — `typescript-file-structure`/Core Rule 1, Pipeline §2, GATES Phase 1
- Test file names end in `.test.ts` and reflect the unit under test (`[module-util-name].test.ts`), one file per unit of behavior — **hard** — `typescript-file-structure`/Core Rule 1, GATES Phase 1; `typescript-modules`/Test Naming
- Every folder under `src/` has an `index.ts` except `src/` itself — **hard** — `typescript-file-structure`/Core Rule 2, Target Shape, GATES Phase 2
- Group/aggregating folder `index.ts` re-exports each subfolder via `export * from "./[subfolder]/index.ts"` — **hard** — `typescript-file-structure`/Core Rule 2, GATES Phase 2
- Module `index.ts` stays namespace-style: `export * as PascalName from "./[module].[group].module.ts"` — **hard** — `typescript-modules`/Pipeline §4, GATES Phase 3; `typescript-file-structure`/Core Rule 3, GATES Phase 2
- Re-export/import paths include the full `.ts` extension — **hard** — `typescript-file-structure`/Conventions, GATES Phase 3; `typescript-modules`/Conventions
- No default exports anywhere in the chain; named exports only — **hard** — `typescript-file-structure`/Conventions, GATES Phase 2; `typescript-modules`/GATES Phase 3
- Tests never imported by production code; `tests/` excluded from package entry points — **hard** — `typescript-file-structure`/Conventions
- Folder names `kebab-case`; group folders plural (`utils`, `services`, `layers`, `modules`); module names singular — **hard** — `typescript-file-structure`/Conventions; `typescript-modules`/Core Rules §3, Pipeline §1, GATES Phase 2
- Export aliases `PascalCase`, matching the PascalCase of the directory name — **hard** — `typescript-modules`/GATES Phase 2
- Package vs service target dirs: `packages/<name>/` vs `services/<name>/` — **hard** — `setup-typescript-package`/Pipeline §2, GATES Phases 1–3
- Common scaffolding files: `src/index.ts`, `package.json`, `tsconfig.json` (+ shared devDeps/scripts) — **hard** — `setup-typescript-package`/Pipeline §3, GATES Phase 1
- Package adds build tooling (`typescript`,`tsdown`), `tsconfig.build.json`, `tsdown.config.ts`, entry fields (`files`,`main`,`types`,`exports`), peerDeps, platform exports — **hard** — `setup-typescript-package`/Pipeline §4, GATES Phase 2
- Service adds no build tooling; runtime deps in `dependencies`; `outDir` set; no `files`/`main`/`types`/`exports` — **hard** — `setup-typescript-package`/Pipeline §5, GATES Phase 3

### Structure vs incidental

- Test *location* + `.test.ts` naming → STRUCTURE; test *content* (suite naming, runtime) is delegated to `effect-testing` (incidental here).
- `CONTEXT.md` *existence at module root* → STRUCTURE; its brief prose *content* is documentation (incidental).
- `no default exports` / namespace-only exports → STRUCTURE (they define the re-export chain shape), not merely style.
- `No-Echo Rule` (function names don't repeat module name) → incidental API-naming default, not tree structure.
- `arrow-function consts`, explicit return types, branded params, no module-level side effects, prefer functions over static classes → code style/quality (incidental; GATES Phase 4 not structure).
- `No TypeScript namespace keyword`, ES-module namespace imports vs wildcard → language/style (incidental).
- concise function verbs (`make`, `parse`, …) → naming style (incidental).
- Tooling deps (`oxfmt`,`oxlint`,`rimraf`,`tslib`) and `tsconfig` field values → package scaffolding mechanics: STRUCTURE at the package level, incidental to source-tree structure.
- `platform: neutral` default and extra externals/scripts → incidental config knobs.
- `export {}` in `src/index.ts` → packaging placeholder; borderline (see conflicts: `src/` exemption).

### Cross-references

- `typescript-conventions` → `typescript-modules`, `typescript-file-structure`, `setup-typescript-package` — frontmatter `dependencies` + Reference §"Modules & Packages".
- `typescript-conventions` → `executing-skills` — When To Use prerequisite note + `dependencies`.
- `typescript-conventions` → `effect-services`, `effect-structs`, `effect-testing`, `detecting-duplication`, `favoring-composition`, `leaving-it-cleaner`, `applying-solid`, `simplifying-code`, `typescript-prefer-inference`, `writting-jsdoc`, `effect-v4` — frontmatter `dependencies`.
- `typescript-file-structure` → `typescript-modules` — When To Use ("module internals governed by"), Core Rule 3, Target Shape, `dependencies`.
- `typescript-file-structure` → `effect-testing` — When To Use ("test content by"), `dependencies`.
- `typescript-file-structure` → `executing-skills` — prerequisite note + `dependencies`.
- `typescript-modules` → `effect-testing` — Test Naming ("Test style … from effect-testing"), `dependencies`.
- `typescript-modules` → `executing-skills` — prerequisite note + `dependencies`.
- `setup-typescript-package` → `executing-skills` — prerequisite note + `dependencies`.
- `setup-typescript-package` → `CHECKLIST.md` — Reference ("See CHECKLIST.md (MUST READ)") — **file does not exist** (only SKILL/GATES/CHANGELOG in dir).

## Open Questions

- CONFLICT `src/` index: `setup-typescript-package`/GATES Phase 1 requires `src/index.ts` (`export {}`) for every package/service, but `typescript-file-structure`/Target Shape marks `src/index.ts` "❌ none — src/ is exempt" and GATES Phase 2 excludes `src/` itself. Which governs a package entry point?
- `typescript-modules`/Pipeline §5 example imports `from "path/to/index.js"` (`.js`) while Conventions and `typescript-file-structure` require the full `.ts` extension. Is the `.js` a stale example?
- `setup-typescript-package`/Reference points to a non-existent `CHECKLIST.md` (MUST READ); is the checklist missing or intentionally removed?
- Package source (`setup-typescript-package` creates bare `src/index.ts`) vs `typescript-modules` "everything lives inside a module / no loose top-level exports" — do packages also require group folders and module indexes?

## Handoff

- Feeds A005 synthesis.

## Deviations

- None.
