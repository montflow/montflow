# Memory

## Context

The store's completed records did not confirm their own status: 135 unchecked
completion findings and 78 all-unchecked gates across the historical specs. Both
checks were warnings, which hid the contradiction. This task hardened them into
errors and retrofitted every completed record so the store is green.

## Progress

- 2026-11-02: complete. `task.completion-unchecked` and `gate.unchecked` are
  errors on a `complete` task and silent on an unfinished one; all 222 complete
  tasks were swept; 182 completed records gained `size: none`; the tests, shipped
  skill, three prompts, README, CONTEXT docs, and doctor payload describe the new
  severities and the `none` opt-out.
- 2026-11-03: re-audited the 23 gate items the first sweep left unchecked: 7
  were ticked from a fresh command/PR/tree read and are included in the 430
  checked items; 16 are retired at HEAD with a per-item note in their task
  `MEMORY.md`. Totals for this retrofit's gate scope: 430 checked + 16 retired =
  446; 0 tasks reopened.

## Findings

### Code

- `packages/specs/src/modules/task/task.module.ts` — `verifyTaskCompletion`
  no longer sets `severity: 'warning'`; the finding defaults to an error. The
  rule still returns no finding for any status other than `complete`.
- `packages/specs/src/modules/gates/gates.module.ts` — `verifyGateProgress`
  no longer sets `severity: 'warning'` and now returns `valid: false` with the
  error finding (it previously returned `valid: true`, which no consumer read).
- `size: none` needed no code change: B001 already accepts it only on a
  `complete` task (`task.size-none-unfinished` otherwise), `sizeOf` returns
  `undefined` for `none`, and `taskTarget` resolves `inherit` with a zero review
  contribution. The existing tests already pin both.
- Tests: `verify-task-file.test.ts` now asserts `valid: false` and an
  error-severity finding for a complete task with an unchecked item, and silence
  for `pending`/`in-progress`/`blocked`. `gates.test.ts` asserts `valid: false`
  for a complete all-unchecked gate and silence for an unfinished one. The CLI
  integration test (`check.test.ts`) now has a complete-task error case and a
  matching unfinished-task pass case for both codes.
- Docs: `packages/specs/README.md`, task/gates/structure CONTEXT files, the
  `montflow-create-specs` skill (2.11.0 + changelog), `spec-create` and
  `spec-execute` prompts, and the regenerated embedded payload.

### Retrofit method

For each complete task with an unchecked completion item, the item was checked
only when this task's `MEMORY.md`, a commit message, a PR body, or the current
tree evidenced it. For a completed task with an all-unchecked gate, items were
checked against the task's own recorded gate run or the current tree; the
command and result for the store-wide re-run are recorded in that task's
`MEMORY.md` under `## B002 retrofit evidence`.

Per-spec record (`size: none` = complete tasks given the opt-out; `Gate items` =
gate checkboxes this retrofit ticked, including the 2026-11-03 re-audit ticks):

| Spec | Complete | `size: none` | Completion items | Gate tasks | Gate items |
| ---- | -------: | -----------: | ---------------: | ---------: | ---------: |
| cli-version-awareness | 16 | 16 | 4 | 0 | 0 |
| installation-guide | 12 | 12 | 25 | 0 | 0 |
| model-fallback-alignment | 4 | 4 | 16 | 2 | 23 |
| montflow-ci-verification | 16 | 16 | 0 | 5 | 16 |
| montflow-multi-reviewer | 14 | 14 | 18 | 0 | 0 |
| montflow-opencode-migration | 24 | 24 | 37 | 7 | 40 |
| montflow-phase-directories | 24 | 24 | 0 | 0 | 0 |
| montflow-project-structure | 20 | 20 | 19 | 7 | 31 |
| montflow-references-plugin | 26 | 26 | 66 | 13 | 97 |
| montflow-references-tui | 0 | 0 | 0 | 0 | 0 |
| montflow-spec-completion-gate | 3 | 3 | 0 | 0 | 0 |
| montflow-spec-standard | 6 | 5 | 15 | 2 | 10 |
| plugin-host-integration | 18 | 18 | 21 | 11 | 44 |
| spec-optimizations | 39 | 0 | 196 | 31 | 169 |
| **Total** | **222** | **182** | **417** | **78** | **430** |

The 430 gate items are those this retrofit ticked; the 16 re-audited items that
stay unchecked because their command/claim is retired bring the retrofit's own
scope to 446 (430 checked + 16 retired). Items already checked before the
retrofit are outside this count.

- Reopened: **0**. Every completion item was evidenced. Ten tasks had an empty
  template `MEMORY.md`; each was evidenced from its commit or PR and the evidence
  is now recorded in that task's `MEMORY.md`.
- `size: none` was given only where a complete task had no size. No existing
  real size was changed. No `size: none` was given to an unfinished task.

