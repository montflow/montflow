# Memory

## Context

B003 is the spec-level tier decision. Main already landed a **per-task** `size`
(`tiny|small|medium|large|none`) that buys a dispatch target through
`sizing.json` and a review-cycle budget per phase (tiny 1, small 2, medium 3,
large 3; hard cap 3). Nothing landed for the **spec-level** choice, so a hotfix
and a multi-package refactor are authored with the same ceremony — the two
pre-tier specs in this store grew to 15–17 task directories.

This task decides, once:

1. the tier enum and its one source of truth in code;
2. which decisions belong to the tier and which stay on `size`, with no
   restatement either way;
3. a per-tier contract (phases, exploration, ceilings, gates, review default,
   artifact matrix);
4. a per-tier **user-interaction budget** — the tier file's most important job;
5. the split verdict that replaces a tier above the largest one;
6. where tier instruction files live and how exactly one is loaded;
7. the drift test that fails when the enum, the files, or the authoring skill
   disagree.

It decides no file format owned by B004 (`PHASE.md`, waiver record, board
grammar), no verb signature owned by B005, and no implementation.

Ground read: `.agents/@montflow/profiles/spec-appraiser/PROFILE.md`,
`.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md`,
`.agents/skills/montflow-create-specs/SKILL.md`,
`packages/specs/skills/montflow-create-specs/SKILL.md`,
`.agents/@montflow/prompts/spec-create.json`,
`packages/specs/src/modules/sizing/sizing.module.ts` +
`packages/specs/src/modules/sizing/CONTEXT.md`,
`packages/specs/src/modules/catalogue/CONTEXT.md`,
`packages/specs/src/modules/doctor/{doctor.module.ts,doctor.paths.module.ts,CONTEXT.md}`,
`packages/specs/src/modules/prompt/{CONTEXT.md,tests/prompt.test.ts}`,
`.agents/@montflow/specs/spec-optimizations/SPEC.md` (the sizing decisions),
and this spec's `SPEC.md` requirements + C004/C006 task records.

## Progress

- 2026-11-02: read the appraiser/creation profiles, the authoring skill and
  prompt, the sizing and catalogue modules, the doctor payload paths, the prompt
  test that currently forbids tier prose, and the `spec-optimizations` sizing
  contract. Decided all seven items and wrote them below.
- 2026-11-02: self-checked against `TASK.md` Completion and the receipt list.
  No `GATES.md` exists in this task directory (see Deviations).

## Findings

### F1 — The enum: `micro`, `standard`, `full` (three tiers, no default)

**One source of truth in code:** a new pure module

- `packages/specs/src/modules/tier/tier.module.ts`
- `packages/specs/src/modules/tier/CONTEXT.md`
- exported from `packages/specs/src/modules/index.ts` as `Tier`

```ts
export const TIERS = ['micro', 'standard', 'full'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_HINT = TIERS.join(', ');
/** A verdict kind, never a tier value. `isTier(SPLIT)` is false. */
export const SPLIT = 'split';
export const isTier = (v: string): v is Tier => TIERS.some((t) => t === v);

export interface TierContract {
  readonly tier: Tier;
  readonly minPhases: number;
  readonly maxPhases: number;
  readonly maxTasks: number;          // work tasks, excludes the review task
  readonly maxTasksPerPhase: number;  // work tasks, excludes the review task
  readonly exploration: 'forbidden' | 'optional' | 'required';
  readonly gate: 'command-per-task' | 'per-task' | 'phase-and-task';
  readonly review: 'waived' | 'required';
  readonly waiver: 'permitted' | 'records-only' | 'forbidden';
  readonly interaction: number;       // max ask_user calls in one creation run
  readonly grilling: 'forbidden' | 'not-loaded' | 'required';
  readonly artifacts: ReadonlyArray<TierArtifact>;            // required
  readonly conditionalArtifacts: ReadonlyArray<TierArtifact>; // present only when named
}

export const TIER_CONTRACT: Readonly<Record<Tier, TierContract>> = { /* F3 */ };

/** Data-only: the exact field names a split verdict carries. */
export const SPLIT_FIELDS = ['verdict', 'cut', 'count', 'specs', 'slug', 'tier', 'scope', 'evidence'] as const;

export const CODES = {
  unknownTier: 'tier.unknown',
  missingFile: 'tier.missing',
  staleFile: 'tier.stale',
} as const;
```

