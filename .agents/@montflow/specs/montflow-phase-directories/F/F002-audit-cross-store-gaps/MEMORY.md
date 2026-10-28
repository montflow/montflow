# Memory

## Context

Task F002: sweep the workspace for a remaining flat-layout assumption after the
store migration. Exploratory — the table is the output; the two stale artifacts
it found were corrected inline because they mislead readers.

## Progress

- 2026-10-28: complete. Two hits fixed, the rest classified no-change.

## Findings

### 1. Sweep

```bash
git grep -n "one directory per task\|one task directory per\|task directory per task"
git grep -nE "(['\"/])[A-Z]{1,2}[0-9]{3}-[a-z]" -- '*.ts' '*.tsx' '*.md' '*.yml' \
  ':!.agents/@montflow/specs' ':!packages/specs/fixtures'
git grep -n "task director\|SPEC.md. plus\|one directory per" -- \
  '.agents/@montflow/profiles' '.agents/@montflow/pi-prompts' \
  'packages/prompts' 'packages/profiles'
```

Excluded: `node_modules`, `dist`, `.git`, the spec store itself (its task ids
are real), and `packages/specs/fixtures` (already phase-laid-out).

### 2. Gaps

| File | Stale claim | Severity | Outcome |
| --- | --- | --- | --- |
| `.agents/@montflow/profiles/bookkeeper/PROFILE.md:40` | "`SPEC.md` + one directory per task" | misleads an agent | **fixed**: one directory per phase, each holding its task directories |
| `packages/reviews/src/apps/cli/tests/verify-spec-profiles.test.ts` | fixtures wrote `demo/C099-review-phase/TASK.md` at the spec root and asserted that path | misleads; the fixture is not a valid tree | **fixed**: fixtures nest under `demo/C/C099-review-phase`, assertion updated |
| `packages/specs/src/apps/cli/cli.apps.module.ts:776` | scaffold JSDoc "one task directory per task" | cosmetic, misleading | **fixed**: names the nested path |
| `packages/specs/src/modules/scaffold/CONTEXT.md:5`, `modules/structure/CONTEXT.md:16` | "one task directory per task" wording | accurate, phase-aware | no change |
| `packages/specs/src/modules/task/task.module.ts:14,203` | task-directory pattern prose | accurate (leaf name) | no change |
| `.agents/@montflow/pi-prompts/spec-create.json:4` | prescribes `PHASE.md` + `tasks/` + derived locks | **gate-breaking if used literally**: `verifySpecTree` rejects that tree | owned by `montflow-spec-standard/C001`; recorded, not edited here |
| `packages/specs/src/skills/authoring-spec.ts:18` | "One task directory per task" under the phase path | accurate | no change |
| `.agents/skills/montflow-create-pi-specs/CHANGELOG.md` old entries | old flat wording | historical changelog | no change |
| `packages/specs/fixtures/**` | flat? | none — all five are phase-laid-out | no change |
| `packages/reviews` `verifySpecProfiles` | `endsWith('TASK.md')`, depth-agnostic | none | no change |
| `.agents/@montflow/specs/*/MEMORY.md` (old specs) | historical records | history, not instructions | no change |

### 3. Consumer check

- `packages/specs` (`SpecStore`) and `apps/workspace` (`readSnapshot`) read spec
  snapshot paths; both carry `kind` and directory entries. `packages/reviews`
  also consumes snapshots, through `endsWith('TASK.md')`, and is depth-agnostic.
- No other package imports `@montflow/specs` snapshot types.

## Open Questions

- None.

## Handoff

- F099 reviews the reconciliation and this table.

## Deviations

- Two fixes landed inside an exploratory task: leaving a false layout claim in a
  profile and a non-tree fixture in a test would be worse than the scope drift,
  and both are documentation/test-local.
