# Memory

## Context

- G099 reviews phase G (conditional prompt variables) after G001–G004 and G100 completed.
- Reviews extension series `montflow-spec-standard`; rounds 013 (standalone) and 014 (re-review, user-authorized overflow).

## Progress

- Round 013 found 2 Major / 6 Minor / 2 Nit (F1–F10). `review decide` returned `escalate` (`review.escalate-cap`); the user authorized one overflow round.
- One batched fixer attempt resolved F1–F6 and F8–F10; re-review round 014 reopened F7 and added F11 (Minor), F12 (Minor), F13 (Nit).
- `review decide` returned `fix-and-stop` (`review.minor-only`); one final fixer batch resolved F7, F11, F12, F13.
- Final `review decide --phase G --mode guided`: `pass` / `review.clean`, rounds 2/1 with the recorded user overflow, open 0.

## Findings

- F7 (counter), F11 (defaulted controller), F12 (inert `it` Effect bodies), F13 (skill rule list) all Resolved; rounds 013 and 014 closed `minor-deferred` with `- Deferred:` lines.
- No Critical or Major left open.

## Gates

- Reviewer ran `packages/prompts` (745 tests), `apps/workspace` (268), and `test:tui` evidence.
- Repo-wide `bun run mf:gate` is the phase boundary gate, run by the orchestrator after this review.

## Open Questions

- None.

## Handoff

- Lock phase G only after the repo-wide gate exits 0 and `lock --phase G` confirms the derived conjunction.

## Deviations

- One overflow round beyond the 1-round budget, authorized by the user and recorded in round 014 metadata.
