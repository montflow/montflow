# Memory

## Context

Task A002: inventory the Effect scaffolding skills (`effect-services`,
`effect-structs`, `effect-testing`, `effect-v4`) and extract the structure they
impose on a TypeScript project, per TASK.md.

## Progress

- 2026-10-06: complete.

## Findings

### Per-skill summary

| skill | purpose | when-to-use | hard rules | defaults | pipeline | artifacts | gates |
|---|---|---|---|---|---|---|---|
| `effect-services` (v2.0.2) | Scaffold Effect v4 services using `ServiceMap.Service` inside the `services/` group. | Creating/scaffolding/adding a new Effect v4 service module. | Service dir `src/services/[service-name]/`; file `[service-name].services.module.ts`; `index.ts` namespace export; `CONTEXT.md`; `tests/`; required exports `Id` (const+type), `Impl`, `ServiceName` class (empty body), `Default` layer; kebab-case files; full `.ts` imports; no TS `namespace`; parent `services/index.ts` re-export. | `make`/`makeDefault` via `Effect.gen`/`Effect.sync`; return object `as const`; `Impl = Effect.Success<typeof make>`; errors as `Data.TaggedError`; namespace-style imports. | 1) Create module dir 2) Export required identifiers 3) Implement service 4) Create index 5) Register in parent. | Module dir, `*.services.module.ts`, `index.ts`, `CONTEXT.md`, `tests/`. | `GATES.md` phases 0–3 (Group & File Structure, Required Exports, Style & Patterns, Naming & Registration). |
| `effect-structs` (v3.0.2) | Branded struct modules with validation, blueprint, brand utilities inside the `structs/` group. | Creating/scaffolding/adding a new branded type module. | Struct dir `src/structs/[struct-name]/`; file `[name].structs.module.ts`; `index.ts` namespace export; `CONTEXT.md`; `tests/`; full `.ts` imports; required exports per pattern (`Id` const+type, brand type, `makeUnsafe`, `make`, `Blueprint` optional); string brands require `REGEX`+`check`; number brands require `check` + `fromNumber`/`toNumber`; composed brands use `Brand.all` and omit `check`; parent `structs/index.ts` re-export; dir kebab-case singular. | Optional utilities per struct type (`fromRandom`, `fromDate`, `toDuration`, `isValidPort`, etc.); `Schema.revealCodec` when widening; omit `Blueprint` when only branding needed; database structs define Schema transformations. | 1) Create module dir 2) Create module 3) Create index 4) Register in parent. | Module dir, `*.structs.module.ts`, `index.ts`, `CONTEXT.md`, `tests/`. | `GATES.md` phases 1–3 (Group & File Structure, Required Exports, Convention Compliance). |
| `effect-testing` (v2.0.2) | Write/review TS unit tests for typescript-modules modules — fixed test location, namespace imports, suite naming, type testing, Effect v4 runtime patterns. | Writing/scaffolding/reviewing tests for a TS module. | Tests inside module `src/[group]/[module-name]/tests/`; one file per utility `[utility-name].test.ts` kebab-case; always `@effect/vitest` (+ `vitest` devDeps, `@effect/vitest` version exactly matches `effect`); import module via public API `import * as Name from "../index.ts"`; max two suites ordered `types` then `runtime`; author separation (implementer must not write tests); `test` script runs `vitest run --typecheck`; `vitest.config.ts` `typecheck.enabled` + `include`; suite names `"Module.utility kind"`. | `types` suite optional; quality probes (real behavior, independence, repeatability, coverage); Effect patterns: `it.effect`/`it.live`/`it.scoped`, `Layer.effectContext`/`Layer.succeed`, `TestClock`, `Queue`/`Deferred`/`Ref`/`Latch`. | 1) Identify module/utility 2) Check author separation 3) Verify tooling 4) Wire test script + typecheck 5) Write imports 6) Write suites 7) Probe quality. | Test file(s), package `test` script, `vitest.config.ts`. | `GATES.md` phases 1–6 (Location & Files, Tooling, Imports, Suites, Quality, Effect Patterns). |
| `effect-v4` (v1.1.0) | Opinionated guide for building production TS apps with Effect v4; branch-chooser reference set. | Implementing Effect workflows/services/layers/schemas/config/schedules/caches/streams/HTTP/tests. | Do-nots are prohibitions but most core defaults are *strong defaults*, not gates: no `as any`/non-null/unchecked casts; no `Schema.Class`/`Schema.TaggedClass` as defaults; no hand-rolled `_tag` errors; no cause-level recovery when typed recovery suffices; no blind `Layer.mergeAll`/`provideMerge`; no hiding authority behind `Context.Reference`; no arbitrary `Effect.sleep` in tests. | Compose with `Effect.gen`; public/non-trivial methods via `Effect.fn("Domain.operation")`; `Context.Service` tag style; `Layer.effect(Service, Effect.gen(...))` returning `Service.of({...})`; `Schema.Struct`+interface; `Schema.TaggedErrorClass`; `Config` not `process.env`; decode at boundaries; established project conventions take precedence. | Branch chooser → read matching reference(s) before editing; no numbered pipeline. | Reference files only (`SCHEMA`, `SERVICES_LAYERS`, `CONFIG`, `SCHEDULING`, `CACHING`, `STREAMS`, `HTTP_CLIENTS`, `TESTING`). | No `GATES.md`. |

