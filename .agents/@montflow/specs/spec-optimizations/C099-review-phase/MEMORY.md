# Memory

## Context

Independent adversarial review of phase C (C001 prompt-templates, C002
execute-modes, C003 author-execute-commands, C004 spec-detection, C005
docs-and-profiles), run as two isolated reviewer series:

- `.agents/@montflow/reviews/spec-optimizations/003/REVIEW.md` (general)
- `.agents/@montflow/reviews/spec-optimizations-effect-reviewer/003/REVIEW.md`
  (`effect-reviewer` profile)

## Progress

- Round 003 opened in both series with `- Phase: C`.
- General series: 7 findings (4 Major, 3 Minor), all resolved.
- Effect series: 13 findings (2 Major, 8 Minor, 3 Nit), all resolved.
- Two fix rounds:
  - Pass 1: `execute --phase` refuses locked/future phases and complete specs;
    review budget floors at 1 for a reviewable phase; the shipped execute prompt
    no longer orders unshipped verbs (`gate run`, `lock`, BOARD/MAILBOX); the
    doctor gate verifies declared skills; review-cycle counting is defined;
    `which` uses targeted file checks and repo-root resolution; slash `author`
    usage errors are coded; `Match.exhaustive` over payload status; mode parsed
    at the command boundary.
  - Pass 2: the lock procedure now sets the spec's terminal `status: complete`
    when the last phase locks (prompt, profile, and create prompt agree); blocked
    payloads propagate doctor's real fix (`prompt.skill-blocked`).
- Both series closed with terminal verdict `pass`.

## Findings

- `execute` derives active phase, state, and ready set from `next`; any other
  `--phase` gets `spec.phase-not-active` with the active phase and the fix.
- Review budget: largest non-review task budget, floor 1 for a non-empty phase,
  cap 3; one cycle = one round per expected series, counted by `- Phase:`.
- Prompt-only templates survive; the executable behaviour named in the template
  is the CLI this spec ships.

## Open Questions

- Phase D (model catalogue, sizing prompt, config command, docs) is still
  pending; the spec stays `in-progress` until D locks.

## Handoff

- D001 is unblocked (depends A001). D002 depends C001+D001; D003 depends
  C003+D002; D004 depends D003; then D099 review.

## Deviations

- None.
