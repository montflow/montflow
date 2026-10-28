# Memory

## Context

Task C001: add the review-task reviewer-profile field to the `pi-specs` task
contract and scaffold. The decisive contract is B001 §1 (field name
`reviewer-profiles`, ordered, comma-separated canonical, absent/empty → `[]`,
duplicates a verifiable failure), B002 §4 (exact `Task`/`TaskInput`/`taskInput`/
`verifyTaskFile` shape, the F16 non-`review` rejection, the `finding-ref` locator
rewrite, and the tests per changed unit) and B002 §6 (change-list rows owned by
C001), and B003 §2 (the "Field-name authority note": the on-disk key is
`reviewer-profiles`, never `profiles`). C001 `TASK.md` prose says "the `profiles`
field"; B003 overrides that — implemented as `reviewer-profiles`.

Implemented in `packages/pi-specs` only. Read: `task.module.ts`,
`scaffold.module.ts`, `cli.apps.module.ts`, the task/scaffold/CLI tests,
`frontmatter.module.ts` (`fieldList`/`parseMarkdown` — no change needed),
`skills/authoring-spec.ts`, and B001/B002/B003 MEMORYs. No file outside
`.agents/@montflow/specs/` and `packages/pi-specs/` was touched.

## Progress

- 2026-10-15: complete. All four scoped gates green (see Findings §5).

## Findings

### 1. Task contract (`task.module.ts`)

- New `REVIEWER_PROFILES_FIELD = 'reviewer-profiles'`.
- `FINDING_REF_PATTERN` changed from `/^F\d+$/` to the fully-qualified locator
  `/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d{3}\/F\d+$/` (B001 §5); the `finding-ref` issue
  text is now `Must be a finding reference like '<series>/<round>/F1'.`
- `Task` gains `reviewerProfiles: Schema.Array(Schema.String.check(Schema.isPattern(SLUG_PATTERN)))`
  between `relatedTasks` and `findingRef`; `TaskInput` gains
  `readonly reviewerProfiles: ReadonlyArray<string>`; `taskInput` reads
  `fieldList(fields, REVIEWER_PROFILES_FIELD)`. The parser accepts a duplicated
  list and a non-`review` task (B002 §4: duplicates are verifier-only).
- `verifyTaskFile` adds the syntactic fail points, after the `related-tasks`
  loop and before `finding-ref`:
  - the field present on a non-`review` task →
    `[reviewer-profiles] only valid on a 'review' task.` (F16). Presence is read
    as `fields[REVIEWER_PROFILES_FIELD] !== undefined`, so a blank-value key on a
    non-`review` task is rejected too, while `[]` on a `review` task is clean.
  - each entry must match `SLUG_PATTERN` →
    `[reviewer-profiles] '<x>' is not a profile slug.` (B001 §4.1).
  - a repeated entry → `[reviewer-profiles] '<x>' is listed more than once.`
    (B002 §4 fixes "duplicates rejected" but no exact string; chosen to match the
    existing `field: message` issue style).
  `pi-specs` still resolves no real profile — no new dependency.

### 2. Scaffold (`scaffold.module.ts`)

- `ScaffoldSpecInput.reviewerProfiles?: ReadonlyArray<string>`; `renderReview`
  now takes `(phase, id, reviewerProfiles)` and emits `reviewer-profiles:` (empty
  by default) or `reviewer-profiles: <a>, <b>` (canonical comma scalar) between
  `related-tasks` and `status`; `renderSpecScaffold` threads
  `input.reviewerProfiles ?? []`. No `- item` scalar; no per-task grammar change
  (B002 §4 F3 rejects extending `parseScaffoldTask`).

### 3. CLI (`cli.apps.module.ts`)

- `ScaffoldOptions.reviewerProfiles?: ReadonlyArray<string>`; `scaffold` validates
  each entry against `SLUG_PATTERN` (imported from the task module) and rejects a
  duplicate, before rendering: `'<x>' is not a valid reviewer profile — use a
  kebab-case slug such as 'effect-reviewer'.` /
  `Reviewer profile '<x>' is listed more than once.`
