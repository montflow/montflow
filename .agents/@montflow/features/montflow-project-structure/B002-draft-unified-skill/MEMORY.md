# Memory

## Context

Task B002: the concrete contract for the unified entry-point skill plus the
ordered implementation outline. Revised after the B099 adversarial review
(18 findings) and the user dispositions: module law reduced to principles with
owner pointers (F1), three new rule decisions recorded (C14 return types,
Effect error model, C15 `Blueprint`).

## Progress

- 2026-10-06: complete.

## Findings

### Unified skill contract — `montflow-typescript-project-structure`

#### Frontmatter

| Field | Value |
| --- | --- |
| `name` | `montflow-typescript-project-structure` |
| `id` | `19088d58133341e3` — **reuse** (repurpose `typescript-conventions` in place) |
| `description` | Canonical entry point for how a montflow TypeScript project is structured: everything is a module, module style, group layout, package/service scaffolding, exports, and verification — delegating every concrete rule to its owning skill. Use when structuring, scaffolding, or auditing a package, service, group, or module. |
| `author` | Daniel Montilla |
| `version` | `3.0.0` (breaking rewrite of `typescript-conventions` v1.2.1) |
| `license` | MIT |
| `groups` | YAML list: `typescript` |
| `dependencies` | YAML list: `executing-skills`, `mimicking-conventions`, `typescript-file-structure`, `typescript-modules`, `setup-typescript-package`, `effect-services`, `effect-structs`, `effect-testing`, `effect-v4`, `typescript-prefer-inference` |

