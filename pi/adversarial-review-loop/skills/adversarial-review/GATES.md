## Phase 0: Independence

- [ ] The reviewer did not author, edit, or execute the code under review (independent subagent in pipelines; fresh session/subagent for direct invocation; if neither is available, the run is explicitly marked non-isolated in Review Metadata)
- [ ] The reviewer had no access to the original implementer's thoughts, notes, commit messages, design commentary, or any context beyond the code, spec, and goals
- [ ] On a re-review, the reviewer read ONLY the review file currently being iterated; no sibling review files in `.agents/reviews/<name>/` were opened
- [ ] `[Fixer]` Discussion turns were treated as unverified assertions; every `In Review` finding was verified by reading the actual code, not by trusting the fixer's narrative
- [ ] Findings are based solely on what the code *does* vs. what it *should do*, not on what the author intended

## Phase 1: Coverage

- [ ] The review covers correctness, security, edge cases, design, test coverage, and documentation for the changed code
- [ ] Every finding includes a `file_path:line` location *or* explicitly cites the artifact/area where the absence occurs (e.g. "no rollback path anywhere in `TASK.md`", "no observability hook in any failure branch")
- [ ] Every finding states a concrete trigger (input, state, or path) that breaks the code, **or** is explicitly labeled a risk (uncertain/but-could-break), **or** is explicitly labeled a design observation (no runtime trigger — applies to over-engineering, naming, API ergonomics, missing-refactor class findings)

## Phase 2: Evidence & Prioritization

- [ ] Confirmed defects show the failing path; risks are distinguished from confirmed bugs
- [ ] Findings are prioritized by severity (Critical → Nit) with highest-severity leading
- [ ] Each finding has an impact and a specific, minimal suggested fix
- [ ] Nitpicks are grouped at the end and kept short; no padding praise

## Phase 3: File Format (mandatory file output)

- [ ] The review was written to `.agents/reviews/<name>/<code>.md` (there is no in-place mode)
- [ ] Review Metadata contains **Target**, **Review Type**, **Review File**, **Iteration**, **Isolation**, and **Max Attempts: 3**
- [ ] Every finding has a stable, unique ID (`F1`, `F2`, …), a Severity, a Location, a Problem, an Impact, a Suggestion, a Status (`Open` on initial review), `Attempts: 0`, a `First Seen` iteration, and an `### Discussion` subsection (empty on a standalone review)
- [ ] No global "Fixer Notes" section exists — status and discussion live per-finding
- [ ] `## Summary` lists counts of `Open`, `In Review`, `Resolved`, `Won't Fix`, and `Escalated` findings

## Phase 4: Re-Review Discipline (only when iterating an existing file)

- [ ] Terminal findings (`Resolved`, `Won't Fix` unless reopened) were NOT re-evaluated
- [ ] `Escalated` findings were NOT re-reviewed unless a `[Human]` turn or explicit user instruction resolved the escalation
- [ ] Every `In Review` finding was verified against the code; Status updated to `Resolved` (confirmed) or `Open` (still broken) with a `[Reviewer]` turn showing the path
- [ ] Any newly discovered defect got the next free `F<n>` ID with `Status: Open`, `Attempts: 0`, and `First Seen: <current iteration>`
- [ ] `Iteration` was incremented and `## Summary` counts were updated
- [ ] No prior `[Fixer]` or `[Reviewer]` Discussion turn was edited or deleted — the thread is append-only
- [ ] The reviewer did NOT modify any finding's `Attempts` counter