### Structural rules

- Service lives under `services/` group dir `src/services/[service-name]/` — **hard** — effect-services/GATES Phase 0, Pipeline 1.
- Service module file named `[service-name].services.module.ts` (kebab-case, `services` group infix) — **hard** — effect-services/Pipeline 2, GATES Phase 0.
- Service `index.ts` uses `export * as PascalName from "./[service-name].services.module.ts"` — **hard** — effect-services/Pipeline 4, GATES Phase 0.
- Service module has `CONTEXT.md` at root — **hard** — effect-services/GATES Phase 0.
- Service module has `tests/` folder; test files follow effect-testing — **hard** — effect-services/GATES Phase 0.
- Service exports `Id` const + `Id` type; `Impl`; `ServiceName` class; `Default` layer — **hard** — effect-services/GATES Phase 1.
- Service `ServiceName` class has empty body (no constructor/methods) — **hard** — effect-services/GATES Phase 1–2.
- Service parent `src/services/index.ts` re-exports each child `export * from "./[service-name]/index.ts"` — **hard** — effect-services/GATES Phase 3.
- Struct lives under `structs/` group dir `src/structs/[struct-name]/` — **hard** — effect-structs/GATES Phase 1, Pipeline 1.
- Struct module file named `[name].structs.module.ts` (`structs` group infix) — **hard** — effect-structs/GATES Phase 1.
- Struct `index.ts` namespace re-export — **hard** — effect-structs/GATES Phase 1.
- Struct `CONTEXT.md` + `tests/` folder — **hard** — effect-structs/GATES Phase 1.
- Struct dir kebab-case, singular; file name matches dir name — **hard** — effect-structs/GATES Phase 3.
- Struct exports `Id` const+type, branded type, `makeUnsafe`; `make`; string brands `REGEX`+`check(str)`; number brands `check(num: unknown)` + `fromNumber`/`toNumber`; composed brands no `check` + `Brand.Brand.FromConstructor<typeof make>` — **hard** — effect-structs/GATES Phase 2.
- Struct `Blueprint` optional; omit when unused — **default** — effect-structs/GATES Phase 2, Conventions.
- Struct parent `src/structs/index.ts` re-exports `export * from "./[struct-name]/index.ts"` — **hard** — effect-structs/GATES Phase 3.
- Tests live in the module under test: `src/[group]/[module-name]/tests/` — **hard** — effect-testing/Core Rule 1, GATES Phase 1.
- One test file per utility: `[utility-name].test.ts` kebab-case — **hard** — effect-testing/Core Rule 2, GATES Phase 1.
- Import module under test via public API namespace `import * as X from "../index.ts"` (no deep imports) — **hard** — effect-testing/Core Rule 4, GATES Phase 3.
- At most two suites per file, ordered `types` (optional) then `runtime` — **hard** — effect-testing/Core Rule 5, GATES Phase 4.
- Suite names `"ModuleName.utilityName runtime"` / `... types"` — **hard** — effect-testing/Core Rule 6, GATES Phase 4.
- Author separation: test author ≠ implementer unless user confirms — **hard** — effect-testing/Core Rule 6, GATES Phase 1.
- Package `test` script `vitest run --typecheck`; `vitest.config.ts` typecheck include `src/**/*.test.ts` — **hard** — effect-testing/Pipeline 4, GATES Phase 2.
- `@effect/vitest` + `vitest` devDeps; `@effect/vitest` version exactly matches `effect` — **hard** — effect-testing/Core Rule 3, GATES Phase 2.
- All relative imports/exports carry full `.ts` extension — **hard** — effect-services/GATES Phase 2; effect-structs/GATES Phase 1.
- No TypeScript `namespace` keyword — **hard** — effect-services/GATES Phase 2; typescript-modules/Conventions.
- Namespace-style imports where conventional — **default** — effect-services/GATES Phase 2.
- `effect-v4` module-surface style (file-local role names + self-export `export * as UserRepo from "./user-repo.js"`) — **default**, explicitly "not required by Effect", follow existing codebase style — effect-v4/SERVICES_LAYERS Module Surface.
- `effect-v4` test layout: `Interface`/`Service`/`layer`/`testLayer`, `TestInterface`/`TestService`, same object backs real + test tags — **default** — effect-v4/TESTING First-Class App Test Stubs.
- Layer constructors: `Layer.effect` for real implementations; `Layer.effectContext` for multi-service/test stubs; `Layer.succeed`/`Layer.sync` alternatives — **default** — effect-v4/SERVICES_LAYERS Layer Constructors.
- Long-lived work forked into layer scope (`Effect.forkScoped`) — **default** — effect-v4/SERVICES_LAYERS Long-Lived Work.