`TierArtifact` is a closed union:
`'SPEC.md' | 'PHASE.md' | 'TASK.md' | 'MEMORY.md' | 'GATES.md' | 'review-task' | 'BOARD.md' | 'MAILBOX.md'`.

Rules that make the code the single source:

- No `DEFAULT_TIER`. A missing or unknown tier is an error, never a fallback to
  `standard` — a silent default is how a 17-task spec gets authored as a hotfix.
- `split` is a **verdict kind**, not a member of `TIERS`; `mf-specs tier split`
  fails `tier.unknown`.
- `sizing.json`, `size`, models and efforts never appear in `TierContract`, and
  no tier file may name them (F7 asserts both).
- The tier module owns no I/O. The verb (F6) and the drift test are its only
  consumers with a filesystem.

**Why this is sized by complexity/requiredness, not task count** — the tier is
chosen by a **selection test**; the ceilings in F3 are consequences, not the
definition:

| Tier | Selection test (all must hold) |
| --- | --- |
| `micro` | One concern, one package/module, reversible by revert, no new public contract, no data or schema migration, no security/privacy boundary, no new dependency. A reviewer can verify it by reading the diff. |
| `standard` | One concern, one or two packages; may add a surface *inside* an existing contract; reversible by revert; no cross-package migration. Includes any user-visible requirement even when the diff is small. |
| `full` | More than one package, or a public contract change, or a data/schema migration, or a failure that is not locally reversible, or the design cannot be written without discovery first. |
| above `full` | Two or more **independent concerns** that each pass a tier test on their own. Volume alone never splits: a 40-file mechanical rename in one concern is `full`, not `split`. |

So requiredness raises the tier (`micro` → `standard` for any user-visible
contract), and independence — not size — triggers `split`.

### F2 — Relationship to per-task `size`: disjoint decision lists

The tier is chosen **once per spec**, before any task exists. `size` is chosen
**per task**, while authoring. Nothing may be decided twice.

| Decision | Owner | Values / source |
| --- | --- | --- |
| Tier selection and its selection test | **tier** | `TIER_CONTRACT` + appraiser verdict |
| How many phases the spec has | **tier** | `minPhases` / `maxPhases` |
| Whether exploration exists at all, and whether it is a phase or a task | **tier** | `exploration` |
| Task ceiling (total and per phase) | **tier** | `maxTasks`, `maxTasksPerPhase` |
| Gate expectation (which tasks must carry a gate, mechanical minimum) | **tier** | `gate` |
| Review default and waiver policy per phase | **tier** | `review`, `waiver` |
| How many questions the creation run may ask | **tier** | `interaction` |
| Which artifacts the spec carries (board, mailbox, review task, …) | **tier** | `artifacts`, `conditionalArtifacts` |
| Above-the-largest boundary | **tier** | `SPLIT` verdict (F5) |
| Dispatch target (`provider/model#effort` or `inherit`) | **size** | `sizing.json` layers, `SIZES` |
| Review-cycle budget for a phase (1/2/3, cap 3) | **size** | `REVIEW_CYCLES`, `phaseReviewBudget` |
| `size: none` record opt-out | **size/lifecycle** | `NONE_SIZE`, complete tasks only |
| Which task is `tiny` vs `large` | **size** | author judgment at authoring time |
| Task type (execution / exploratory / planning / defect / review / interruptor) | **neither** | the author, per the task's work |

**Non-restatement rule (mechanical, tested in F7):**

- A tier file states **no** size name (`tiny`, `small`, `medium`, `large`), no
  `size:` key, no `sizing.json`, no `model`, no `effort`, no "review cycle",
  and no review-budget number. Grep-clean.
- The skill's sizing section states **no** tier name and no tier ceiling; the
  skill's tier section states no size name. The two sections are adjacent but
  disjoint.
- `TierContract` has no field that a `Size` could fill; the type is the guard.
- A tier never raises a phase above the size-derived review budget. `full` with
  twelve `tiny` tasks still gets one review cycle per phase.
- `SPEC.md`'s `## Tasks` table gains **no** tier column (same precedent as the
  landed "size is a task-level field, not a table column"):
  `packages/specs/skills/montflow-create-specs/SKILL.md` §5 and
  `spec-optimizations` SPEC requirement at line 99.

