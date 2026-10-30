# Memory

## Context

A003 teaches the authoring and execution flows to use sizing. In scope: the
packaged create-spec skill (four sizes, review-cycle budget, config layering,
merge rule, size token) plus its `.agents/skills/` mirror, the two canonical
spec prompts under `packages/specs/prompts/` and their installed copies under
`.agents/@montflow/prompts/`, the two spec orchestrator profiles, and the sizing
section of `packages/specs/README.md`.

Out of scope by order: all CLI code (`packages/specs/src/apps/cli/**`),
`packages/specs/src/server.ts`, `packages/specs/src/skills/*`, the `modules/sizing`
contract (A001/A002), spec-tree size backfill (A004), prompt doctor sync (B002),
skill renames (B003/B004), and budget enforcement inside the execute template
(C001/C003/C005 own that).

Conventions followed: skill body stays compressed with `# When To Use` /
`# Pipeline` / `# Reference`; version bump + newest CHANGELOG entry must agree
(`packages/specs/src/skills/tests/skill-drift.test.ts` asserts it and that the
mirror is byte-identical); prompts are the project's JSON prompt shape with
template variables declared in first-appearance order; docs are hard-wrapped
prose with oxfmt-formatted tables.

## Progress

Done.

Files modified:

- `packages/specs/skills/montflow-create-pi-specs/SKILL.md` — version 2.3.0 →
  2.4.0; `--tasks` token now `name[:type[:gates[:size]]]` with `medium` default;
  `size` added to the `TASK.md` frontmatter contract; new step 5 "Size Every
  Task"; later steps renumbered 6–8; self-check gains the size rule and the
  `sizing --human` inspection; reference gains sizing config, sizing CLI, and
  `modules/sizing`.
- `packages/specs/skills/montflow-create-pi-specs/CHANGELOG.md` — new `[2.4.0] -
  2026-10-26` entry (newest entry equals the frontmatter version).
- `.agents/skills/montflow-create-pi-specs/SKILL.md` and `CHANGELOG.md` —
  installed mirror, byte-identical copies.
- `.agents/@montflow/prompts/spec-create.json` — step 4's locked decisions gain
  the per-task size choice (with the 1/2/3/3 mapping, cap, phase-budget rule,
  `medium` scaffold default, fourth `--tasks` token) and the config layering /
  merge / inherit rule.
- `.agents/@montflow/prompts/spec-execute.json` — step 2 now says each `next`
  line carries size + target + source, passes the target as `model` only when it
  is not `inherit`, and re-reads it via `resolve` or `sizing --human` when stale
  or disputed.
- `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md` — new
  "Size every task" section (size choice, budget mapping, two config locations,
  merge, inherit, `sizing --human`) and a review-checklist item.
- `.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md` — dispatch
  step 2 carries the inherit rule; new "Task size and dispatch targets" section
  (budget mapping, layers, merge, `resolve`, `sizing --human`); checklist item.
- `packages/specs/README.md` — `create` bullet gains the size token; new
  `resolve` and `sizing` CLI bullets; new `## Sizing` section (config table,
  repo-only example at `.agents/@montflow/specs/sizing.json`, spec + phase
  override example, merge rule, full diagnostic with a `cause` row, exit codes);
  `Task`, `Scaffold`, `Sizing`, and `Cli` entries in the library surface.

Files added:

- `packages/specs/prompts/spec-create.json` — canonical copy, byte-identical to
  the workspace prompt.
- `packages/specs/prompts/spec-execute.json` — same.

Nothing was added as a real repo `sizing.json`; every model id in the README is a
`provider/...` placeholder.

## Findings

### Byte-identical evidence

```
$ cmp packages/specs/skills/montflow-create-pi-specs/SKILL.md .agents/skills/montflow-create-pi-specs/SKILL.md
SKILL.md identical
$ cmp packages/specs/skills/montflow-create-pi-specs/CHANGELOG.md .agents/skills/montflow-create-pi-specs/CHANGELOG.md
CHANGELOG.md identical
$ cmp packages/specs/prompts/spec-create.json .agents/@montflow/prompts/spec-create.json
spec-create.json identical
$ cmp packages/specs/prompts/spec-execute.json .agents/@montflow/prompts/spec-execute.json
spec-execute.json identical
```

