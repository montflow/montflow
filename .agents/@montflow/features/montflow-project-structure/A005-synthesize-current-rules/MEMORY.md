# Memory

## Context

Task A005: synthesize A001–A004 into the current rule picture and a candidate
shape for the unified entry point. Inputs: four completed inventories
(structural core, Effect scaffolding, code principles, docs/conventions).
Abbreviations: `TC`=typescript-conventions, `TFS`=typescript-file-structure,
`TM`=typescript-modules, `STP`=setup-typescript-package,
`ESrv`=effect-services, `EStr`=effect-structs, `ETest`=effect-testing,
`EV4`=effect-v4, `PREF`=typescript-prefer-inference,
`RES`=typescript-result-over-throws, `JS`=writting-jsdoc,
`MIM`=mimicking-conventions. H=hard, D=default.

## Progress

- 2026-10-06: complete.

## Findings

### Rule matrix

Structural rules only (behavioral/API/incidental rules from A002 "Structure vs
Effect API", A003 "Structural consequences", and A004 "Docs vs structural" are
folded in where they change tree/surface shape).

> **H/D caveat (review F10):** hard/default labels are explicit in the sources
> only for `RES` and `PREF`. Labels on P8–P16 are inferred from phrasing and
> must be confirmed in Phase B.

**Structural core (A001)**

| # | Rule | Source(s) | H/D | Restated by |
| --- | --- | --- | --- | --- |
| S1 | All exports live inside a module; no loose top-level exports | TM | H | ESrv, EStr (module-per-concern) |
| S2 | Every module lives in a group folder (`modules`,`utils`,`services`,`layers`) — never loose | TM | H | ESrv (`services/`), EStr (`structs/`, not in core list) |
| S3 | Canonical module dir: `[group]/[module]/` + `index.ts` + `[module].[group].module.ts` + `CONTEXT.md` + `tests/` | TM | H | ESrv, EStr, ETest (layout) |
| S4 | Group infix `[module].[group].module.ts`; `modules/` drops infix (`[module].module.ts`) | TM | H | ESrv (`*.services.module.ts`), EStr (`*.structs.module.ts`) |
| S5 | Tests live in the tested module's own `tests/`; never top-level `test/`/`__tests__/` | TFS | H | ETest, ESrv, EStr |
| S6 | Test file names `[unit].test.ts`, one per unit of behavior | TFS (suffix), TM/ETest (naming + one-per-unit) | H | ETest |
| S7 | Every folder under `src/` has `index.ts` except `src/` itself | TFS | H | TM (module index) — see C1 |
| S8 | Group/aggregating `index.ts` re-exports each subfolder `export * from "./[sub]/index.ts"` | TFS | H | ESrv, EStr (parent registration) |
| S9 | Module `index.ts` namespace-style `export * as Pascal from "./[file].ts"` | TM, TFS | H | ESrv, EStr |
| S10 | Relative import/export paths carry full `.ts` extension | TFS, TM | H | ESrv, EStr, ETest — see C3 |
| S11 | No default exports; named exports only | TFS, TM | H | — |
| S12 | Tests never imported by prod code; `tests/` excluded from entry points | TFS | H | ETest (import via public API) |
| S13 | Folder kebab-case; groups plural; module names singular | TFS, TM | H | ESrv, EStr |
| S14 | Export aliases PascalCase matching dir name | TM | H | ESrv, EStr |
| S15 | Package vs service targets: `packages/<name>/` vs `services/<name>/` | STP | H | — |
| S16 | Common scaffold: `src/index.ts`, `package.json`, `tsconfig.json` (+shared devDeps/scripts) | STP | H | — see C1 |
| S17 | Package adds build tooling (`tsdown`, `tsconfig.build.json`, `tsdown.config.ts`, `files`/`main`/`types`/`exports`, peerDeps, platform exports) | STP | H | — |
| S18 | Service adds no build tooling; runtime deps in `dependencies`; `outDir`; no `files`/`main`/`types`/`exports` | STP | H | — |

**Effect scaffolding (A002)**

