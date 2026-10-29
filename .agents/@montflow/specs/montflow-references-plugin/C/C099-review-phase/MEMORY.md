# Memory

## Context

Phase C (`C001`–`C007`) is implemented and every task is marked `complete`.
`C099` remains `pending` because its adversarial review passed with three new
Minor findings still open. Phase C is **not locked**: `SPEC.md` still says
`locked-phases: A, B`.

Resume with:

```bash
bun run --cwd packages/specs cli next --name montflow-references-plugin --dir "$PWD"
```

That must print `C099 review-phase`. Phase D starts only after `C099` is
`complete` and phase C is added to `locked-phases`.

## Progress

- 2026-10-26: `C001`–`C007` complete; store migrated (14 entries); old
  `adding-references` / `finding-references` skills retired; `mf:check:references`
  wired into `mf:check` and CI; `pack:plugins` emits `@montflow/references`.
- Phase C review series: `.agents/@montflow/reviews/references-plugin-c/`
  - round `001`: `rework`, 13 findings (1 Critical, 4 Major, 8 Minor)
  - round `002`: `pass`, F1–F13 verified fixed; 3 new Minor findings open
- Last green gate run (round 002):
  - `bun run --cwd packages/references test` → 28 files / 332 tests
  - `ts:check`, `lint:check`, `format:check` → pass
  - `bun run mf:check:references` → `entries=16 issues=0 warnings=0`,
    doctor `checks=8 failed=0 repaired=0`
  - `bun run mf:check:skills` → 46 skills / 0 issues
  - `bun run --cwd packages/opencode smoke` → 13 pass / 0 fail
  - `bun run pack:plugins` → `@montflow/references` artifact emitted

## Findings

Open phase C review findings (round `002`, all `Open`, all Minor):

- **F14** `packages/references/src/apps/cli/renderers.apps.module.ts:203,228` —
  the `verify` summary counts packaged-skill blocks as store entries. A real
  14-entry store prints `entries=16`; an empty store prints `entries=2`.
  B001 §11.6(d) expects store-entry counts.
- **F15** `packages/references/src/apps/doctor/doctor.apps.module.ts:152-176,275-327`
  — `readPayload` falls back to the embedded payload when a shipped skill has
  no `SKILL.md`, so deleting a committed `packages/references/skills/*/SKILL.md`
  still leaves `verify` and `mf:check:references` green.
- **F16** `packages/references/src/apps/cli/slash.apps.module.ts:168-175` — a
  string flag with no value is silently dropped by the slash parser
  (`list --status`, `status --dir`, `add ... --purpose`), while the binary
  exits 1 with `Missing value for flag`.

Review artifacts are local-only: `.agents/@montflow/reviews/` is gitignored.
The findings above are restated here so a fresh checkout can resume without
them.

## Open Questions

- F14: change the summary to count only `report.entries`, with skills reported
  in a separate line, or amend B001 §11.6(d) to define the combined count?
  Recommended: count store entries only; keep skill blocks visible.
- F15: remove the embedded-payload fallback from the packaged-skill read path
  (use it only for install), or make `verify` require the committed
  `SKILL.md` explicitly? Recommended: read committed files only for
  verification; embedded payload stays install-only.
- F16: reject a value-less flag in the slash parser with the same
  `Missing value for flag` message as the binary; recommended.

## Handoff

Next sequence:

1. Fix F14–F16 in `packages/references`, add regression tests, run:
   `bun run --cwd packages/references test`, `ts:check`, `lint:check`,
   `format:check`, `bun run mf:check:references`.
2. Re-run the review series `references-plugin-c` round `003` and get `pass`.
3. Mark `C099` `status: complete`; set `SPEC.md` `locked-phases: A, B, C`;
   update the `C099` row in the SPEC task table to `complete`.
4. Then `mf-specs next` should print `D001` and `D002`. Phase D is the skill
   alignment pass; phase E is the scoped-verification pass.
5. Final step: whole-spec review, `status: complete`, zero issues from
   `bun run --cwd packages/specs cli check --dir "$PWD"`.

## Deviations

- Review artifacts under `.agents/@montflow/reviews/` are intentionally not
  committed (`.gitignore:255`); this MEMORY is the committed resume record.
- The changeset for the private package produces `NO packages to be bumped`.
  C007 recorded this; decide at release time whether private packages belong
  in `.changeset/config.json` `ignore`.