```
$ sha256sum packages/specs/prompts/*.json .agents/@montflow/prompts/spec-*.json \
    packages/specs/skills/montflow-create-pi-specs/*.md .agents/skills/montflow-create-pi-specs/*.md
8a72e1d6aacb473e1b3ed7c210a1df47e43585fc189ec7e0dd1ea52dcfb6fc4d  packages/specs/prompts/spec-create.json
87072829f15853cbf1c62f25e2018123f3bee8c6e470488a40073498ef61ffad  packages/specs/prompts/spec-execute.json
8a72e1d6aacb473e1b3ed7c210a1df47e43585fc189ec7e0dd1ea52dcfb6fc4d  .agents/@montflow/prompts/spec-create.json
87072829f15853cbf1c62f25e2018123f3bee8c6e470488a40073498ef61ffad  .agents/@montflow/prompts/spec-execute.json
0828e57d57240a2b2d77a213ea13d1b51c8be2d3e637a6b2982e151fa2ce44a7  packages/specs/skills/montflow-create-pi-specs/CHANGELOG.md
b88f3f66ed18aaab79813cb7f14372c4570a756861530788a9ca7c1e5ac7d094  packages/specs/skills/montflow-create-pi-specs/SKILL.md
0828e57d57240a2b2d77a213ea13d1b51c8be2d3e637a6b2982e151fa2ce44a7  .agents/skills/montflow-create-pi-specs/CHANGELOG.md
b88f3f66ed18aaab79813cb7f14372c4570a756861530788a9ca7c1e5ac7d094  .agents/skills/montflow-create-pi-specs/SKILL.md
```

The project's own installer agrees:

```
$ bun run --cwd packages/specs cli doctor --check --dir $PWD
Spec skills 'montflow-create-pi-specs, montflow-find-pi-specs' are installed and current under /home/daniel/dev/montflow/spec-optimizations/.agents/skills/.
exit=0
```

### Gates (verbatim)

```
$ bun run mf:check:skills
46 skills · 0 issues
✓ skills are installed and up to date.
exit=0
```

```
$ bun run mf:check:prompts
4 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
exit=0
```

```
$ bun run mf:check:profiles
11 profiles · 0 issues · 0 warnings
exit=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
(node:644608) [MODULE_TYPELESS_PACKAGE_JSON] Warning: ... (Node config notices only)
exit=0
```

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 293ms on 142 files using 16 threads.
exit=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit=0
```

```
$ bun run --cwd packages/specs test
 Test Files  70 passed (70)
      Tests  644 passed (644)