| # | Rule | Source(s) | H/D | Restated by |
| --- | --- | --- | --- | --- |
| E1 | Service dir `src/services/[service-name]/`; file `[name].services.module.ts` | ESrv | H | S2/S4 |
| E2 | Service `index.ts` namespace export (`export * as Pascal from "./[name].services.module.ts"`) | ESrv | H | S9 |
| E3 | Service module exports `Id` const+type (value `@scope/PascalName`, segment after `/` matches the class name), `Impl`, `ServiceName` (empty class), `Default` layer (omit if only custom layers) | ESrv (GATES.md:19,35-36) | H | — |
| E4 | Service parent `src/services/index.ts` re-exports each child `export * from "./[name]/index.ts"` | ESrv | H | S8 |
| E5 | Struct dir `src/structs/[struct-name]/`; file `[name].structs.module.ts`; kebab singular, file matches dir | EStr | H | S2/S4 (group not in core list — C5) |
| E6 | Struct exports per pattern: `Id` (value matches the struct name, EStr GATES.md:25), brand type, `makeUnsafe`, `make`; string brands `REGEX`+`check`; number brands `check`+`fromNumber`/`toNumber`; composed `Brand.all`, no `check` | EStr | H | — |
| E7 | Struct `Blueprint` optional, omitted when unused | EStr | D | — |
| E8 | Struct parent `src/structs/index.ts` re-exports children | EStr | H | S8 |
| E9 | `CONTEXT.md` + `tests/` in service and struct modules | ESrv, EStr | H | S3/D1 |
| E10 | Tests in `src/[group]/[module]/tests/`; import module via public API `import * as X from "../index.ts"` (no deep imports) | ETest | H | S5/S12 |
| E11 | One test file per utility `[utility-name].test.ts` | ETest | H | S6 |
| E12 | Max two suites per file, ordered `types` (optional) then `runtime`; names `"Module.utility runtime"` | ETest | H | — |
| E13 | Author separation: test author ≠ implementer unless user confirms | ETest | H | — |
| E14 | Package `test` script `vitest run --typecheck`; `vitest.config.ts` `typecheck.enabled` + include | ETest | H | — |
| E15 | `@effect/vitest` + `vitest` devDeps; `@effect/vitest` version exactly matches `effect` | ETest | H | — |
| E16 | No TypeScript `namespace` keyword | ESrv, TM | H | — |
| E17 | Namespace-style imports where conventional | ESrv | D | — |
| E18 | EV4 module-surface style: file-local role names + self-export `export * as UserRepo from "./user-repo.js"` | EV4 | D | — (note `.js` in example — C3) |
| E19 | EV4 test layout `Interface`/`Service`/`layer`/`testLayer`, `TestInterface`/`TestService`; one object backs real+test tags | EV4 | D | ETest/TESTING.md only |
| E20 | Layer constructors: `Layer.effect` real; `Layer.effectContext` multi-service/test stubs; `Layer.succeed`/`sync` alternatives | EV4 | D | ESrv (`Layer.effect`) |
| E21 | Long-lived work forked into layer scope (`Effect.forkScoped`) | EV4 | D | — |

**Code principles (A003) — structural consequences only**

| # | Rule | Source(s) | H/D | Restated by |
| --- | --- | --- | --- | --- |
| P1 | Fallible fns return typed `Result` from `@montflow/core`; `try` prefix | RES | H | — |
| P2 | One error class per failure case; literal `code = "..." as const`; noun-form; no `Error` subclass | RES | H | — |
| P3 | `@montflow/core` in `package.json` | RES | H | — |
| P4 | Consumers branch via `Result.isErr`/`isOk` + exhaustive `switch(error.code)` | RES | H | — |
| P5 | Effect-based modules excluded from `Result` contract | RES | H | — |
| P6 | No `: Type` on var decls obvious from initializer; infer | PREF | H | — |
| P7 | `satisfies` over annotation/cast; `as` needs justification; public API return annotations allowed | PREF | D (exception) | — |
| P8 | SRP: one reason to change → split units; 5+ concerns triggers split | applying-solid, simplifying-code | D | cross-skill |
| P9 | DIP: inject abstractions via ctor/params | applying-solid | D | — |
| P10 | ISP: role-specific interfaces, not monolithic | applying-solid | D | — |
| P11 | OCP: polymorphism over type-`switch` | applying-solid | D | tension with P4 — see C9 |
| P12 | Composition over deep inheritance (has-a, delegate) | favoring-composition | D | — |
| P13 | Extract true duplication only; stop when it couples unrelated domains | detecting-duplication | D | — |
| P14 | Prefer flat functions over class hierarchies | simplifying-code, TM style | D | cross-skill |
| P15 | Remove dead code / orphaned exports | leaving-it-cleaner | D | — |
| P16 | Cleanup ≤30s per item else `TODO`; no full-file formatter sweep | leaving-it-cleaner | D (review F10: a "no more than 30 seconds" guideline is arguably a default, not a gate) | — |