### Structure vs Effect API

- `ServiceMap.Service<Self, Impl>()(Id)` (effect-services) vs `Context.Service<Service, Interface>()(...)` (effect-v4) — **Effect API choice**, not structure; project convention pins `ServiceMap`.
- Required exports `Id`/`Impl`/`ServiceName`/`Default` — **structure of the module surface** (which symbols exist), though each symbol's type is Effect API.
- `Impl = Effect.Success<typeof make>` — **Effect API/type usage**, not directory structure.
- `make` via `Effect.gen`/`Effect.sync`, `as const` return — **Effect API usage** (style gate), not structure.
- `Default = Layer.effect(ServiceName, make)` — **where the layer lives** (inside the service module file); the call is API, the placement is structure.
- Struct required exports (`Brand`, `Schema.fromBrand`, `Brand.all`) — **Effect API usage**; the mandated export set is module-surface structure.
- Struct patterns (string/number/composed) — **Effect API usage**; directory + file naming is structure.
- `@effect/vitest` runners/`TestClock`/`Layer.effectContext` — **Effect API usage**; test placement, file naming, suite ordering are structure.
- `effect-v4` "Core Defaults", "Quick Selection Guide", "Boundary Rules" (Map/TTL, schedules, streams, HTTP) — **Effect API usage/behavioral guidance**, not project structure.
- `effect-v4` "Do Nots" — behavioral/API prohibitions, not structure.
- `effect-testing` quality probes (real behavior, repeatable, coverage) — **test-quality defaults**, not structure.

### Cross-references

- `effect-services` → `typescript-modules` (`dependencies`; Reference "MUST READ"; Pipeline 1 defers full structure; GATES Phase 0 cites group infix).
- `effect-services` → `effect-testing` (Reference; GATES Phase 0 "test files follow effect-testing").
- `effect-services` → `executing-skills` (dependency; prerequisite callout).
- `effect-structs` → `typescript-modules` (`dependencies`; Reference "MUST READ"; Pipeline 1; file-naming conventions).
- `effect-structs` → `effect-testing` (Reference; GATES Phase 1).
- `effect-structs` → `executing-skills` (dependency; prerequisite).
- `effect-testing` → `typescript-modules` (`dependencies`; Core Rule 1; Pipeline 1 fallback).
- `effect-testing` → `effect-v4/references/TESTING.md` (Effect Testing Patterns; Reference).
- `effect-testing` → `executing-skills` (dependency; prerequisite).
- `typescript-modules` (structural core) → `effect-testing` (`dependencies`; Test Naming; Reference) — reciprocal edge.
- `effect-v4` → `executing-skills` only (`dependencies`); internal branch refs `SCHEMA.md`, `SERVICES_LAYERS.md`, `TESTING.md`, etc. No edge to the other three skills.
- Structural core `typescript-modules` defines: groups `modules`/`utils`/`services`/`layers`; `[group]/[module-name]/` dir; `[module-name].[group].module.ts` (no infix for `modules`); `index.ts` namespace; `CONTEXT.md`; `tests/`; kebab/PascalCase; `.ts` extensions; no TS `namespace`; singular names; No-Echo Rule (strong default). `effect-services` specializes `services/`; `effect-structs` introduces a `structs/` group **not listed** in the core's group set; `effect-testing` refines the core's `tests/` placement/naming.

## Open Questions

- `structs/` is absent from `typescript-modules`' canonical group list (`modules`, `utils`, `services`, `layers`). Is it a recognized fifth group needing a core update, or a domain-specific extension? A005 synthesis should reconcile this.
- Service layer placement conflict: `effect-services` mandates `ServiceMap.Service` + `Layer.effect` with the default layer inside the service module, while `effect-v4` defaults to `Context.Service` + `Service.of`. Which is authoritative for this project? (effect-v4's Source Rule says established project conventions win.)
- `typescript-modules` defines a `layers/` group, but neither `effect-services` nor `effect-structs` routes layers there; `effect-services` keeps `Default` in the `services/` module. Are standalone `layers/` modules still expected?
- Service-level test stubs (`TestInterface`/`TestService`/`testLayer`) are described only in `effect-v4/references/TESTING.md`, not in `effect-services` or `effect-testing`. Where should service test layers live?

## Handoff

- Feeds A005 synthesis.

## Deviations

- None.