- `createCommand` gains `--reviewer-profiles` (comma-separated via the existing
  `csv`), passed through. The slash form gains `reviewer-profiles` to
  `SLASH_VALUE_FLAGS`, `SlashArgs`, `parseSlashArgs` (both `--key value` and
  `--key=value`), and the `runSlash` create path.

### 4. Authoring contract (`skills/authoring-spec.ts`)

- `AUTHORING_SPEC` now lists `reviewer-profiles` (and `finding-ref`) in the
  `TASK.md` frontmatter, documents the field (review tasks only, comma-separated
  ordered slugs, empty = general reviewer, each entry adds a `<spec>-<profile>`
  series), documents the `finding-ref` locator, and adds the flag to the scaffold
  command line. B003 §4 also lists AUTHORING_SPEC against C004; C001 owns the
  field sentence per its `TASK.md`, so this lands here and C004 may refine the
  orchestration story around it.

### 5. Tests and gates

New/updated tests: `parse-task-file.test.ts` (absent → `[]`, comma scalar, empty,
YAML `- item` list, qualified `findingRef`), `verify-task-file.test.ts` (valid
list, empty-on-review clean, malformed slug, duplicate, field-on-`execution`,
new `finding-ref` message), `helpers.ts` (`reviewerProfiles?: string`),
`scaffold.test.ts` (empty default line + supplied line + tree verifies),
`create.test.ts` (engine: supplied line, empty default, invalid refused,
duplicate refused; slash: `--reviewer-profiles` threaded and checks clean).

Gate results (from the repo root, package scripts only):

- `bun run --cwd packages/pi-specs test` → **pass** — 52 files / 328 tests, no
  type errors.
- `bun run --cwd packages/pi-specs ts:check` → **pass** — `tsc --noEmit`, no
  output.
- `bun run --cwd packages/pi-specs lint:check` → **pass** — 0 warnings, 0 errors.
- `bun run --cwd packages/pi-specs format:check` → **pass** — "All matched files
  use the correct format." (after one `format:fix` run on the scaffold module and
  scaffold test).

## Open Questions

- **C002:** `verifySpecTree`/`review-link` still take the single-snapshot /
  no-profiles shape; the `reviewerProfiles` now parsed here is not yet threaded
  into `ReviewTaskEntry`/`seriesNames` (B002 §3/§6, C002).
- **C003:** `mf-reviews verify --all` declared-profile resolution (F9) consumes
  `task.reviewerProfiles`; not implemented here.
- **C004:** `AUTHORING_SPEC`/`EXECUTING_SPEC` review wording beyond the field
  sentence; `EXECUTING_SPEC` one-session-per-series.
- **C005:** `C099` still needs the on-disk `reviewer-profiles: effect-reviewer`
  line (per B003 §2b) — intentionally not applied here.

## Handoff

- Feeds C002 (structure/review-link consume `reviewerProfiles`), C003 (dispatch +
  F9 resolution), C004 (orchestration/skills), C005 (migration/docs). The
  `REVIEWER_PROFILES_FIELD` constant and the `reviewer-profiles` on-disk key are
  the single source of truth.

## Deviations

- **`ScaffoldTask.reviewerProfiles` not added.** B002 §4/§6 list
  `ScaffoldTask.reviewerProfiles` alongside `ScaffoldSpecInput.reviewerProfiles`.
  Only `ScaffoldSpecInput.reviewerProfiles` is implemented: the phase review task
  is auto-appended and is never a `ScaffoldTask` (review is not in
  `SCAFFOLD_TASK_TYPES`), and B002 §4/F3 rejects extending the per-task grammar,
  so a field on `ScaffoldTask` would be unread dead code. `renderSpecScaffold`
  reads the phase-level list and threads it to `renderReview`. Behaviour matches
  the decided contract (scaffold emits the field; flag threads it); only the
  struct the field lives on differs.
- **Duplicate issue string.** B002 fixes the malformed-entry message but not the
  duplicate-entry one; `'<x>' is listed more than once.` is chosen for the
  existing `field: message` style. No other deviation.