**Docs/conventions (A004)**

| # | Rule | Source(s) | H/D | Restated by |
| --- | --- | --- | --- | --- |
| D1 | `CONTEXT.md` exists at every leaf module root | TM | H | ESrv, EStr, ETest (STP never mentions `CONTEXT.md` — review F6) |
| D2 | `CONTEXT.md` placement/shape in target tree | TFS, TM | H | — |
| D3 | `CONTEXT.md` content shape (`# Title` → intro → `## Belongs here` → `## Does not belong here`) | observed practice | none | **not codified** — see G7 |
| D4 | JSDoc: no type info (no `{Type}`, no error/return types) | JS | H | — |
| D5 | JSDoc: `@description` first | JS | H | — see C7 |
| D6 | JSDoc: concise, one short sentence | JS | H | — |
| D7 | JSDoc: fixed annotation order | JS | H | — |
| D8 | JSDoc: `-` after `@param`/`@property` names | JS | H | — |
| D9 | JSDoc only written on explicit user request (no lint/gate) | JS | D | — |
| D10 | Mimic neighbors/analogous modules before writing; read before write | MIM | H | — (orphan from index — C8) |
| D11 | Group folders carry no `CONTEXT.md` (only leaf modules) | observed practice | D | — |

### Overlap list

Duplicated rules — the unified entry point must cite one owner, not restate.

| Overlap | Skill statements | Canonical owner (candidate) |
| --- | --- | --- |
| Module dir + file layout + `index.ts` + `CONTEXT.md` + `tests/` | TM S3; restated by ESrv E1–E4/E9, EStr E5/E8/E9 | TM |
| Group infix naming (`[module].[group].module.ts`; `modules` exception) | TM S4; ESrv (`services`), EStr (`structs`) | TM |
| Namespace re-export of module surface | TM S9 + TFS S9; ESrv E2, EStr | TM |
| Full `.ts` extension on imports | TFS S10 + TM S10; ESrv, EStr, ETest | TFS (import rule). EV4 does NOT restate this — its examples use `.js` (conflict C3, review F8a). |
| Test location in module `tests/` | TFS S5; ETest E10, ESrv, EStr | TFS (location); ETest owns content |
| Test file naming `[unit].test.ts` | TFS (suffix) S6 + TM (naming/one-per-unit); ETest E11 | TFS (suffix); TM/ETest (naming + one-per-unit) — review F12 |
| No TypeScript `namespace` keyword | TM; ESrv E16 | TM |
| Parent/group `index.ts` re-export chain | TFS S8; ESrv E4, EStr E8 | TFS |
| kebab-case dirs / PascalCase aliases / singular modules | TFS S13 + TM S13/S14; ESrv, EStr | TFS naming |
| SRP / one-reason-to-change split | applying-solid P8; simplifying-code P8 | applying-solid |
| Prefer flat functions over class hierarchies | simplifying-code P14; TM module style | simplifying-code |
| `CONTEXT.md` existence | TM D1; ESrv, EStr, ETest (STP does not mention it — review F6) | TM (canonical def) |
| Test author separation + `@effect/vitest` tooling | ETest E13/E15; echoed by ESrv/EStr ("tests follow effect-testing") | ETest |
| Effect layer placement (`Default` inside service module) | ESrv E3 only (EV4 E20 is constructor *choice*, not placement — review F8b) | ESrv (project convention) |
| "Load `executing-skills` first" prerequisite | **every** skill in scope | executing-skills (harness) |

