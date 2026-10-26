# Memory

## Context

Phase D review (`D099`) is the last open task of `spec-optimizations`. Phases
A, B, and C are locked and passed both reviewer series. All execution tasks
D001–D004 are complete; review round `004` is open in both series and its
findings are not yet resolved.

## Progress

- Phase A: locked. Review series `spec-optimizations` and
  `spec-optimizations-effect-reviewer` round `001` closed, `pass`.
- Phase B: locked. Round `002` closed, `pass`.
- Phase C: locked. Round `003` closed, `pass`.
- Phase D: D001–D004 complete. Round `004` open —
  `.agents/@montflow/reviews/spec-optimizations/004/REVIEW.md` (9 findings) and
  `.agents/@montflow/reviews/spec-optimizations-effect-reviewer/004/REVIEW.md`
  (8 findings).

## Findings

Blocking findings from round 004 (verified by the reviewers):

- `F22` (base, Major): `mf-specs models` prints catalogue ids that
  `sizing.json` rejects — multi-slash OpenRouter ids, `:` in Ollama tags,
  mixed-case variants. `models --verify` and `check` then fail on a config the
  wizard's own rule produced.
- `F36` (effect, Major): `models --verify` never checks the root/spec exists;
  a wrong `--dir` prints `no model or effort findings` and exits 0, and an
  unknown `--name` leaks a raw `store.error`.

Non-blocking: `F23`–`F30` (base) and `F37`–`F43` (effect) — scope-switch
messaging, blank `--name`, ignored `--provider`/`--json` under `--verify`,
authoring-skill gaps, test early-returns, diagnostics/cause and `Match` style.

## Open Questions

- Should catalogue ids with multiple `/` be normalized for sizing, or should
  `sizing`'s model-id rule be widened? The fixer must pick one and justify it
  against SPEC `sizing.malformed-model`.
- `sizing-config` accepts unknown spec/phase ids by design (D003); confirm the
  reviewer accepts that.

## Handoff

Resume procedure, in order:

1. `bun run --cwd packages/specs cli state --dir "$PWD" --name spec-optimizations`
   → expect `in-progress · pending · phase D · locked A,B,C`.
2. `bun run --cwd packages/specs cli next --dir "$PWD" --name spec-optimizations`
   → expect `D099` ready.
3. Fix round 004 with the `montflow-addressing-adversarial-review` skill
   (Status → In Review, Attempts++, `[Fixer]` discussion), starting with F22
   and F36.
4. Re-run both reviewer series for round 004 until both close `pass`.
5. Complete `D099` (`status: complete` in `TASK.md` and the `SPEC.md` table),
   add `- D` to `locked-phases`, set `status: complete` in `SPEC.md`, then run
   `bun run --cwd packages/specs cli check --dir "$PWD" --name spec-optimizations`
   (expect `0 failed · 0 issues`).
6. Run `bun run mf:gate` (full) before any push.

Never hand-edit review verdicts; they belong to the reviewer series.

## Deviations

- The orchestrator fixed two one-line review findings directly in earlier
  phases; round 004 should go through a fixer worker as usual.