### Gate re-audit (2026-11-03)

The first sweep left 23 gate items unchecked in complete tasks with a blanket
"no longer true at HEAD" rationale. That rationale was wrong for several of them;
this re-audit ran or read each item and corrected the record.

- **7 ticked with evidence:** E002's spec check (command run: `1 spec · 0
  failed · 0 issues`, exit 0); F002's four PR items (`gh pr view 9`: title
  `feat(references): migrate the reference registry to @montflow/references`,
  body migration + verification sections, 32/32 `Verify` checks `SUCCESS` on
  head `c1fb22f5`); C004's failing-pre-push item (that task's MEMORY records
  a real scratch-clone `git push` blocked by the hook); and C001's module-rule
  ownership item (the workspace copy
  `.agents/skills/montflow-typescript-project-structure/SKILL.md` names an
  owner on every module law).
- **16 retired, not ticked:** the literal command or claim genuinely no longer
  exists or runs at HEAD. Each carries a per-item `## B002 gate retirement
  notes` section in its own task `MEMORY.md`: C002 (2 — `verify:montflow*`
  scripts renamed to `mf:gate*`), C007 (1 — `verify:montflow` → `mf:gate`), C003
  (2 — the workflow also runs on pull_request/merge_group/workflow_dispatch, and
  the broken-artifact cell was not re-run), D002 (1 — `INSTALL.md` deleted by
  the installation-guide spec), E003 (2 — the per-package README/CONTEXT
  scoped-command claim is not true at HEAD), F001 (1 — the historical merge +
  clean-status claim is not reproducible; the per-conflict resolutions are
  enumerated in that task's `MEMORY.md`), and the seven
  `montflow-project-structure` skill-schema commands (the `packages/pi-skills`
  path and bare skill names were retired; each replacement now runs as
  `bun run --cwd packages/skills cli verify montflow-… --dir "$PWD"` and returns
  `1 skill · 0 issues` / `46 skills · 0 issues`, exit 0).
- **Partial checks are intentional.** `gate.unchecked` fires only when *every*
  item is unchecked, so a completed gate may carry a retired item beside
  evidenced ones. The store-level check is green; the retirement note is the
  evidence for the unchecked box.
- **Completion item 4 (amended):** "every completed gate item is either checked
  against evidence or carries a per-item retirement note naming the retired
  command and its replacement; no task is reopened solely because a historical
  command was retired. A tick always needs evidence." This is met: 430 items are
  ticked from a run/PR/tree read (including the 7 re-audit ticks) and 16 are
  unchecked because their command/claim is retired at HEAD, each with its own
  note; no task was reopened, and no item was ticked without evidence. The
  retirement note is the evidence for the unchecked box, not a substitute for a
  tick.

Tasks that received `size: none` (all already `complete`):

- cli-version-awareness: A001, A002, A099, B001, B002, B099, C001, C002, C099, D001, D002, D003, D099, E001, E002, E099
- installation-guide: A001, A002, A099, B001, B002, B003, B004, B099, C001, C002, C003, C099
- model-fallback-alignment: A001, A002, A003, A099
- montflow-ci-verification: A001, A002, A003, A004, A099, B001, B002, B099, C001, C002, C003, C004, C005, C006, C007, C099
- montflow-multi-reviewer: A001, A002, A003, A099, B001, B002, B003, B099, C001, C002, C003, C004, C005, C099
- montflow-opencode-migration: A001, A002, A003, A004, A005, A006, A099, B001, B002, B003, B004, B005, B006, B099, C001, C002, C003, C004, C005, C006, C007, C099, D001, D099
- montflow-phase-directories: A001, A002, A003, A099, B001, B002, B099, C001, C002, C003, C099, D001, D002, D003, D004, D099, E001, E002, E003, E004, E099, F001, F002, F099
- montflow-project-structure: A001, A002, A003, A004, A005, A099, B001, B002, B099, C001, C002, C003, C004, C005, C006, C007, C008, C009, C010, C099
- montflow-references-plugin: A001, A002, A003, A099, B001, B002, B003, B099, C001, C002, C003, C004, C005, C006, C007, C099, D001, D002, D099, E001, E002, E003, E099, F001, F002, F099
- montflow-spec-completion-gate: A001, A002, A099
- montflow-spec-standard: A001, A002, A003, A004, A099
- plugin-host-integration: A001, A099, B001, B099, C001, C002, C003, C004, C005, C099, D001, D002, D099, E001, E002, E003, E004, E099
- montflow-references-tui and spec-optimizations: none (no unsized complete task)

### Record-level evidence used

- `montflow-references-plugin` F001 item 3 ("every conflict
  resolution recorded with its reason") had no surviving MEMORY. It was
  reconstructed in this task from the branch history and is now an enumerated
  per-conflict table in `F001-pull-and-reconcile/MEMORY.md` (merge, file, and
  the side kept): `d6949f49` and `89bae631` had no textual conflict hunks;
  `78707bc8` resolved seven files, `71f471c7` eight, and `fa28c834` five, with
  `0791dce3` removing the conflict markers that merge accidentally committed in
  `plugin-loader.test.ts`. This is a retrofit record, not a claim about the
  original worker's notes.
- `montflow-references-plugin` F002 items 2–3 were evidenced from `gh pr view 9`:
  32/32 Verify checks `SUCCESS` on the head commit and a `Spec:
  montflow-references-plugin` trailer with no separate issue.
- Review phases with empty MEMORY were evidenced from commit bodies:
  `f1f063aa` (multi-reviewer A/B reviews closed), `c8d7173a` and `7961378b`
  (spec-optimizations phases A–C locked, A–H complete), `f55efe47` /
  `a05983fe` (references D), and `1300bb9d` (references E/F reviews closed,
  phases A–F locked).

## Gates

All commands run from the repo root on 2026-11-02; the gate re-audit and the
package test count were refreshed on 2026-11-03.

### `bun run mf-specs:check`

Exit code: 0.

```
$ bun run src/apps/cli/main.ts check --dir /home/daniel/dev/montflow/spec-standard
14 specs · 0 failed · 0 issues
$ bun run src/apps/cli/main.ts doctor --check --dir /home/daniel/dev/montflow/spec-standard
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-sizing.json
```

Before the retrofit the same command reported
`14 specs · 0 failed · 0 issues · 395 warnings`; the three record codes
(`task.completion-unchecked`, `gate.unchecked`, `task.missing-size`) are gone.

### `bun run mf:check`

Exit code: 0. Key output:

```
46 skills · 0 issues
5 prompts · 0 issues · 0 warnings
14 specs · 0 failed · 0 issues
12 profiles · 0 issues · 0 warnings
doctor: ok
0 files · 0 issues
✓ no live Pi-era names (1894 files).
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
```

### `bun run ts:check`

Exit code: 0.

```
 Tasks:    16 successful, 16 total