### Conflict list

Carried forward with exact sources.

| # | Conflict | Source A | Source B | Status / candidate resolution |
| --- | --- | --- | --- | --- |
| C1 | `src/index.ts` policy | STP GATES Phase 1 requires `src/index.ts` (`export {}`) for every package/service | TFS Target Shape: `src/index.ts` "❌ none — `src/` is exempt"; GATES Phase 2 excludes `src/` | **open.** `src/` is both exempt (source-tree rule) and required (package entry). Likely carve-out: package/service entry only. Confirm in B001. |
| C2 | Service tag API | ESrv mandates `ServiceMap.Service<Self, Impl>()(Id)` | EV4 defaults to `Context.Service<Service, Interface>()` + `Service.of({...})` | **open.** EV4 "established conventions win" ⇒ `ServiceMap` likely authoritative. Confirm. |
| C3 | Import extension in examples | TFS/TM Conventions require full `.ts`; ESrv/EStr GATES require `.ts` | TM Pipeline §5 example imports `from "path/to/index.js"`; EV4 E18 example `"./user-repo.js"` | `.ts` is the rule; `.js` in examples is stale. Confirm whether build output ever needs `.js`. |
| C4 | Missing `CHECKLIST.md` | STP Reference: "See `CHECKLIST.md` (MUST READ)" | File absent from `setup-typescript-package/` (only SKILL/GATES/CHANGELOG) | **open.** Restore checklist or drop reference. |
| C5 | `structs/` group not in core list | TM S2 canonical groups: `modules`, `utils`, `services`, `layers` | EStr E5 creates `src/structs/` as a first-class group | **open.** Add `structs` to core group registry. |
| C6 | Unused `layers/` group | TM S2 lists `layers/` | ESrv keeps `Default` in `services/`; EStr routes nothing there | **open.** Is `layers/` still expected, or vestigial? |
| C7 | JSDoc style vs actual code | JS: `@description` first, no type info, no trailing periods | ~182 files use free-form `/** */` (scope: packages/apps/services; A004); 0 use `@description`; real style has `@template`/`@alias`, trailing periods (`packages/core/src/modules/record-ext/record-ext.module.ts`, `.../global/object.ts`) | **open.** Skill style vs repo practice — pick canonical. |
| C8 | Index omissions | TC index lists `writting-jsdoc` and 6 code-principle skills | `mimicking-conventions` absent; `typescript-result-over-throws` absent from deps + Coding Principles table (A003/A004) | **open.** Both are structural/pre-write and should likely be added. |
| C9 | OCP vs closed error union | applying-solid P11: polymorphism over `switch` | RES P4: mandatory exhaustive `switch(error.code)` | Intentional exception documented by A003; note in entry point, do not "fix". |
| C10 | Package source vs module rule | STP creates bare `src/index.ts` | TM S1/S2: everything in a module, no loose top-level exports | **open.** Do packages also require group folders + modules? |
| C11 | Service test stubs ownership | EV4/TESTING.md describes `TestInterface`/`TestService`/`testLayer` | ESrv/ETest never mention where service test layers live | **open.** Assign placement. |
| C12 | `structs`/`layers` CONTEXT vs group CONTEXT | TM D1 requires `CONTEXT.md` per module | A004: group folders carry no `CONTEXT.md` | Not a true conflict — clarify D1 applies to leaf modules only. |
| C13 | `// perf:` exception undocumented | PREF allows annotated perf exception `// perf: reason` | No repo convention codifies it; AGENTS.md only defines package-script verification | **open.** Codify or drop. |
| C14 | `typescript-modules` "explicit return types" vs inference | TM GATES.md:33 "Functions have explicit return types" | RES SKILL.md:59 "let TS infer" + PREF SKILL.md:50 (annotate only to constrain the public API) | **open** (review F2). Re-check whether TM Phase 2/4 gates belong in the matrix; candidate resolution: explicit return types on exported/public-API functions, inferred internally. |
| C15 | `effect-structs` `Blueprint` required vs optional | EStr SKILL.md:39,45,51 list `Blueprint` under "Required" | EStr GATES.md:21 "(optional, omit if struct doesn't use it)" + SKILL.md:140 | **open** (review F4). Phase B decides whether `Blueprint` is mandatory. |