**No `tier:` frontmatter field in `SPEC.md` (decision, not omission).** The tier
is not stored in frontmatter and is not validated as a second copy of the enum.
Instead the creation run records it in a `## Creation` body section written by
`init`:

```markdown
## Creation

- tier: standard
- questions 2/2
- unresolved: none
```

`tier` is the appraiser's chosen enum value; `questions <n>/<budget>` is the
creation run's **self-reported** count of `ask_user` calls against the tier
budget (no harness counter exists, so the number is a record, not a measured
bound); `unresolved` names any user-owned decision the run stopped on (or
`none`). `init` writes `tier` and the initial `questions 0/<budget>`; the
creation orchestrator updates the count before it stops. The phase review reads
this section and, when a transcript exists, may flag a mismatch, but it cannot
mechanically verify the number. B004 may add a frontmatter field later; if it
does, it reads through `Tier.isTier` and the same enum.

### F3 — Per-tier contract

| Field | `micro` | `standard` | `full` |
| --- | --- | --- | --- |
| `minPhases`–`maxPhases` | 1–1 | 1–2 | 2–4 |
| `exploration` | `forbidden` | `optional` (at most one exploratory **task**, in the first phase; never a phase of its own) | `required` (a dedicated exploration **phase** is phase A; every later phase `depends-on` it) |
| `maxTasks` (work tasks, excludes review) | 2 | 6 | 12 |
| `maxTasksPerPhase` | 2 | 4 | 6 |
| `gate` | `command-per-task` | `per-task` | `phase-and-task` |
| `review` (default) | `waived` | `required` | `required` |
| `waiver` policy | `permitted` (appraiser may upgrade a phase to `required`, e.g. auth/data) | `records-only` — a phase whose tasks are all `planning`/`exploratory`/`review` may waive, with a recorded reason; enforced by `init`, `waiver`, and `effectiveWaiver` | `forbidden` |
| `interaction` (max `ask_user`) | 0 | 2 | 8 |
| Required artifacts | `SPEC.md`, `PHASE.md`, `TASK.md`, `MEMORY.md`, `GATES.md` | + `review-task` (unless the phase is effectively waived), `BOARD.md` | + `MAILBOX.md` |
| Conditional artifacts | — | `MAILBOX.md` when a phase holds >1 concurrent task | — |
| `grilling` skill | forbidden | not loaded | required |

Gate expectations, stated as the author and reviewer must apply them:

- **`command-per-task`** (`micro`): every task directory has `GATES.md`, and
  every task that changes a file names at least one command. A prose-only gate
  is invalid at this tier; if no command can prove the task, the request was not
  `micro`.
- **`per-task`** (`standard`): every task has `GATES.md` with at least one
  command, or one named subjective check when the task produces no runnable
  artifact (`planning`/`exploratory`/`review`). An empty gate is invalid.
- **`phase-and-task`** (`full`): per-task as above, plus before each phase's
  review round the phase records one mechanical run of the suite that phase
  touches (and the review reads that result). The phase-level stage's on-disk
  shape is B004's to decide; this tier only requires that it exists and is run.

Exploration placement is mechanical at authoring time, not a `check` rule
(there is no stored tier): `full` must have its dedicated exploration phase A;
`micro` must have none; `standard` may hold **at most one** exploratory task and
only in its **first** phase. `init` and `new-task` enforce that with
`exploration-count` / `exploration-placement` failures (B005 F1), so a second
exploratory task or one in a later phase is refused rather than authored.

Artifact matrix (what the creation run may write, per tier):

