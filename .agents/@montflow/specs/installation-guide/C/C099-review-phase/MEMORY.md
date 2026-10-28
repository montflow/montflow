# Memory

## Context

Independent adversarial review of phase C: the per-utility install sections, the
ask-first selection flow, and the install-all recipe. The orchestrator capped
phase C at a single review round; verification of the fixes happened in place in
round 010, with no round 011.

## Progress

- 2026-10-26: Round `010` written to
  `.agents/@montflow/reviews/installation-guide/010/REVIEW.md`
  (Phase C, standalone, isolated).
  - 3 findings filed: F19 Major, F20 Minor, F21 Minor.
- 2026-10-26: Post-cap in-place verification (no round 011 per user cap).
  - F19 Resolved — absolute `M` in remote mode (`:29`) and normalisation
    (`:90`, `:262`) verified: documented skills `sync` / `--check` / `verify`
    exit 0 from a fresh workspace with an absolute remote-style `M`; relative
    `M` normalised and the install-all block ran all five steps to exit 0.
  - F20 Resolved — ask-first is Local mode step 1 with no code block before the
    question; deps are step 2; `none` now claims only that no utility store is
    written (`:75`), replacing "workspace is untouched".
  - F21 Resolved — block wrapped in `( … )` with a bash/no-leak note; extracted
    block run verbatim in an interactive bash: exit 0, parent
    `errexit`/`pipefail`/`nounset`, `ERR` trap, and variables unchanged; failure
    path exits 1 with `FAILED: prompts` and the parent shell survives.
  - Round 010 Summary: Resolved 3, all other statuses 0. Round and series
    Status: closed.
  - `bun run --cwd packages/reviews cli verify --all --dir "$PWD"` →
    `11 files · 0 issues`.

## Open Questions

- None.

## Handoff

- Phase C review is closed: F19–F21 all verified Resolved in round 010. No open
  findings remain for phase C, and no round 011 exists by user cap.

## Deviations

- None.
