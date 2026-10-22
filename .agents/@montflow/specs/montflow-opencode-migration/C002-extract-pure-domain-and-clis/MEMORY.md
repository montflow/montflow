# Memory

## Context

Executes C002: extract the host-agnostic domain libraries and their filesystem-only
CLIs from the `pi-*` packages, delete the two dead packages, and defer every plugin
face to a later phase. Inputs: B001 §1 (package fate), §3 (entrypoint contract), §4
(`changes` → core), A006 §5.1, B005 §3. Additive except the two deletions;
`pi-specs`, `pi-sessions`, `pi-effect`, `pi-interactive` stay installed and loadable.
No adapter seam is exercised here.

## Progress

- complete — five packages renamed and repointed, two deleted, plugin faces dropped,
  scoped gates and the full `verify:montflow` green, focused commits landed (unpushed).

## Findings

### What landed

- **Renames.** `pi-workflows` → `@montflow/workflows`, `pi-profiles` → `@montflow/profiles`,
  `pi-prompts` → `@montflow/prompts`, `pi-reviews` → `@montflow/reviews`,
  `pi-skills` → `@montflow/skills`. Each `package.json` updated name/keywords/description/
  `repository.directory`, the Pi `pi` field removed, and stale `@earendil` peers dropped.
- **`@montflow/workflows`.** Dropped the vestigial
  `@earendil-works/pi-coding-agent` peer; the package now declares only the `effect`
  peer. Collapsed the redundant `PiWorkflows` alias in `src/index.ts` and refreshed
  `README.md` + `workflow/CONTEXT.md` to the new name.
- **Deletions.** `packages/pi-notifications` removed entirely (13 files); `pi-workflows`
  gone (renamed).