| Artifact | `micro` | `standard` | `full` |
| --- | --- | --- | --- |
| `SPEC.md` | required | required | required |
| `PHASE.md` | required (1) | required (each) | required (each) |
| `TASK.md` | required | required | required |
| `MEMORY.md` | required | required | required |
| `GATES.md` | required | required | required |
| `review-task` | **absent** (default waiver) | required **unless the phase is effectively waived** | required (declare a reviewer profile when one's focus matches) |
| `BOARD.md` | **absent** | required | required |
| `MAILBOX.md` | **absent** | conditional | required |
| exploratory task / phase | **absent** | optional, 1 task | required phase |
| `sizing.json` | never tier-driven; optional, generated | same | same |

`review-task` and the waiver are one decision, not two. A phase either reviews
or waives: `review: required` carries a review task, and an **effective
waiver** carries none. At `standard` the waiver policy is `records-only` and it
is mechanically checked, not prose: `init`/`new-task`/`waiver` refuse
`--review <PHASE>:waived` when any task in the phase is `execution`, `defect`,
or `interruptor`, and `effectiveWaiver` re-applies the same predicate on every
read. `micro`'s waiver is `permitted` and **exempt from the `records-only`
predicate**: the appraiser may waive any `micro` phase by default and may
upgrade an auth/data phase to `required` (a waiver is never forced). `full`
never waives. A standard phase that legitimately touches no code and no record
can therefore waive without also owing a review task; a phase with work in it
cannot waive at all. No tier may produce a phase that is both waived and holds a
review task.

The default `micro` tree (`init` writes one `A:implement:execution:medium` task
with the review waived) therefore derives a lock once that task closes and its
gate is proven: the waiver is `permitted` regardless of the task's
`execution` type, and no review task is needed. C005 records this as the
`micro`-locks test so the lowest tier cannot regress into "never locks".

Consequences the appraiser's phase plan must respect (or the verdict is
invalid): fewer phases than `minPhases`, more than `maxPhases`, more than
`maxTasksPerPhase` in a phase, more than `maxTasks` total, or a tier plan whose
work tasks exceed the ceiling → **re-appraise and emit `split`** (F5), never
"just this once".

Ceilings are **authoring-time tripwires, not `check` errors**. There is no
stored tier (F2), so the verifier cannot know the ceiling; the author checks
before scaffolding and the phase review checks the authored shape. Hitting a
ceiling means the estimate was wrong: re-appraise, then split only if the work
holds independent concerns.

### F4 — User-interaction budget (the tier file's most important job)

One unit: **one `ask_user` call**. `notify_user` is never a question and never
counts. A question offering options still counts once. There are no exceptions
— not for a confirmation, not for a tool failure, not for a naming collision.

| Tier | Budget | Skill | Allowed topics | Required topics |
| --- | --- | --- | --- | --- |
| `micro` | **0** | none | none — the run never calls `ask_user` | — |
| `standard` | **2** | none | scope boundary, naming, acceptance, or a real ambiguity the appraiser flagged | — |
| `full` | **8** | `grilling` (full interview sequence) | as above, plus non-goals, reviewer-profile choice, phase split | scope boundary, acceptance, non-goals, phase split, and which phases may waive review |

Rules the tier files state in prose, and the prompt repeats:

- **`micro` asks nothing.** If the request cannot be tiered and authored without
  a user decision, it is not `micro`: the appraiser must choose `standard`, or
  the author **stops and reports** the question in the final line instead of
  calling `ask_user`. "Almost none" is literally zero.
- **One at a time.** Every tier that may ask follows the `grilling` rule: one
  question, wait, then the next.
- **Look up, don't ask.** Facts about the repo are read, never asked at any tier.
- **At the cap, stop — do not guess.** A run that exhausts its budget without a
  shared understanding stops and reports `questions <n>/<budget>` plus the
  unresolved decisions. It never authors around a user-owned decision.
- **The creation run records the count in `SPEC.md`, self-reported:** `init`
  writes a `## Creation` section with `tier: <value>` and `questions
  0/<budget>`, and the creation orchestrator updates `questions <n>/<budget>`
  (plus any unresolved decision) before it stops. No harness counter exists, so
  the number is self-reported and the budget is **advisory** beyond the
  instruction and the phase review; the review reads the section and may flag a
  mismatch when a transcript exists, but it cannot mechanically verify the
  count (F7 keeps only the *numbers* in the tier files mechanically in sync).
- Authoring writes stay inside `.agents/@montflow/specs/`, so no creation step
  is destructive enough to buy an out-of-budget confirmation at any tier.

Rationale for the numbers: 0 / 2 / 8 is a strict gradient with a factor of two
between adjacent tiers, and 8 is the largest interview that still finishes in
one seated session while the `grilling` skill resolves a decision tree. The
numbers are tunable constants — changing one is one enum edit plus one file edit
plus one skill-table edit, and the drift test keeps them equal.

### F5 — Above the largest tier: the split verdict (exact shape)

The appraiser emits this **instead of** a tier. Exact fields (also in
`Tier.SPLIT_FIELDS`), no extra keys:

```
verdict: split
cut: <one sentence: the seam the split follows, e.g. "packages/specs versus packages/profiles">
count: 3
specs:
  1. slug: <kebab-name>
     tier: <micro|standard|full>
     scope: <one sentence: what this spec owns, and what it does not>
  2. slug: <kebab-name>
     tier: <micro|standard|full>
     scope: <one sentence>
  3. slug: <kebab-name>
     tier: <micro|standard|full>
     scope: <one sentence>
evidence: <the reads, and the two facts that forced the split>
```

Validity rules, checkable from the verdict text alone:

1. `verdict` is exactly `split`; the verdict carries **no** `tier`, no
   `phases`, no per-phase review decision, and no gate list — those belong to
   each part's own authoring run.
2. `count` is an integer ≥ 2 and equals the number of `specs` entries.
3. Every `slug` is kebab-case, unique, and not an existing spec name.
4. Every `tier` is an enum value. **No nesting:** a proposed part that would
   itself exceed `full` means the cut is wrong — cut again until every part fits.
   `tier: split` is never valid.
5. `cut` names a repository seam (package, module, or phase boundary), not a
   count ("split into three" is not a cut).
6. `evidence` keeps the appraiser's 10-read budget and lists the two facts that
   forced the split.

Behaviour on receipt: the creation orchestrator **authors nothing**. It reports
the proposal (`split · count <n> · cut <seam>`) and stops; each part is its own
authoring run with a request that names the parent cut. This preserves the
landed rule "create exactly one spec per invocation"
(`.agents/@montflow/prompts/spec-create.json` step 2). The appraiser's own
profile already says "Anything above the largest supported tier is **not a
tier**: emit `split` with the boundary you would cut and the number of specs it
implies"; B003 fixes the shape that sentence left open.

### F6 — Where the tier files live, and how exactly one is loaded

Canonical package payload — one file per enum value, **no other files** in the
directory:

```
packages/specs/tiers/micro.md
packages/specs/tiers/standard.md
packages/specs/tiers/full.md
```

Installed by `mf-specs doctor` (payload kind `tier`, alongside `skill`,
`profile`, `prompt`; C004 already names tier files in its manifest):

```
.agents/@montflow/tiers/micro.md
.agents/@montflow/tiers/standard.md
.agents/@montflow/tiers/full.md
```

Path helpers live with the other payload identities in
`packages/specs/src/modules/doctor/doctor.paths.module.ts`:
`shippedTierDir`, `shippedTierFile(name)`, `installedTierDir(root)`,
`installedTierFile(root, name)`, and `SPEC_TIER_NAMES = TIERS`
(re-exported by the tier module; doctor imports the enum, never a second list).
`SPEC_PROMPT_NAMES` is unchanged: tier files are a separate kind, not prompts.

Tier file shape (flat keys, so the existing
`packages/specs/src/modules/frontmatter/frontmatter.module.ts` parser reads it
with no extension):

```markdown
---
tier: standard
phases-min: 1
phases-max: 2
tasks-max: 6
tasks-per-phase-max: 4
exploration: optional
gate: per-task
review: required
waiver: records-only
interaction: 2
grilling: not-loaded
artifacts:
  - SPEC.md
  - PHASE.md
  - TASK.md
  - MEMORY.md
  - GATES.md
  - review-task
  - BOARD.md
conditional-artifacts:
  - MAILBOX.md
---

# Tier: standard

<prose: selection test, phase plan, exploration rule, gate expectation, review
default and waiver, artifact rules, and the sentence "This run may ask at most
2 questions.">
```

**Loading exactly one, unambiguously:**

- Single interface: `mf-specs tier <tier>` — one positional enum value, no
  default, no `--all`, no `--file` variant, no directory listing. It prints the
  installed file body verbatim and nothing else. Inside the host:
  `/specs tier <tier>` and the `spec_tier` tool with `{ tier }`.
- It validates against `Tier.isTier` before reading: unknown → exit non-zero
  `tier.unknown`, expected `micro, standard, full`. Missing installed file →
  `tier.missing` with fix `mf-specs doctor`. Stale bytes vs the package payload →
  `tier.stale` with the same fix.
- The `spec-create` prompt and `spec-creation-orchestrator` profile name that
  verb and add the hard rule: *load exactly the tier the appraiser named, exactly
  once; never list the tiers directory, never read a path directly, never load a
  second tier, never proceed from memory of another spec's tier.*
