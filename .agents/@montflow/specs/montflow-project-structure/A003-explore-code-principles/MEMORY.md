# Memory

## Context

Task A003: inventory the code-principle skills
(`typescript-prefer-inference`, `typescript-result-over-throws`,
`applying-solid`, `favoring-composition`, `detecting-duplication`,
`simplifying-code`, `leaving-it-cleaner`).

## Progress

- 2026-10-06: complete.

## Findings

Per-skill inventory. "Hard" = non-negotiable in the skill; "default" = strong
preference with stated escape hatches.

| Skill | Purpose | When-to-use | Hard rules | Defaults | Pipeline |
| --- | --- | --- | --- | --- | --- |
| `typescript-prefer-inference` | Prefer inference over `: Type` on variable declarations; avoid convenience `as` | TS review w/ over-annotated vars / `as`; "clean up annotations" | Flag annotations obvious from initializer. Flag convenience `as`. Annotations allowed ONLY for: genuinely ambiguous (`satisfies` first), public API return types, perf w/ `// perf:` comment | Use `satisfies`, type guards, control-flow narrowing | 1 scan var annotations → 2 inspect `as` casts → 3 verify against exceptions |
| `typescript-result-over-throws` | Functions return typed `Result` from `@montflow/core`; no throw for expected/recoverable errors — EXCEPT Effect (has own abstraction) | Writing/reviewing/refactoring TS fns that can fail | No `throw`/`reject()`/`.throw()` for expected failures. Every failure path → `Result.err(new ErrorClass())`. Error class: one per failure case, readonly literal `code = "..." as const`, noun-form domain-specific, no string codes, no `Error` subclassing. `try` prefix on Result-returning fns. Never swallow a callee's `Result` into a throw. Consumers: `Result.isErr`/`isOk` + exhaustive `switch(error.code)`. `@montflow/core` in package.json | Let return type infer (defers to prefer-inference). `throw` valid for programmer-error invariants (assertions / unreachable) | 1 verify/install `@montflow/core` → 2 define error classes → 3 return `Result`, never throw → 4 enforce boundary (scan/replace/propagate/update callers) → 5 legitimate throw exceptions |
| `applying-solid` | Review OO code against all 5 SOLID principles | Audit/review/refactor OO; designing classes/modules | None explicitly hard; audit checklist. Fixes are prescriptions applied per violation | SRP split; OCP polymorphism/strategy; LSP honor contract + composition; ISP split interfaces; DIP inject abstractions via ctor/params | 1 audit S→O→L→I→D → 2 verify (run tests) |
| `favoring-composition` | Replace deep inheritance trees with composition | Designing object relationships; brittle hierarchies; "composition over inheritance" | External API must remain unchanged after conversion | Detect: trees >2 levels, subclasses overriding most methods, multiple-parent need. Convert: identify behaviors → extract classes/interfaces → contain (has-a) → delegate | 1 detect inheritance problems → 2 convert to composition → 3 apply pattern → 4 verify |
| `detecting-duplication` | Find/refactor duplicated code, logic, config | PR review, tech debt, before specs; DRY | Verify all call sites behave same after extraction; run tests | Categorize true (extract) vs accidental (leave). Extract into shared helper/util/constant; unify duplicate types. Stop when extraction couples unrelated domains or repetition is trivial 1–2 lines unlikely to change | 1 search repeated patterns → 2 categorize → 3 extract true duplication → 4 verify → 5 know when to stop |
| `simplifying-code` | Audit over-engineering / unnecessary abstraction / complexity | Code feels bloated; review / before merge | Verify behavior preserved; readability check ("junior dev understands") | Signals: nesting 3+ deep, fns >30 lines, 5+ concerns, clever one-liners, over-abstraction. Fixes: early returns/guards, extract helpers, split by SRP, explicit intermediates, remove single-use abstractions, prefer flat fns over hierarchies | 1 scan signals → 2 simplify each → 3 readability check → 4 verify |
| `leaving-it-cleaner` | Incremental hygiene when touching a file (boy-scout) | Any edit/bugfix/spec | Time budget: ≤30s per cleanup, else `TODO`. Do not run full formatter on unrelated files | Scan same fn/class/20 surrounding lines. Fix naming, dead code, formatting, extract 3–5 line blocks, replace `any` | 1 scan surrounding area → 2 apply low-friction fixes → 3 respect time budget |

### Structural consequences