Not dependencies (referenced as optional lenses/docs): `applying-solid`,
`favoring-composition`, `detecting-duplication`, `simplifying-code`,
`leaving-it-cleaner`, `writting-jsdoc`. `typescript-result-over-throws` is
dropped from the contract and **not referenced** (B001 #3, B099 F14).

> Format note (F13): `groups` and `dependencies` MUST be authored as YAML lists
> (`- value`), not scalars — the pi-skills verifier rejects scalars.

#### The module law (spine — principles, each delegated to its owner)

1. **Everything is a module.** Every export lives inside a module; the only
   loose file is a package/service entry `src/index.ts` (entry carve-out,
   B001 #6). *Canonical module definition, layout, naming, and exports:
   `typescript-modules`.*
2. **One canonical module style.** Every module is the same shape:
   implementation + its tests + `CONTEXT.md` when needed + an `index.ts`.
   *Canonical rule: `typescript-modules`.*
3. **Tests live inside the module.** Tests are colocated with the code they
   test. *Canonical rule: `typescript-file-structure`.*
4. **`CONTEXT.md` when the module needs it** (conditional; leaf modules only).
   *Canonical rule + template: `typescript-modules`.*
5. **Exports flow through the module `index.ts`.** Named exports in the module
   file; the module `index.ts` presents the surface; group `index.ts` files
   aggregate their children. *Canonical syntax: `typescript-modules` /
   `typescript-file-structure`.*
6. **Everything in a group folder.** Groups are open-ended plural folders
   (policy below; no owning skill).
7. **Relative specifiers use `.js`** (B001 #14) — applies across all dep skills.
8. **Routing:** Effect modules use typed Effect errors (`Data.TaggedError`,
   B001 #19); plain modules throw typed error classes. No `Result` (B001 #3/#7).
9. **Verification:** package scripts (AGENTS.md) + `mf-features check`
   (B001 #16).

The entry point states these as the law and names the owner for each concrete
rule; it never copies the owner's rule text (FEATURE requirement, B099 F1).

#### `# When To Use`

Use when structuring, scaffolding, or auditing a montflow TypeScript package,
service, group, or module — deciding where a file, type, or test belongs, laying
out a new package, or checking an existing tree. Includes the prerequisite
"load `executing-skills` first".

#### `# Pipeline` (delegated, one step per owner)

1. Load `executing-skills`.
2. **Mirror conventions first** (`mimicking-conventions`) — read proximity
   neighbours + analogous modules.
3. **Classify the target** — package | service | module; Effect vs plain.
4. **Scaffold shell + tooling** (`setup-typescript-package`) — apply the
   `src/index.ts` entry carve-out.
5. **Lay out the tree** (`typescript-file-structure`) — groups, colocated
   tests, index chain, `.js` specifiers.
6. **Define the module unit** (`typescript-modules`) — module file + index +
   optional `CONTEXT.md` + tests, per the module law.
7. **Branch:**
   - Effect service → `effect-services` (+ `effect-v4` for API);
   - branded value → `effect-structs` (+ `effect-v4`);
   - plain module → `typescript-prefer-inference` for signatures; fallible code
     throws typed errors.
8. **Write tests** (`effect-testing`).
9. **Design lenses** (referenced): `applying-solid` → `favoring-composition`.
10. **Cleanup lenses** (referenced): `detecting-duplication` →
    `simplifying-code` → `leaving-it-cleaner`.
11. **Document only if asked, minimally** (`writting-jsdoc`, optional).
12. **Verify** — package scripts; `mf-features check` for feature specs.

#### `# Reference`

1. **Dependency map + consult order** (above).
2. **Module law** (above) with owner attributions.
3. **Group registry** — open-ended plural folders; observed examples; `layers/`
   retired; `structs/` official.
4. **Resolved decisions** — C1–C15 plus the error model, with the B001 outcome
   for each (C14 and C15 included, below).
5. **Naming vocabulary** — module/group/file/test naming (delegated).
6. **Effect-vs-plain routing** rule (module law #8).
7. **Lens section** — the review lenses, referenced not restated.
8. **Verification flow**.

Resolved decisions added at B099:

- **C14 (return types):** exported/public-API functions use explicit return
  types; internal functions infer (`typescript-prefer-inference`). Owner updated
  in `typescript-modules` + `typescript-prefer-inference`.
- **C15 (`Blueprint`):** optional; omit when the struct doesn't use it
  (`effect-structs`).
- **Error model:** `Data.TaggedError` is canonical; `effect-v4` is updated to
  align (its `Schema.TaggedErrorClass` mandate is retired).

### Implementation task outline (ordered — authored in a later phase)

1. Rename the directory `typescript-conventions/` →
   `montflow-typescript-project-structure/`; rewrite `SKILL.md` in place (keep
   the 16-hex id `19088d58133341e3`; frontmatter name/description/version 3.0.0
   + YAML `groups`/`dependencies` lists; body = module law + When To Use /
   Pipeline / Reference). (B099 F2/F13)
2. Repoint inbound references to the renamed skill:
   `typescript-prefer-inference/SKILL.md:55` and
   `authoring-skills/SKILL.md:191`. (B099 F2)
3. Drop `typescript-result-over-throws` from the dependency set; do not
   reference it (B001 #3, B099 F14).
4. Add `mimicking-conventions` as a dependency + the pre-write pipeline step.
   (single task; supersedes the old duplicate step 13 — B099 F16)
5. Update `typescript-modules` (`SKILL.md` + `GATES.md`): open-ended group
   registry (retire `layers/`, add `structs`); `.js` specifiers; conditional
   `CONTEXT.md` + template; C14 public-API return-type rule; align with the
   module law. (B099 F4/F5)
6. Update `typescript-file-structure` (`SKILL.md` + `GATES.md`): `.js`
   specifiers; `src/index.ts` entry carve-out; test colocation. (B099 F5)
7. Update `effect-services` (`SKILL.md` + `GATES.md` + `templates/` +
   `examples/`): `Context.Service`; service test layers via `Layer.effectContext`;
   `Id` naming; `.js` specifiers; fix the frontmatter description (drop
   "ServiceMap.Service"). (B099 F4/F5/F17)
8. Update `effect-structs` (`SKILL.md` + `GATES.md` + `templates/`): `Blueprint`
   optional (C15); `Id` naming; `.js` specifiers. (B099 F4/F5)
9. Update `effect-testing` (`SKILL.md` + `GATES.md`): keep author separation;
   `.js` specifiers. (B099 F5)
10. Update `effect-v4` (`SKILL.md` + `references/`): align the error model to
    `Data.TaggedError`; state that the self-export module-surface example is an
    Effect API reference, not the module law (B099 F8); `.js` needs no change
    (B099 F18).
11. Update `setup-typescript-package`: retire the `CHECKLIST.md` reference.
12. Update `typescript-prefer-inference`: drop the `// perf:` exception.
13. Minimize `writting-jsdoc` (optional, ultra-minimal if present).
14. Tests/docs: pi-skills schema + `authoring-skills` conformance; CHANGELOG.
    The router ships **no `GATES.md`** — it is verified by `verifySkillFile` +
    package scripts (B099 F15).
15. Verify: `bun run --cwd packages/pi-skills test`; `mf-features check`.

### Still open

- Authoring the concrete implementation `TASK.md`s — the FEATURE spec grows
  after Phase B. Includes a code-level sweep for any remaining `.ts`
  specifiers and `ServiceMap.Service` usages once the skills are updated.

## Open Questions

- None blocking. The item above is scoped to the implementation phase.

## Handoff

- Feeds B099 review-phase (re-review) and, once locked, the implementation-phase
  task authoring.

## Deviations

- The module law (user directive) is the organizing principle; it elaborates
  B001 #1/#5/#6 and amends B001 #13 (`CONTEXT.md` conditional, not a universal
  hard gate).
- B099 corrections applied: F1 (module law now principle + owner pointer),
  F2–F5, F8–F11, F13–F18, plus decisions #18–#20 recorded in B001.