- The prompt already gates on `mf-specs doctor` before rendering
  (`packages/specs/src/modules/prompt/CONTEXT.md`), and doctor will now cover
  tier files, so a missing tier payload fails the run before any artifact is
  written — not halfway through authoring.
- `mf-specs create` gains **no** `--tier` flag: the scaffold is mechanical and
  tier-agnostic; extra phases come from `new-phase` (B005), whose count and
  artifacts the tier file dictates.

The appraiser does **not** load a tier file. It chooses from the enum table in
`montflow-create-specs`; only the authoring run loads the chosen file, which is
why the skill table and the files must agree (F7).

### F7 — The drift test

**Location:** `packages/specs/src/modules/tier/tests/drift.test.ts`, one
`Vitest.describe('tier drift')` block with one `it` per comparison below.
**Runs:** `bun run test` (the package test suite, already the CI unit gate) and
therefore `bun run mf:gate`. Installed-byte drift is a **second** gate:
`bun run mf:check:specs` runs `mf-specs doctor --check`, which compares every
installed `.agents/@montflow/tiers/<tier>.md` byte-for-byte with the package.
The compiled-binary payload is the **third**: extend
`packages/specs/src/modules/doctor/tests/embedded-payload.test.ts` with
`EMBEDDED_TIER_PAYLOAD`, which already fails on regeneration drift.

What it compares, exactly — enum ↔ files ↔ prose, three legs:

| Leg | Assertion | Failure message it must produce |
| --- | --- | --- |
| enum ↔ file set | Stems of `packages/specs/tiers/*.md` equal `TIERS` as sets; the directory holds only `<tier>.md` files; each file's frontmatter `tier:` equals its stem | `tiers missing: full` / `tiers extra: hotfix` / `tier file name mismatch: standard.md says micro` |
| enum ↔ file contract | For each tier, the frontmatter's `phases-min`, `phases-max`, `tasks-max`, `tasks-per-phase-max`, `exploration`, `gate`, `review`, `waiver`, `interaction`, `grilling` equal `TIER_CONTRACT[tier]` field-by-field; `artifacts` and `conditional-artifacts` equal the contract's arrays element-for-element | `tier drift standard.tasks-max: file 8, code 6` / `tier drift full.grilling: file required, code not-loaded` |
| enum ↔ file prose | Each file body contains the exact sentence `This run may ask at most <interaction> question(s).` so the prose cannot state a different budget from the frontmatter | `tier prose drift full: file says 10 questions, code says 8` |
| enum ↔ authoring skill | In `packages/specs/skills/montflow-create-specs/SKILL.md`, the tier table has exactly one row per enum value and no other row, with the exact column order `Tier`, `Phases`, `Exploration`, `Tasks`, `Review`, `Questions`; each row's tier, phase range, exploration, task ceiling, review default and question count match the contract | `skill drift: no row for full` / `skill drift: full questions 10, code 8` |
| enum ↔ appraiser/authoring text | The package `spec-appraiser` profile and `spec-create` prompt contain every `SPLIT_FIELDS` token, contain every `TIERS` value, and contain the load verb `mf-specs tier`; neither enumerates a tier matrix (no table row keyed by a tier name) — the matrix lives only in the skill | `split verdict drift: field 'count' missing from spec-appraiser` |
| non-restatement | No tier file contains any of the four size words, `size:`, `sizing.json`, `model`, `effort`, or `review cycle` (word-boundary, case-insensitive); no tier name appears in the skill's sizing section; `isTier('split') === false` and `'split'` is absent from `TIERS` | `tier file micro names a size: medium` |

Hygiene: one `it` per leg, so a failure names the leg. The test reads package
files by path resolved from `import.meta.dirname` (the `doctor` module's
`packageRoot` pattern), never fixture copies; no environment or network. It does
not read `.agents/@montflow/tiers/` — that is doctor's job, and keeping the two
apart is what stops the test and the installer from agreeing on the wrong bytes.

The `SPEC.md` `## Creation` record (F2/F4) is not a tier-file drift leg: `init`
writes `tier` and `questions 0/<budget>`, the creation orchestrator updates the
self-reported count, and the phase review (B099) reads it as an advisory record
and may flag a mismatch when a transcript exists. The drift test keeps the enum,
files, and skill table equal; it does not read a spec record.