- Return `Result` + `try` prefix — hard — `typescript-result-over-throws`/Pipeline §3: every fallible function signature becomes `tryX(...)` returning inferred `Result<Ok, ErrUnion>`; callers must branch, not `try/catch`.
- One error class per failure with literal `code` — hard — `typescript-result-over-throws`/Pipeline §2: implies a dedicated error module/namespace per spec or package, and a domain error union type.
- `@montflow/core` as a dependency — hard — `typescript-result-over-throws`/Pipeline §1 + GATES Phase 3: structural dependency edge from every fallible package to the core package.
- Exhaustive `switch(error.code)` at consumers — hard — `typescript-result-over-throws`/Pipeline §4: constrains how error unions are exported/consumed; every error class is part of the public API of the owning module.
- Effect-exclusion — hard — `typescript-result-over-throws`/When-to-use: Effect-based modules do NOT adopt `Result`; error handling forks by module kind (Effect vs plain).
- No variable annotations; infer from initializer — hard — `typescript-prefer-inference`/Pipeline §1: declarations stay unannotated; `let count = 0`, not `let count: number = 0`.
- `satisfies` over annotation/cast — default — `typescript-prefer-inference`/Pipeline §2–3: shapes const/config exports and narrowing sites.
- Public API return annotations permitted — default (exception) — `typescript-prefer-inference`/Pipeline §3.2: public function export surface may stay explicitly typed.
- SRP: one reason to change → split units — default — `applying-solid`/§S + `simplifying-code`/§Too Many Responsibilities: drives module granularity; "5+ concerns" triggers a module split.
- DIP: inject abstractions via ctor/params — default — `applying-solid`/§D: module dependencies become parameters, shaping service/function boundaries; no in-class construction of collaborators.
- ISP: split fat interfaces — default — `applying-solid`/§I: exported types are role-specific rather than monolithic.
- OCP: polymorphism over type-`switch` — default — `applying-solid`/§O: new variants add modules, not edits to existing switches; note tension with `typescript-result-over-throws` exhaustive `switch(error.code)` (error union is intentionally closed).
- Composition over inheritance (has-a, extracted behavior classes) — default — `favoring-composition`/Pipeline §2: module boundaries host small behavior units; deep `extends` trees discouraged.
- Extract true duplication into shared helper/util/constant + shared types — default — `detecting-duplication`/Pipeline §3: creates cross-module shared units; conditional on "true" duplication (same reason to change).
- Stop when extraction couples unrelated domains — default (guardrail) — `detecting-duplication`/§5: preserves module boundaries even when code repeats.
- Prefer flat functions over class hierarchies — default — `simplifying-code`/§Over-abstraction + `typescript-modules` module style: aligns with function/namespace modules.
- Dead code / orphaned exports removal — default — `leaving-it-cleaner`/§2.2: keeps `index.ts` re-export chains honest; touches module public surface.
- Extraction of 3–5 line single-purpose blocks — default — `leaving-it-cleaner`/§2.4: local helper placement, not new module boundaries.
- ≤30s cleanup budget / no formatter sweep — hard — `leaving-it-cleaner`/§3: hygiene must not reshape files or modules wholesale.

### Entry-point vs review-lens

- **Entry point SHOULD depend on (carry structural weight):**
  - `typescript-result-over-throws` — dictates function signatures, error modules, consumer patterns, and a package dependency. Strongest structural skill.
  - `typescript-prefer-inference` — dictates declaration/signature annotation policy; directly referenced by result-over-throws.
  - `applying-solid` — SRP/DIP/ISP/OCP give module-granularity and dependency-direction rules (design-time, not only review).
  - `favoring-composition` — gives module/boundary composition rules (has-a vs is-a).
- **Borderline (structural only when a condition triggers):**
  - `detecting-duplication` — creates shared units / unified types, but explicitly stops at domain coupling; keep as a lens the entry point may invoke, not a standing structural rule.
- **Standalone review lenses / habits (do NOT belong in the structural contract):**
  - `simplifying-code` — post-hoc complexity audit.
  - `leaving-it-cleaner` — per-edit hygiene habit.
- Note: the existing structural-core index (`typescript-conventions`) already depends on six of the seven as "Coding Principles" (see below) — the unified entry point can follow that pattern but should mark result-over-throws + prefer-inference as contract, the rest as lenses.

### Cross-references

- `all seven` → `executing-skills` — dependency + prerequisite block — each `SKILL.md` frontmatter `dependencies:` and "> Prerequisite" line. (Shared harness prerequisite, not structural core.)
- `typescript-conventions` (structural core index) → depends-on `applying-solid`, `detecting-duplication`, `favoring-composition`, `leaving-it-cleaner`, `simplifying-code`, `typescript-prefer-inference` — `typescript-conventions/SKILL.md` frontmatter lines 13–27; tabulated as "Coding Principles" lines 79–88.
- `typescript-prefer-inference` → `typescript-conventions` — Reference line 55 ("TS Skill Index").
- `typescript-result-over-throws` → `typescript-prefer-inference` — Pipeline §3 line 59 (defer return-type inference).
- `typescript-result-over-throws` → `@montflow/core` package — Pipeline §1 lines 30–38, example line 62, Reference line 115.
- `typescript-result-over-throws` → Effect exclusion — When-to-use line 22.
- `simplifying-code` → `authoring-skills` — Reference line 67 (authoring standard; not structural core).
- `adversarial-review` → `detecting-duplication` (`SKILL.md` lines 116, 243) and `applying-solid` (lines 119, 244).
- `authoring-skills` group table → references `applying-solid`, `detecting-duplication`, `simplifying-code`, `leaving-it-cleaner`, `favoring-composition` — lines 187–193.
- `typescript-file-structure` / `typescript-modules` → `effect-testing`, `typescript-modules` — structural core internal edges; code-principle skills do not depend on them.

## Open Questions

- `typescript-result-over-throws` is absent from `typescript-conventions` frontmatter dependencies AND the Coding Principles table (lines 13–27, 79–88) despite being the most structural skill. Gap or intentional (Effect exclusion)? Affects the unified entry point's dependency set.
- Hard-vs-default labels are explicit only in result-over-throws and prefer-inference; for opportunistic skills (SOLID, composition, duplication, simplification) the split was inferred. Confirm during Phase B.
- Do SOLID/composition rules apply to this Effect-functional codebase at all (few classes), or are they dormant lenses?
- Perf exception in prefer-inference (`// perf: reason`) vs repo "verify only via package scripts" — is the `// perf:` convention codified anywhere?

## Handoff

- Feeds A005 synthesis.

## Deviations

- None.
