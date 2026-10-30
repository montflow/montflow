# Memory

## Context

B002 fixes the tooling contract around the phase-directory tree: scaffold paths,
CLI readers, the `migrate` verb, the fixture matrix, the rollout order, and the
skill/doc list. Normative input: A003 §3 and B001 §1–§3.

## Progress

- 2026-10-28: complete. Contract below; no code changed.

## Findings

### 1. Scaffold (`modules/scaffold`)

- `SPEC.md` at the spec root.
- Every task file at `${phase}/${<id>-<name>}/TASK.md` (+ `MEMORY.md`, `GATES.md`
  when gated); the review task at `${phase}/${<phase>099-review-phase}/…`.
- `ScaffoldResult`: `files` paths are phase-prefixed POSIX paths; `phase`,
  `reviewId`, and `taskCount` keep their meaning.
- `ScaffoldReport.dir` and `renderScaffold` keep their shape and list the new
  paths.
- `create` refuses an existing spec and validates reviewer profiles exactly as
  today; no new flag.

### 2. CLI readers (`apps/cli`)

| Reader | Change |
| --- | --- |
| `gatedTaskIds` | read the leaf of `<phase>/<task>/GATES.md`, `parseTaskDirName(leaf)` |
| `summarize` | none — matches `endsWith('/TASK.md')` |
| `renderStatus` phase grouping | none — groups by `phaseOf(task.id)` |
| `next` `inPhase` | none — filters by `phaseOf(task.id)` |
| `renderNext` | none |

The reviews package's `verifySpecProfiles` is unchanged (it matches
`endsWith('TASK.md')`).

### 3. `migrate` contract

- Verbs: `mf-specs migrate --name <spec>` / `--all`, plus `--dry-run` and
  `--dir`. Slash form mirrors it.
- Plan: one move per task directory, `<id>-<name>` → `<phase>/<id>-<name>`,
  phases in `phaseRank` order, task dirs in id order.
- Apply: create the phase directory, then rename the task directory. No file is
  read into memory beyond the snapshot used to plan; contents never change.
- Refusals (exact messages):
  - mixed tree — `Spec '<name>' mixes task directories at the root with phase directories; resolve it by hand.`
  - unexpected root directory — `Spec '<name>' has an unexpected root directory '<dir>'; expected a task directory or a phase directory.`
  - unexpected root file — `Spec '<name>' has an unexpected root file '<file>'; move or remove it before migrating.`
  - no task directories — `Spec '<name>' has no task directories to migrate.`
  - destination exists — `Cannot move '<from>': '<to>' already exists.`
  - unknown spec — the store's `Spec '<name>' not found under <root>.`
- Idempotence: an already-migrated spec that verifies prints `• <name> is already in the phase layout — nothing to migrate.`
  and exits 0. `--dry-run` prints `would move '<from>' -> '<to>'` per line and
  writes nothing; a real run prints `moved '<from>' -> '<to>'`.
- Post-apply: verify the migrated snapshot with `verifySpecTree` and report its
  findings; a non-clean result is a failure, not a silent success.
- `SpecStore` gains `move(root, name, from, to)`: `makeDirectory(parent(to))`
  then `rename`, refusing an existing destination, mapping errors to
  `StoreError` with operation `SpecStore.move`.

### 4. Fixture matrix

| Fixture | Layout | Expected | Owner |
| --- | --- | --- | --- |
| `mock-ok` | phase dirs | 0 issues, state `pending` | C002 moves, D002 audits |
| `mock-complete` | phase dirs | 0 issues, state `complete` | C002 moves, D002 audits |
| `mock-stale` | phase dirs | 1 lifecycle issue, state `inconsistent` | C002 moves, D002 audits |
| `mock-bad` | phase dirs | its documented failure classes, nested fields | C002 moves, D002 updates counts |
| `mock-legacy` | flat | exactly 1 warning (F1), no error | D002 |
| `mock-stray` | phase dirs + stray file in a phase dir + stray directory in a task dir | F4, F6, and the deep-path F8 | D002 |

`fixtures.test.ts` asserts exact fields; `mock-bad`'s field list becomes
`A/A002-explore-thing/MEMORY.md`-style.

### 5. Rollout and gate impact

| Task | Change | `mf:check:specs` | package suite |
| --- | --- | --- | --- |
| C001 | `kind`, directory entries, directory set | green (inert) | green |
| C002 | layout allowlist, F1 warning, four fixtures moved, nested scaffold, `gatedTaskIds` | six warnings, zero errors | green (no fixture asserts a legacy tree) |
| C003 | `migrate` verb | green | green |
| D001 | migrate six repository trees | zero warnings | green |
| D002 | legacy + stray fixtures, README matrix | green | green |
| D003 | delete the F1 warning branch | green | green |
| D004 | skills, packaged copies, docs | green | green |

No task may depend on a red gate. Reviewer availability is not a gate: review
tasks stay pending when no independent reviewer can run, and no execution task
depends on a review task except phase boundaries.

### 6. Skills, payloads, docs

- `.agents/skills/montflow-create-pi-specs/SKILL.md` and
  `packages/specs/skills/montflow-create-pi-specs/SKILL.md`: version `3.0.0`,
  layout section, scaffold step, phase rules, self-check rows, per-level
  allowlist. Both files byte-identical.
- `.agents/skills/montflow-create-pi-specs/CHANGELOG.md` and the packaged copy:
  `## [3.0.0] - 2026-10-28` with the layout break, the `migrate` verb, and the
  allowlist.
- `packages/specs/src/skills/authoring-spec.ts`: layout + allowlist + migrate.
- `packages/specs/src/skills/executing-spec.ts`: "read each phase directory".
- `packages/specs/README.md`: `migrate` in the CLI list; create/structure text.
- `packages/specs/fixtures/README.md`: six-fixture matrix and migrate commands.
- `packages/specs/src/modules/structure/CONTEXT.md`,
  `packages/specs/src/services/spec-store/CONTEXT.md`,
  `packages/specs/src/modules/task/CONTEXT.md`,
  `packages/specs/src/apps/cli/CONTEXT.md` when they describe paths.
- `montflow-find-pi-specs` only if a sentence names a flat path; otherwise
  unchanged (checked in D004).

## Open Questions

- None.

## Handoff

- C002/C003 implement §1–§3; D001–D004 follow §5; D004 consumes §6.

## Deviations

- None.