Cached:    13 cached, 16 total
```

### `bun run lint:check`

Exit code: 0.

```
@montflow/specs:lint:check: Found 0 warnings and 0 errors.
 Tasks:    16 successful, 16 total
```

### `bun run fmt:check`

Exit code: 0.

```
 Tasks:    16 successful, 16 total
Cached:    15 cached, 16 total
```

### `bun run --cwd packages/specs test`

Exit code: 0.

```
 Test Files  100 passed (100)
      Tests  1393 passed (1393)
Type Errors  no errors
```

### `bun run test`

Exit code: 0.

```
 Tasks:    16 successful, 16 total
Cached:    0 cached, 16 total
```

### Target behaviour

```
$ bun run --cwd packages/model-fallback test        # exit 0 — 66 files / 361 tests
$ bun run --cwd packages/model-fallback ts:check    # exit 0
$ bun run --cwd packages/model-fallback lint:check  # exit 0
$ bun run --cwd packages/model-fallback format:check # exit 0
```

## Open Questions

- Sixteen gate items remain unchecked because their literal command or claim is
  retired at HEAD (`verify:montflow*` renamed to `mf:gate*`, `INSTALL.md`
  deleted, `packages/pi-skills` and the bare skill names renamed, per-package
  README scoping not present, the CI trigger widened, the historical merge claim
  not reproducible). Each carries a per-item retirement note naming the retired
  command or claim and its replacement in its own task `MEMORY.md`; the amended
  completion item records this branch, so no task is reopened solely for a
  retired historical command.
- `montflow-references-plugin` F001 item 3 is recorded from branch history as a
  per-conflict table in that task's `MEMORY.md` because the original worker left
  no conflict-resolution note. If the orchestrator wants the original record
  rather than a reconstruction, that is a reopen decision.

## Handoff

- The store is green at 0 issues and 0 warnings. A completed task with an
  unchecked completion item or an all-unchecked gate now fails the check; use
  `size: none` for a historical completed task with no real size.
- `size: none` remains a record opt-out only: `sizeOf` yields `undefined`, the
  task resolves `inherit`, and it contributes zero review budget.

## Deviations

- Regenerated `packages/specs/src/modules/doctor/embedded-payload.generated.ts`
  and repaired the installed skill/prompt mirrors with `mf-specs doctor`; the
  package files are canonical.
- Bumped the shipped `montflow-create-specs` skill to 2.11.0 with a changelog
  entry; version was `2.10.0` after B001's uncommitted edits.
- Did not commit or push, per the working-tree instruction.
- No task `status:` was written; no spec or phase record outside the
  authorisation was edited.
