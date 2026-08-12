## Phase 0: Independence

- [ ] The reviewer did not author, edit, or review the spec under audit (independent subagent in pipelines; fresh session/subagent for direct invocation; if neither is available, the run is explicitly marked non-isolated in Review Metadata)
- [ ] The reviewer had no access to the original spec author's thoughts, notes, or context beyond the spec files themselves. The reviewer did not read the spec author's implementation notes, design commentary, or chat history.
- [ ] On a re-audit, the reviewer read ONLY the `SPEC_<code>.md` file currently being iterated; no sibling review files in `.agents/@montflow/reviews/<name>/` were opened
- [ ] `[Fixer]` Discussion turns were treated as unverified assertions; every `In Review` finding was verified against the spec files (`FEATURE.md`/`TASK.md`/`MEMORY.md`/`GATES.md`) itself, not by trusting the fixer's narrative
- [ ] Findings are based solely on what the spec *actually says* vs. what it *should say*, not on what the author intended

## Phase 1: Coverage

- [ ] The spec audit covered requirements, task coverage, gates, dependencies, types, phases, completion criteria, deviations, cross-artifact contradictions, and scope/phasing
- [ ] Every finding includes a `file_path:line` location within the spec artifacts *or* explicitly cites the artifact/area where the absence occurs (e.g. "no migration phase anywhere in `TASK.md`")
- [ ] Every finding states a concrete trigger (missing section, inconsistent field, circular dependency) **or** is explicitly labeled a risk **or** is explicitly labeled a design observation (no runtime trigger — applies to naming, phasing, scope-findings)

## Phase 2: Evidence & Prioritization

- [ ] Findings are prioritized by severity (Critical → Nit) with highest-severity leading
- [ ] Each finding has an impact and a specific, minimal suggested fix
- [ ] Spec errors are distinguished from speculative risks; risks are labeled as such
- [ ] Nitpicks are grouped at the end and kept short

## Phase 3: File Format (mandatory file output)

- [ ] The audit was written to `.agents/@montflow/reviews/<name>/SPEC_<code>.md` (there is no in-place mode)
- [ ] The filename uses the `SPEC_` prefix to distinguish spec audits from code reviews
- [ ] Review Metadata contains **Target** (feature spec), **Review Type** (`Standalone` or `Re-review`), **Review File**, **Iteration**, **Isolation**, and **Max Attempts: 3**
- [ ] Every finding has a stable unique ID (`F1`, `F2`, …), a Severity, a Location pointing at a spec artifact, a Problem, an Impact, a Suggestion, a Status (`Open` on a standalone audit), `Attempts: 0`, a `First Seen` iteration, and an `### Discussion` subsection
- [ ] No global "Fixer Notes" section exists — status and discussion live per-finding
- [ ] `## Summary` lists counts of `Open`, `In Review`, `Resolved`, `Won't Fix`, and `Escalated` findings

## Phase 4: Re-Audit Discipline (only when iterating an existing `SPEC_<code>.md`)

- [ ] Terminal findings (`Resolved`, `Won't Fix` unless reopened) were NOT re-evaluated
- [ ] `Escalated` findings were NOT re-reviewed unless a `[Human]` turn or explicit user instruction resolved the escalation
- [ ] Every `In Review` finding was verified against the spec artifacts; Status updated to `Resolved` (confirmed) or `Open` (still broken) with a `[Reviewer]` turn citing the artifact path
- [ ] Any newly discovered spec defect got the next free `F<n>` ID with `Status: Open`, `Attempts: 0`, `First Seen: <current iteration>`
- [ ] `Iteration` was incremented and `## Summary` counts were updated; the file was overwritten in place (not bumped to a new `SPEC_<code>`)
- [ ] No prior `[Fixer]` or `[Reviewer]` Discussion turn was edited or deleted — the thread is append-only
- [ ] The reviewer did NOT modify any finding's `Attempts` counter