### Gap list

Structural decisions no current skill covers:

| # | Gap | Why it matters |
| --- | --- | --- |
| G1 | Canonical **group registry** (is `structs/` official? is `layers/` live? other groups like `apps/`, `widgets/` seen in repo) | S2 registry is stale vs real tree |
| G2 | Where **error classes / `Result` error modules** live (group + file naming) | RES mandates one class per failure but never names a directory/module |
| G3 | **Effect vs plain-module routing** rule (when to use Effect vs `Result`) | P5 excludes Effect, but no decision rule exists for picking either |
| G4 | Service **test-layer placement** (`TestInterface`/`TestService`) | C11 |
| G5 | Whether **packages** must follow group/module structure or may be bare `src/index.ts` | C10 |
| G6 | Package `src/index.ts` entry-point exemption boundary | C1 |
| G7 | `CONTEXT.md` **content contract/template** (D3 is observed, not codified) | No mechanical verifier; drift risk |
| G8 | **JSDoc canonical style** in this repo | C7 |
| G9 | `mimicking-conventions` place in the structural dependency graph | Orphan (D10/C8) |
| G10 | `layers/` **routing** for standalone layers | C6 |
| G11 | **Naming** for groups, modules, features, packages across the unified story | Phase B explicitly owns naming |
| G12 | Aggregate **verification/`GATES.md`** story — per-skill gates exist, no single verify flow | Entry point should say how to verify |
| G13 | Effect **module-surface filename example** policy (`.js` vs `.ts`) resolved | C3 |
| G14 | Handling **feature-spec dirs** (TASK/MEMORY) vs module CONTEXT | A004 notes they differ |
| G15 | Cross-group/cross-package **dependency-direction** rule (who may import whom) | SOLID/DIP imply it; nothing states it |

### Dependency graph

Edges the unified entry point would expose. `→` = "entry point depends on".
Harness prerequisite `executing-skills` is implicit for all and not listed.

Hard contract deps (entry point cannot describe structure without them):

- → `TC` — router/index; first consult. **PENDING (review F1):** decide whether the unified skill absorbs/replaces `TC` or sits above it, then depend on *either* `TC` *or* the individual skills — never both.
- → `TFS` — source-tree shape, colocation, index chain, imports.
- → `TM` — group/module unit, naming, namespace exports, CONTEXT.md.
- → `STP` — package/service shell + tooling (outer scaffold).
- → `ESrv` — Effect service module specialization of `TM`.
- → `EStr` — Effect struct module specialization of `TM`.
- → `ETest` — tests placement/tooling/patterns.
- → `EV4` — Effect API baseline + schema/layer/testing defaults.
- → `PREF` — declaration/signature annotation policy.
- → `RES` — fallible-function contract, error classes, `@montflow/core` edge (plain modules only).
- → `MIM` — pre-write convention gate (currently orphan — G9).
- → `JS` — JSDoc on request.

Lens deps (invoked conditionally, not standing structural rules):

- → `applying-solid` (design-time granularity/direction), `favoring-composition`,
  `detecting-duplication` (only when true duplication), `simplifying-code`,
  `leaving-it-cleaner`.

Natural consult order (outer → inner, then verify):

1. `TC` — route by task category.
2. `MIM` — read proximity + analogous modules before writing (pre-write gate).
3. `STP` — choose package vs service; scaffold shell + tooling.
4. `TFS` — lay out `src/` tree, tests colocation, index chain.
5. `TM` — define groups + module units.
6. `EV4` — establish Effect baseline; then branch:
   - deliverable is a service → `ESrv`
   - deliverable is a branded value → `EStr`
   - plain module → `PREF` + `RES` contract
7. `ETest` — tests for each module.
8. `PREF` + `RES` — signatures/errors (plain modules).
9. Design lenses: `applying-solid` → `favoring-composition`.
10. Cleanup lenses: `detecting-duplication` → `simplifying-code` → `leaving-it-cleaner`.
11. `JS` — JSDoc if requested.
12. Verify via package scripts (AGENTS.md).

