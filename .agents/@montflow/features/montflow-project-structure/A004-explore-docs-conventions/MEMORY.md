# Memory

## Context

Task A004: inventory the docs/convention helpers (`writting-jsdoc`,
`mimicking-conventions`). Read both skills in full + `mimicking-conventions/
GATES.md`, then checked real `CONTEXT.md` usage repo-wide and actual JSDoc
style in source.

## Progress

- 2026-10-06: complete.

## Findings

### Per-skill summary

| Skill | Purpose | When-to-use | Hard rules | Defaults | Pipeline |
| ----- | ------- | ----------- | ---------- | -------- | -------- |
| `writting-jsdoc` (v1.1.1) | Generate concise TypeDoc-compatible JSDoc for functions/methods/interfaces/types/classes/properties | User asks to add/improve/generate JSDoc, or annotate TS code | No type info at all (no `{Type}`, no error class in `@throws`, no return type after `@returns`, no property type); `@description` first; one short sentence; `@example` only on explicit request; fixed annotation order; `-` after param/property names | imperative mood; no trailing periods; one line when possible; `@remarks` for extra context | 1 Identify constructs → 2 per-construct templates → 3 enforce core rules |
| `mimicking-conventions` (v1.1.0) | Explore nearby + analogous modules to learn conventions before writing | Before creating/editing any file/module/package | Name the structural role; read proximity neighbors; read ≥1 analogous module (or document absence); extract filesystem + internal patterns; match both; introduce no external patterns; be indistinguishable | prefer established modules, skip stubs/WIP/generated; proximity > analogy, closer domain > farther; simplest option when no convention exists | 1 Identify role → 2 find references (proximity + analogy) → 3 study filesystem layout → 4 study internal patterns → 5 mimic |

`mimicking-conventions` has explicit `GATES.md` (3 phases, 10 checkboxes) — its
pipeline steps are effectively enforced. `writting-jsdoc` has no `GATES.md`; its
rules are prose only. Both depend on `executing-skills` (prerequisite).

### Documentation rules

- No type information — hard — `writting-jsdoc`/Pipeline §3, Reference
- `@description` first — hard — `writting-jsdoc`/Pipeline §2–3
- Be concise, one sentence — hard — `writting-jsdoc`/Pipeline §3
- `@example` only on explicit request — hard — `writting-jsdoc`/Pipeline §3, Reference
- Fixed annotation order (`@description`→`@param`→`@returns`→`@throws`→`@see`→`@deprecated`→`@example`) — hard — `writting-jsdoc`/Pipeline §3
- `-` after `@param`/`@property` names — hard — `writting-jsdoc`/Pipeline §3
- Imperative mood — default — `writting-jsdoc`/Pipeline §3
- No trailing periods, one line when possible — default — `writting-jsdoc`/Pipeline §3
- `@remarks` for extra context beyond description — default — `writting-jsdoc`/Reference
- JSDoc only written on user request — default (no gate/lint enforces it) — whole skill's when-to-use
- Mimic neighbors instead of inventing style — hard — `mimicking-conventions`/Pipeline §5 + GATES Phase 3
- Read before write (proximity + analogy) — hard — `mimicking-conventions`/Pipeline §2 + GATES Phase 1

### CONTEXT.md in practice

Observed convention (85 `CONTEXT.md` files found across packages/apps/services;
every one of the 91 `*.module.ts` files has a sibling `CONTEXT.md`, so none is
missing — review F11): one file at the module root next to `index.ts`/
`*.module.ts`, shaped `# <Title>` → 1 short intro paragraph (purpose + scope) →
`## Belongs here` (owned exports) → `## Does not belong here` (delegations
naming the owning module). Optional extra sections when the module needs them:
`## Rules`, `## Layers`, `## Constraints`, `## Note`, `## Lazy extension loading`,
`## Running`, `## Persistence is a layer choice`, `## State vs structure`.

