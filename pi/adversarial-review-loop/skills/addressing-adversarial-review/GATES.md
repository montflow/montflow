## Phase 1: Triage & Scope

- [ ] The review file was located at `.agents/reviews/<name>/<code>.md` and parsed successfully
- [ ] `Max Attempts` resolved (defaults to 3 if missing/unparseable, and the field was backfilled into Review Metadata)
- [ ] `Resolved` findings were skipped entirely
- [ ] `Won't Fix` findings were skipped unless the reviewer reopened them with a `[Reviewer]` turn flipping Status to `Open`
- [ ] `Escalated` findings were not re-attempted; re-engagement only happened after a `[Human]` turn (and did not increment Attempts)
- [ ] `In Review` findings were NOT re-fixed without a reviewer turn or explicit user instruction

## Phase 2: Fix Quality

- [ ] Every fix was applied at the cited `Location` (or the actual root cause, justified in the Discussion turn)
- [ ] Every `[Fixer]` turn cites `file_path:line` of the change, explains why it addresses the named `Problem` trigger, and records the verification command(s) and their result
- [ ] Local verification (typecheck/lint/relevant tests) ran before `Status` was set to `In Review`
- [ ] A finding whose local verification failed was left `Open`, not `In Review`
- [ ] No review-authored field (`Severity`, `Location`, `Problem`, `Impact`, `Suggestion`, `[Reviewer]` turns) was edited

## Phase 3: Counter & Discussion Integrity

- [ ] `Attempts` was incremented by exactly 1 per fix attempt (pass or fail) — never reset, never decremented, never touched by a `Won't Fix` or `[Human]` action
- [ ] No `Status` transition went past the attempt ceiling without escalation (an attempt was not made when `Attempts >= Max Attempts`)
- [ ] `Iteration` was NOT modified
- [ ] Every `### Discussion` thread is append-only relative to the prior file state — no `[Reviewer]`, `[Fixer]`, or `[Human]` turn was edited or deleted
- [ ] `## Summary` counts match the actual finding statuses written

## Phase 4: Escalation

- [ ] Every `Escalated` finding has `Attempts == Max Attempts` and a `[Fixer]` turn describing the impasse and what human judgment is needed
- [ ] Each escalation was surfaced to the user immediately (not silently continued past)
- [ ] No `Escalated` finding was re-attempted without a `[Human]` turn resolving it