The skill half of the test is the piece that makes this a *drift* test rather
than a schema test: the skill is where the appraiser learns the enum, so if the
enum gains a value or a budget moves and the skill table does not, the test goes
red.

### F8 — Conflicts with landed work, and who wins

| Landed | Says | B003 wins because |
| --- | --- | --- |
| `packages/specs/src/modules/prompt/tests/prompt.test.ts:89-90` | the rendered `spec-create` text must **not** contain `complexity tier` or `spec-appraiser` | SPEC requirements 73–75 and C006's description require tier selection in the v2 prompt. C006 rewrites the prompt and inverts these two assertions to require the tier step and the verb. |
| `packages/specs/prompts/spec-create.json` (and installed copy `.agents/@montflow/prompts/spec-create.json`) | no appraiser, no tier, "Step 4: size every task" only | C006 rewrites it: step 1 dispatches the appraiser, step 2 loads `mf-specs tier <tier>`, the sizing step stays byte-compatible with the landed size contract. Canonical copy is the package file; doctor re-installs. |
| `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md:33-36` | names only `micro`; "Load the tier's instruction file" with no path or verb | C006 rewrites step 4 to the `mf-specs tier <tier>` verb and all three tiers. The profile is the orchestrator; the enum is code. |
| `.agents/@montflow/profiles/spec-appraiser/PROFILE.md:44-45` | verdict field 6 "Interaction budget — how much the creation orchestrator may grill the user at this tier" | that restates the tier file. Field 6 is deleted; the verdict names the tier and the tier derives the budget. C006 applies it and adds the exact split fields (F5). |
| `packages/specs/skills/montflow-create-specs/CHANGELOG.md` / skill v2.11.0 | documents sizes and review budgets only | additive: the skill gains a disjoint tier section (F2 non-restatement) and a minor version bump; the size section is untouched. |
| `spec-optimizations` SPEC lines 97–102, 116–118 | four sizes, layered `sizing.json`, `inherit`, the size review budget | fully kept. B003 changes none of it; the tier never touches a model, effort, target, or review cycle. |
| `spec-optimizations` SPEC line 99 | `SPEC.md`'s task table keeps its columns; size is not a column | kept and extended by analogy: tier is not a column either (F2). |
| `.agents/@montflow/specs/spec-optimizations/*` historical records | prose mentions of tiers | frozen complete records; never edited. |

### F9 — Deliberately not decided here

- `PHASE.md` fields, the review-waiver record, board/mailbox grammar, `SPEC.md`
  version semantics — **B004**. B003 only requires that a waiver record exists
  so `micro`'s default-waived phase can lock, and that `BOARD.md`/`MAILBOX.md`
  may be absent.
- Verb arguments beyond `tier`, payload-manifest mechanics, report-only parity —
  **B005/C004/C005**.
- The tier files' prose — **C006** writes it to the F3/F4 contract; B003 fixes
  only the frontmatter keys and the numbers.
- Any product-code change — none in Phase B.

## Open Questions

1. **Tier count and names are the user's call; default taken: `micro`,
   `standard`, `full`.** Two alternatives exist and neither changes any other
   decision: (a) add a fourth tier between `standard` and `full` (a
   multi-phase, single-package "large feature"), which moves the `full` split
   boundary up one step; (b) rename `full` to `program`/`initiative` for
   distance from "full review". Default stays three tiers because the split
   verdict already absorbs the top end, and three files are three places to
   drift, not four. Recorded, not blocking: C006 implements the default and a
   rename is one enum edit plus three file renames plus the drift test.
2. **The question budgets (0/2/8) are a product judgment, not a mechanical
   truth.** Default taken: 0 / 2 / 8. If the user wants standard to feel more
   collaborative, 3 is the natural alternative; the drift test makes the change
   a three-line edit. Recorded, not blocking.

## Handoff

**B004 (standard v2) must honour, not re-decide:**

- A phase may carry no review task. `micro`'s default is waived, so the waiver
  record B004 defines is the only thing that can lock a `micro` phase. If B004
  ships no waiver record, `micro` is not authorable and the appraiser must fall
  back to `standard` — B003's default is not negotiable into "a micro phase
  never locks".
- `micro` has no `BOARD.md` and no `MAILBOX.md`; `standard` has no `MAILBOX.md`
  unless a phase runs concurrent tasks. The board/mailbox rules must permit
  absence, not require the files.
