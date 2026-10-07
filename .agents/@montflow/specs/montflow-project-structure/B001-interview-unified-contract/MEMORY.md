# Memory

## Context

Task B001: interview the user on the unified project-structure contract —
reacting to the A005 rule matrix, conflicts (C1–C15), and gaps (G1–G15).
Repo evidence was gathered live (counts below) and corrected two Phase A
conclusions.

## Progress

- 2026-10-06: complete.

## Findings

### Decisions

| # | Decision | Choice | Rationale |
| --- | --- | --- | --- |
| 1 | Relationship to `typescript-conventions` (F1) | **Repurpose it in place** as `montflow-typescript-project-structure` | Keep the skill id/history; reuse its catalog as the base. No second router. |
| 2 | Unified skill name | `montflow-typescript-project-structure` | User choice. |
| 3 | `typescript-result-over-throws` (P1–P5) | **Dropped from the structure contract**; skill stays an optional review lens | Unimplemented: `@montflow/core` exports no `Result`, zero imports. |
| 4 | Service tag API (C2) | `Context.Service` is canonical | Code uses `Context.Service` (6 files / 8 occurrences); `ServiceMap.Service` in 0 source files. Implementation task: update `effect-services`. |
| 5 | Group registry (C5, C6, G1, G10) | **Open-ended plural groups**; observed examples canonical: `modules`, `services`, `structs`, `components`, `rules`, `shared`, `widgets`, `apps`, `skills`. `layers/` retired; `structs/` official | Real tree has many groups; a fixed list is stale. |
| 6 | Package structure (C1, C10, G5) | `src/index.ts` is the package **entry carve-out**; all internals live in group folders/modules | All 13/13 packages have `src/index.ts`. |
| 7 | Plain-module error routing (G2, G3) | Effect modules use typed Effect errors (`Data.TaggedError`); plain utilities **throw typed error classes**. No `Result` | Effect dominant (130 `Effect.gen` files); core already throws typed errors. |
| 8 | JSDoc (C7, G8) | **Not required**; if present, ultra-minimal. Lean on TypeScript + Effect for self-documentation. `writting-jsdoc` becomes optional/minimal | 182 source files use free-form `/** */`, 0 use `@description`. |
| 9 | Dependency scope | **Deps:** `typescript-file-structure`, `typescript-modules`, `setup-typescript-package`, `effect-services`, `effect-structs`, `effect-testing`, `effect-v4`, `typescript-prefer-inference`, `mimicking-conventions`. **Lens references (not deps):** `applying-solid`, `favoring-composition`, `detecting-duplication`, `simplifying-code`, `leaving-it-cleaner`. `writting-jsdoc` optional | Structural skills are the contract; the rest are conditional lenses. |
| 10 | `mimicking-conventions` (C8, G9) | **Required dependency** (pre-write: read neighbours/analogues) | Currently orphaned; it is a real pre-write gate. |
| 11 | `setup-typescript-package/CHECKLIST.md` (C4) | **Retire the dangling reference**; fold anything worth keeping into the skill | File absent; reference is stale. |
| 12 | Service test layers (C11, G4) | Live **in the service module** alongside `Default`, built with `Layer.effectContext` | Keeps the module surface self-contained. |
| 13 | `CONTEXT.md` (G7, C12) | **Codify the observed template** (`# Title`, intro, `## Belongs here`, `## Does not belong here`); applies to **leaf modules only** | Observed on all 85 leaf `CONTEXT.md`; group folders carry none. |
| 14 | Import extension (C3, G13) | **`.js`** canonical; fix stale `.js`/`.ts` examples to match | `.js` dominates: packages+apps non-test **200 `.js` / 20 `.ts`**; packages `src/` non-test 168/19; `allowImportingTsExtensions` on. |
| 18 | C14 return types (B099 F6) | **Explicit return types on exported/public-API functions; infer internally** | Reconciles `typescript-modules/GATES.md:33` with `typescript-prefer-inference`. |
| 19 | Effect error model (B099 F7) | **`Data.TaggedError`** canonical; update `effect-v4` | Code uses `Data.TaggedError` (3 files), `Schema.TaggedErrorClass` (0). |
| 20 | Struct `Blueprint` (C15, B099 F12) | **Optional; omit when unused** | Matches `effect-structs/GATES.md:21` and repo practice (Email omits it). |
| 15 | Test author separation (E13) | **Keep as a hard rule** | Unchanged. |
| 16 | Verification flow (G12) | Package scripts (AGENTS.md) + `mf-specs check` for specs | Matches AGENTS.md. |
| 17 | Scope | **Structure only** — layout/naming/groups/packages; no runtime behavior, testing content, or task authoring | Keeps the skill a router, not a restatement. |

### Phase A corrections

- **C3 reversed:** A005 concluded `.ts` is the rule; the code dominantly uses **`.js`** (packages+apps non-test: 200 `.js` / 20 `.ts`). `.js` is now canonical.
- **C2:** `effect-services` mandates `ServiceMap.Service`, but 0 source files use it; `Context.Service` (6 files / 8 occurrences) wins.
- **C9 moot:** the OCP-vs-closed-error-union tension existed only under the `Result` contract, now dropped.

### B099 corrections

- **F9:** `Context.Service` = **6 files / 8 occurrences** (not 8 files); `ServiceMap.Service` = 0.
- **F10:** `.js`/`.ts` counts restated (see decision #14); direction confirmed.
- **F11:** `Effect.gen` = **130 files** (not 138).
- **F6/F7/F12:** added decisions #18–#20.

### Accepted cleanups (implementation tasks)

- Drop the `// perf:` annotation exception (0 uses in code).
- Fix stale `.js`/`.ts` examples in `typescript-modules` (not `effect-v4`, which already uses `.js`).
- Retire the OCP/`Result` tension note.
- Clarify `CONTEXT.md` = leaf modules only.
- Update `effect-services` to `Context.Service`.
- Minimize `writting-jsdoc`; retire the `setup-typescript-package` `CHECKLIST.md` reference.

### Out of scope

- Runtime behavior and test content guidance.
- Authoring the concrete skill edits — that is B002's contract/outline and the
  implementation tasks authored afterward.

## Open Questions

- None blocking. Exact frontmatter-id retention for the repurposed
  `typescript-conventions` skill is an implementation detail for B002.

## Handoff

- Feeds B002 draft-unified-skill.

## Deviations

- Repo-evidence counts were gathered during the interview (not in A005) and
  corrected C2/C3/C9; recorded above.
