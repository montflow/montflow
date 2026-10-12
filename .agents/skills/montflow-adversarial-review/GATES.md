## Phase 0: Independence

- [ ] The reviewer did not author, edit, or execute the code under review (independent subagent in pipelines; fresh session/subagent for direct invocation; if neither is available, the run is explicitly marked non-isolated in Metadata `Isolation`)
- [ ] The reviewer had no access to the original implementer's thoughts, notes, commit messages, design commentary, or any context beyond the code, spec, and goals
- [ ] On a re-review, the reviewer read ONLY the latest round file and the series ledger; no older round file was opened
- [ ] `[Fixer]` Discussion turns were treated as unverified assertions; every `In Review` finding was verified by reading the actual code, not by trusting the fixer's narrative
- [ ] Findings are based solely on what the code _does_ vs. what it _should do_, not on what the author intended

## Phase 1: Coverage

- [ ] The review covers correctness, security, edge cases, design, test coverage, and documentation for the changed code
- [ ] Every finding includes a `file_path:line` location _or_ explicitly cites the artifact/area where the absence occurs (e.g. "no rollback path anywhere in `TASK.md`", "no observability hook in any failure branch")
- [ ] Every finding states a concrete trigger (input, state, or path) that breaks the code, **or** is explicitly labeled a risk (uncertain/but-could-break), **or** is explicitly labeled a design observation (no runtime trigger — applies to over-engineering, naming, API ergonomics, missing-refactor class findings)

## Phase 2: Evidence & Prioritization

- [ ] Confirmed defects show the failing path; risks are distinguished from confirmed bugs
- [ ] Findings are prioritized by severity (Critical → Nit) with highest-severity leading
- [ ] Each finding has an impact and a specific, minimal suggested fix
- [ ] Nitpicks are kept short and at the end; no padding praise

## Phase 3: File Format (mandatory file output)

- [ ] The round was written to `.agents/@montflow/reviews/<name>/<NNN>/REVIEW.md` (a **new** round directory; there is no in-place mode)
- [ ] Round `## Metadata` contains **Target**, **Round**, **Type**, **Isolation**, **Max Attempts**, **Status**, and **Created**
- [ ] Every finding is headed `### F<n> — <title>` and has **Severity**, **Location**, **Status**, **Attempts**, **First Seen**, **Problem**, **Impact**, **Suggestion**, and a `#### Discussion` subsection (empty on a standalone review)
- [ ] Every `Severity` and `Status` value is from its enum; `Attempts` and `First Seen` are integers
- [ ] No global "Fixer Notes" section exists — status and discussion live per-finding
- [ ] `## Summary` lists counts that equal the actual findings (by severity and by status)
- [ ] The series ledger `.agents/@montflow/reviews/<name>/REVIEW.md` `Rounds` table and `Findings` index reflect every round and agree with the round files

## Phase 4: Re-Review Discipline (only when adding a round to an existing series)

- [ ] A **new** round directory was created; no prior round file was edited
- [ ] Non-terminal findings were carried forward verbatim (id, severity, location, problem, impact, suggestion, first seen, attempts, discussion); terminal findings (`Resolved`, `Won't Fix` unless reopened) were dropped
- [ ] `Escalated` findings were NOT re-reviewed unless a `[Human]` turn or explicit user instruction resolved the escalation
- [ ] Every `In Review` finding was verified against the code; Status updated to `Resolved` (confirmed) or `Open` (still broken) with a `[Reviewer]` turn showing the path
- [ ] Any newly discovered defect got the next free `F<n>` id with `Status: Open`, `Attempts: 0`, and `First Seen: <new round>`
- [ ] The `## Summary` counts and the series ledger tables were updated
- [ ] No prior `[Fixer]` or `[Reviewer]` Discussion turn was edited or deleted — each thread is append-only
- [ ] The reviewer did NOT modify any finding's `Attempts` counter