- `PHASE.md` is required at every tier, including `micro` (one phase, one file).
- `full` requires a phase-level mechanical stage before each review round; the
  on-disk shape of that stage is B004's, the requirement is B003's.
- `full` is 2–4 phases with exploration as phase A, so phase ids and
  `depends-on` must support a later phase depending on the exploration phase.
- Do **not** add a `tier:` field in this wave (F2). If you do, read it through
  `Tier.isTier` and accept absence as legacy.

**B005 (tooling) must implement, not re-decide:**

- One read verb: `mf-specs tier <tier>` → prints the installed
  `.agents/@montflow/tiers/<tier>.md` body, validates against `Tier.TIERS`,
  fails `tier.unknown` / `tier.missing` / `tier.stale`, and has no default and
  no multi-tier form. Host forms `/specs tier <tier>` and `spec_tier { tier }`.
- `init` writes the `## Creation` record (`tier: <value>`, `questions 0/<budget>`,
  `unresolved: none`) and validates the tier contract (F3), including
  `standard`'s single-exploratory-task-in-the-first-phase limit and `micro`'s
  waiver exemption from `records-only`; the creation orchestrator updates the
  self-reported question count before stopping.
- `new-phase` is how a `standard`/`full` spec grows past the scaffold's one
  phase; `create` gains no `--tier` flag.
- Tier files are a payload kind in the C004 manifest with the paths in F6;
  `doctor --check` compares bytes.
- The tier module is a pure module exported as `Tier` from
  `packages/specs/src/modules/index.ts`, with no I/O. The verb and the test are
  its only filesystem consumers.
- Anything a verifier checks has a generator: the verb is that generator for
  tier loading; there is no tier mutation verb because no state stores a tier.

**C001 (version and structure):** do not add a `tier` field or touch tier
vocabulary. The enum and the tier payload land in C005/C006.

**C004 (payload manifest):** add artifact kind `tier` with package dir
`tiers/` and install dir `.agents/@montflow/tiers/`, one file per `TIERS` value,
report-only parity, and the stale/missing messages naming the artifact and
`mf-specs doctor`.

**C005 (state verbs):** create `packages/specs/src/modules/tier/` from F1, wire
`tier <tier>` per F6, and add `shippedTierDir`/`installedTierDir`/
`installedTierFile`/`SPEC_TIER_NAMES` to `doctor.paths.module.ts`.

**C006 (ship artifacts):** write the three tier files to F3/F4 (frontmatter keys
exactly as F6), rewrite the `spec-appraiser` profile to drop field 6 and carry
the F5 split shape verbatim, rewrite `spec-creation-orchestrator` step 4 to the
verb, rewrite `spec-create` to appraise → load tier → author to the tier, keep
the sizing section intact, add the disjoint tier table to the authoring skill,
and land the F7 drift test plus the embedded-payload extension. Update
`prompt.test.ts:89-90` to require the tier step. Version bumps/changelogs where
behaviour changes.

**B099 (review):** judge (a) no tier number restates a size decision, (b) every
tier file's frontmatter matches the table in F3 and the `TierContract` including
`grilling`, (c) the split shape is implementable from F5 alone, (d) the drift
test compares all six legs in F7, (e) `micro`'s waiver dependency on B004 is
stated, not assumed, and (f) `SPEC.md`'s `## Creation` section is written by
`init` and carries `tier`, the self-reported `questions <n>/<budget>`, and
unresolved decisions (advisory; no harness counter).

**B004/B005 can consume F2, F5 and F6 without re-litigating:** F2 fixes the
ownership split, F5 is the full verdict grammar, F6 is the file paths plus the
single load interface. Anything not in those three is explicitly another task's.

## Deviations

- **No `GATES.md` in this task directory.** The task is `type: planning` and the
  dispatch said its gate is a decision checklist with no commands, but no
  `GATES.md` file exists on disk. I self-checked against `TASK.md` `## Completion`
  and the receipt list instead of creating a gate file I do not own. Flagged for
  the orchestrator; no files were added.
- **No `BOARD.md` broadcast** — the phase has no board file, and this run may
  write only its own `MEMORY.md`.
- **No timestamp or status change.** No CLI stamp verb exists for a planning
  record; the Progress lines carry the environment date only.
- **Nothing outside this task directory was touched.** No `SPEC.md`, no status,
  no lock, no sibling record.