- **Library + `bin`, no plugin face.** For profiles/prompts/reviews/skills: kept the
  domain modules, services, `apps/interactive`, `apps/doctor`, and the `mf-*` `bin`
  (`./src/apps/cli/main.ts`). Deleted the Pi `src/extension.ts` entrypoint in each and
  stripped the `register()` slash-command seam from the four
  `apps/cli/*.apps.module.ts` files; the constants, parsers, and `run` entrypoints
  remain (still consumed by the workspace's `apps/interactive` flows).
- **`@earendil` runtime imports: zero.** After the edits, the only `@earendil` references
  in the five packages are `import type` statements and devDependencies:
  - `packages/{profiles,skills}/src/apps/interactive/interactive.apps.module.ts` — `import type { ExtensionUIContext }`
  - `packages/prompts/src/apps/interactive/interactive.apps.module.ts` — `import type { ExtensionAPI }`
  - devDependency `@earendil-works/pi-coding-agent` in profiles/prompts/skills.
  `import type` is elided at compile time, so no runtime import remains. `reviews`
  dropped the devDependency outright (no remaining use).
- **CLIs run from the filesystem alone.** `mf-profiles`, `mf-prompts`, `mf-reviews`,
  `mf-skills` each execute via their package `cli` script (`bun run src/apps/cli/main.ts`)
  with exit 0; `mf-skills`/`mf-reviews` also ran from `/tmp` (cwd-independent), proving
  they need no Pi host. `workflows` intentionally ships no `bin`.
- **Repoints.** `profiles` lazy skill engine and its warning now `@montflow/skills`;
  `reviews` profile probe now `@montflow/profiles`; the workspace's
  profiles/prompts/skills services, `app.tsx`, and extension-loader tests now consume
  `@montflow/{profiles,prompts,skills}`; root `verify:montflow:{skills,prompts,profiles,reviews}`
  point at the new directories. Dropped proven-unused deps: profiles
  `pi-interactive`/`pi-tui`, reviews `pi-effect` + `typebox` peer + `@earendil` devDep,
  skills `pi-effect`/`pi-interactive`, prompts `typebox` devDep. Kept
  `pi-effect`/`pi-interactive`/`pi-sessions` where still used.

### Gate evidence

- Scoped `ts:check` + `test` per changed package: workflows 30, profiles 140,
  prompts 555, reviews 94, skills 239 tests — no type errors.
- `bun run lint:check` / `format:check` scoped to the five packages: 0 issues
  (ran `format:fix` + workspace `format:fix` for the edited files).
- `bun run verify:montflow` → **17/17 turbo tasks** (lint/format/ts:check/test) plus all
  six extension verifies green with **0 issues** (skills 46 · 0, prompts 4 · 0,
  specs 4 · 0, profiles 11 · 0, reviews 17 files · 0, sessions doctor ok).
- Commits (unpushed): `2d05bd6` workflows · `f0b2cb6` delete notifications ·
  `b30bd8e` profiles · `802bce1` prompts · `31b47ee` reviews · `f84a7ae` skills ·
  `dac2058` workspace · `393ebe4` root verify + lock.

## Open Questions

- **Stale package-name strings in generated/docs artifacts (not functional).**
  `packages/{prompts,reviews,skills}/src/apps/doctor/embedded-payload.generated.ts`
  (generated from `skills/`) and the skill `SKILL.md`/`CHANGELOG.md` bodies still say
  `@montflow/pi-prompts`/`pi-reviews`/etc.; so do the four package `README.md` titles,
  several `CONTEXT.md` docs, and `packages/profiles/README.md`. Regenerating the
  payloads would rewrite generated files (the embedded payload test asserts content),
  so they were left untouched. Decide whether a later phase (C007 distribution or a
  dedicated docs pass) sweeps these names.
- **On-disk data directories keep their `pi-` names.** `.agents/@montflow/pi-prompts/`
  and the `PROMPTS_DIR` constant in `packages/prompts/src/services/prompt-store/*` were
  deliberately not renamed (B001 Open Q3); the workspace store root depends on them.
  A rename needs a migration story.
- **`.changeset/config.json` ignore list** still names `@montflow/pi-*` packages; C007
  owns that.
- **Type-only `@earendil` imports remain** in the profiles/prompts/skills
  `apps/interactive` modules. They are compile-time only, but routing the interactive
  UI behind the adapter ports (B001 §3) is C005 territory.

## Handoff

- C002 deliverable complete and independently verified on branch `feat/opencode-migration`.
- Files touched: `packages/{workflows,profiles,prompts,reviews,skills}/**` (renamed,
  repointed, plugin faces stripped), removed `packages/pi-notifications/**`,
  `apps/workspace/{package.json,src/app.tsx,src/services/{profiles,prompts,skills}/**}`,
  root `package.json` (verify scripts), `bun.lock`.
- Gate: `bun run verify:montflow` → 17/17 turbo tasks + all extension verifies, 0 issues
  (evidence in Findings). Nothing pushed; nothing under `.agents/@montflow/specs/` was
  committed.
- Note: `.agents/@montflow/specs/montflow-opencode-migration/SPEC.md` carries a
  **pre-existing, unstaged** modification (adds the C-phase table rows; authored during
  the C001 phase). It was left untouched and uncommitted per "do not edit `SPEC.md`".

## Deviations

- Kept type-only `@earendil` imports plus the `@earendil-works/pi-coding-agent`
  devDependency in profiles/prompts/skills (only `reviews` dropped it), so `ts:check`
  still resolves the structural UI types. The stage-0 gate requires "no runtime import",
  which holds.
- Kept the `apps/interactive` library modules inside each package (the workspace depends
  on their flows) — only the Pi plugin-face entrypoints/`register` seams were removed.
- Did not rename on-disk data dirs or generated strings (see Open Questions); no scope
  creep beyond the two mandated deletions.
- Root `package.json` also refreshed `bun.lock` in the same commit as the verify-script
  repoint, since the lockfile churn is a direct consequence of the renames.