Rough dependency DAG (within the set), with edges labeled **existing** (already in `TC`'s frontmatter deps) vs **proposed** (added by the unified skill — review F7): `TC` → {TFS, TM, STP, ESrv, EStr, ETest, EV4, PREF, JS} *(existing)*; `TC` → {RES, MIM} *(proposed; currently absent per C8)*; `TFS` → TM; `ESrv`/`EStr` → TM + ETest; `ETest` → TM + EV4/TESTING; `RES` → PREF. Reciprocal edge TM ↔ ETest (TM defers test style to ETest).

### Candidate shape — PROPOSAL (for Phase B accept/reject)

> PROPOSAL ONLY. Nothing below is decided; B001 must settle everything in
> Open Questions before B002 drafts the contract.

**Name/group (proposal):** skill `typescript-project-structure`, group
`conventions` (or `typescript`); a router that depends on the skills above and
restates none of their content.

**Sections (proposal):**

1. `# When To Use` — structuring/scaffolding a TS package, service, module, or
   changing its tree; explicit "load `executing-skills` first".
2. `# Pipeline` — ordered delegation, one step per owning skill:
   1. Classify target (package / service / module / struct).
   2. Mirror existing conventions (`MIM`).
   3. Scaffold shell + tooling (`STP`).
   4. Lay out source tree (`TFS`).
   5. Define group + module (`TM`); branch Effect (`EV4` → `ESrv`/`EStr`) or
      plain (`PREF` + `RES`).
   6. Write tests (`ETest`).
   7. Apply design lenses (`applying-solid`, `favoring-composition`).
   8. Apply cleanup lenses (`detecting-duplication`, `simplifying-code`,
      `leaving-it-cleaner`).
   9. Document on request (`JS`).
   10. Verify via package scripts (AGENTS.md).
3. `# Reference` — (a) dependency map table with consult order; (b) resolved
   conflict decisions (from C1–C15); (c) group/module/feature naming registry
   (G1/G11); (d) Effect-vs-Result routing rule (G3).

**Non-restatement rules (proposal):** entry point may state *when/order* and
*tie-breaks* only; every concrete rule cites the owning skill, never copied.
Must satisfy pi-skills schema + `authoring-skills` (FEATURE requirement).

**Open-by-design:** exact name, group, whether it is a pure router vs a
router+decision-tree, whether `MIM` is mandatory, and whether lens skills are
deps or inline references are all Phase B decisions.

## Open Questions

Decisions Phase B (B001 interview) must settle:

- **F1 (review):** does the unified skill replace `typescript-conventions` (absorb its category router) or sit above it? Pick one edge — depend on `TC` only, or on the individual skills only — never both.
- C1: `src/index.ts` — package entry carve-out, or remove the exemption?
- C2: `ServiceMap.Service` vs `Context.Service` — pick authoritative tag API.
- C3/C13: `.ts`-only imports and the `// perf:` annotation — codify, fix
  examples, or drop the exception?
- C4: restore or retire `setup-typescript-package/CHECKLIST.md`.
- C5/C6/G1/G10: final group registry — add `structs`? keep/retire `layers`?
  any other groups (`apps`, `widgets`)?
- C7/G8: JSDoc canonical style — skill's `@description` style vs repo prose?
- C8/G9: add `mimicking-conventions` and `typescript-result-over-throws` to the
  index/dependency set?
- C10/C11/G4/G5: packages & service test layers — do packages follow module
  structure, and where do `TestInterface`/`TestService` layers live?
- G2/G3: error-module placement + Effect-vs-Result routing rule.
- G7: adopt a `CONTEXT.md` content contract/template?
- G11: naming of the unified skill, its group, groups/modules/features.
- G12: define the single verification flow.
- Scope: which skills are hard contract deps vs optional lenses; is `MIM`
  mandatory?
- Shape: pure router vs router+decision-tree; pipeline length; reference
  contents (see Candidate shape PROPOSAL).

## Handoff

- Feeds B001 interview.

## Deviations

- None.