Path examples:
- `packages/core/src/structs/uuid/CONTEXT.md` — canonical minimal shape
- `apps/workspace/src/services/features/CONTEXT.md` — richer intro + explicit owner delegations
- `packages/pi-runs/src/services/store/CONTEXT.md` — adds `## Persistence is a layer choice`, `## Layers`
- `packages/pi-runs/src/apps/cli/CONTEXT.md` — adds `## Rules`
- Sibling cross-links by relative path, e.g. `packages/pi-skills/src/apps/cli/CONTEXT.md` links `[../doctor](../doctor/CONTEXT.md)`

Gaps: group folders (`src/modules/`, `src/services/`, …) do **not** carry a
`CONTEXT.md` — only leaf modules do. Feature-spec dirs use TASK/MEMORY, not
CONTEXT. No mechanical verifier checks CONTEXT.md *content*; only existence is
gated. Style is terse agent-facing prose (contrast: `language-quality-reviewer`
PROFILE classifies `CONTEXT.md` as agent-facing Mode 2).

### Docs vs structural

- JSDoc annotations — documentation obligation, soft: on-request only; no lint rule, no gate (grep: zero `jsdoc` in `packages/linting`, zero `jsdoc` in any `*.json`).
- CONTEXT.md *existence* — structural, hard: gated by `typescript-modules/GATES.md`, `effect-services/GATES.md`, `effect-structs/GATES.md`, `effect-testing`.
- CONTEXT.md *content/style* — documentation obligation, soft: no verifier.
- CONTEXT.md placement/shape in target tree — structural: `typescript-file-structure/SKILL.md`, `typescript-modules/SKILL.md`.
- File/folder naming, index chains, test colocation — structural (belongs to A001 core, not these helpers).
- `mimicking-conventions` bind — process/convention obligation, soft: no file artifact, only a pre-write GATES checklist.
- Existing code JSDoc style conflicts with skill: ~182 `*.ts` files under `packages`/`apps`/`services` use `/** */` (search scope: those roots), 0 use `@description`; real style is free-form prose with `@template`, `@alias`, `@see`, trailing periods (e.g. `packages/core/src/modules/record-ext/record-ext.module.ts`, `packages/core/src/modules/global/object.ts`). Exact counts are scope-dependent and not load-bearing (review F11).

### Cross-references

- `typescript-conventions/SKILL.md` frontmatter deps list `writting-jsdoc` (line 27); Reference → Documentation table (line 94). It does **not** list `mimicking-conventions`.
- `typescript-modules/SKILL.md` §Reference "CONTEXT.md" (lines 115–117) is the canonical definition; `GATES.md` line 9 gates existence.
- `effect-services/SKILL.md` line 29 and `effect-structs/SKILL.md` line 29 delegate structure incl. CONTEXT.md to `typescript-modules`.
- `typescript-file-structure/SKILL.md` line 38 delegates module index shape to `typescript-modules`; line 50 shows CONTEXT.md in target shape.
- `effect-testing/SKILL.md` line 187 shows CONTEXT.md in the module layout.
- `writting-jsdoc` referenced by `adversarial-review/SKILL.md` lines 135, 246; `authoring-skills/SKILL.md` line 188 places it in the `documentation` group. Depends on `executing-skills`.
- `mimicking-conventions` is referenced nowhere else under `.agents/skills/` (orphan relative to the structural index); depends on `executing-skills`; group `conventions`.

## Open Questions

- Should the unified entry point adopt `mimicking-conventions`? It is absent from `typescript-conventions` deps/index yet is a pre-write convention gate.
- Reconcile the JSDoc skill's `@description`-first, no-trailing-periods style with actual free-form prose + `@template`/`@alias` practice — which is canonical?
- Is `CONTEXT.md` in A004's docs remit or entirely A001 structural core? Overlap is real and needs a single owner in synthesis.

## Handoff

- Feeds A005 synthesis.

## Deviations

- None.