Type Errors  no errors
exit=0
```

### The package-wide gates were red for ~10 minutes from a sibling's in-flight work

While this task ran, the worker owning `packages/specs/src/apps/cli/**` and
`packages/specs/src/modules/which/**` was mid-edit. Transient failures — all in
files this task must not touch — were:

- `lint:check`: unused `FileSystem`, `SPEC_FILE`, `BranchSource`, `WhichMatch`,
  `WhichMiss`, `parseGitFile`, `parseHead`, `resolveWhich` in
  `src/apps/cli/cli.apps.module.ts`.
- `ts:check`: the same unused imports, then `Effect<..., FileSystem>` vs
  `Effect<..., Scope>` mismatches in `src/apps/cli/tests/{create,run-slash}.test.ts`
  and unused imports in `tests/helpers.ts`.
- `format:check`: `src/apps/cli/cli.apps.module.ts` and
  `src/modules/which/which.module.ts`.
- `test`: 21 failures in the CLI tests, then one in `src/apps/cli/tests/which.test.ts`.

None named an A003 file. All four went green once the sibling finished; the
final batch above is the post-completion run. `README.md` was the only A003 file
format flagged, and only for my first table's padding.

### Skill/prompt content decisions

- The review-cycle mapping lives only in the authoring skill, both orchestrator
  profiles, and the create prompt. The execute prompt does **not** restate the
  budget: SPEC lines 93–97 map to C001 (template), C003 (budget variable), and
  C005 (README table), so A003 stops at the `inherit` dispatch rule.
- `sizing.json` is never described as required: both files are optional, a
  repo-only config is valid, and a size no layer defines is `inherit`.
- The diagnostic example in the README is labelled "one diagnostic with every
  field populated" rather than pasted as a transcript. Reason: `check`/`sizing`
  render config findings from verifier `Issue`s, which carry no `cause`, while
  `renderDiagnostic` emits a `cause` row only for a `SizingError` that preserved
  one (see Open Questions).

## Open Questions

- **`cause` never reaches a config diagnostic today.** `Sizing.parse` preserves
  the original `SchemaError` as `SizingError.cause`, and `renderDiagnostic`
  prints a `cause` row, but `cli.apps.module.ts` loads configs through
  `verifyText` + `parse` and converts failures to `Issue`s via
  `issueOfSizingError`, which drops `cause`. Reproduced: a malformed
  `mock-ok/sizing.json` renders `code/path/field/problem/expected/actual/fix/next`
  with no `cause`. SPEC line 61 asks for `cause` "when one exists". A003 only
  documents the shape; the wiring is A002's surface or a follow-up defect.
- **SPEC line 96** (the execute prompt enforces the review-cycle budget and
  refuses a fourth round) is not in A003's requirement list and is claimed by
  C001/C003/C099. This task deliberately did not add it to the execute prompt.
- **`packages/specs/prompts/` is created here, while B002's TASK says "Add
  `packages/specs/prompts/` holding exactly spec-create.json and
  spec-execute.json".** B002 should adopt the two files as its canonical source
  and add the doctor sync; it must not recreate or re-derive them.
- The prompts still name `montflow-create-pi-specs` / `montflow-find-pi-specs`
  in `skills` and body text. Renaming is B003/B004; this task left the names
  untouched so the arrays still resolve (`mf:check:prompts` currently reports
  no warnings).
- Pre-existing mismatch, untouched: the prompts describe phases as directories
  with `PHASE.md`/`tasks/` and reviews as "never a reserved `<PHASE>099` task
  id", while the authoring skill documents the current task-directory layout and
  `<PHASE>099-review-phase` tasks. It predates A003 and no A003 requirement
  mentions it; the phase review may want a single authoritative shape.

## Handoff

- **B002**: `packages/specs/prompts/spec-create.json` and `spec-execute.json`
  exist and are byte-identical to the installed
  `.agents/@montflow/prompts/` copies (sha256 above). Doctor should own exactly
  those two names, install the package bytes, and report `missing` / `stale`
  without touching `commit.json` or `effect-review.json`.
- **B003/B004**: the skill's frontmatter name is still
  `montflow-create-pi-specs`, and prompt `skills` arrays still use the `-pi-`
  names. Rename them together with the doctor constants, payload, and mirror.
- **A004**: nothing here depends on task sizes, but `mf:check:specs` currently
  fails on other specs with `task.missing-size` (6 specs · 1 failed · 12 issues ·
  79 warnings at the time of writing), which is A004's backfill.
- **Reviewers**: the size-to-cycle table (tiny 1, small 2, medium 3, large 3),
  the cap of 3, the phase-budget rule, both config locations, the phase override,
  the whole-entry merge, `inherit`, and the `sizing --human` inspection are all
  present in the skill, the create prompt, and both profiles. The execute prompt
  and execution profile both state the `inherit` rule.

## Deviations

- **Direction of the prompt copy.** SPEC line 67 says the workspace prompt is
  never hand-edited, so the content was authored once and written to both
  locations: the edit was applied to the workspace file first (the live prompt
  the host reads today) and then copied byte-for-byte into
  `packages/specs/prompts/`. The two copies are identical; the *source* reading
  is the package copy from B002 onward.
- **README formatted through a scratch copy.** `format:fix` is package-wide and
  would have rewritten the sibling's in-flight CLI files, so the README's exact
  oxfmt output was computed by formatting a copy in `/tmp/opencode/fmt` with the
  same `.oxfmtrc.json` and applying only the README hunk. Final
  `format:check` passes on the real file.
- **The interim gate failures above are recorded, not hidden.** They were caused
  by the sibling's in-flight files and cleared on their own; no A003 file was
  involved after the table-padding fix.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run limits
  writes to this `MEMORY.md`.
