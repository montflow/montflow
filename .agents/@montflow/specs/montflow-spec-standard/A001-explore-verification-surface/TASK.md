---
id: A001
name: explore-verification-surface
type: exploratory
originator: user
depends-on:
related-tasks:
status: pending
---

# Task A001: explore verification surface

## Type: exploratory

## Description

Inventory every place the verifiers decide `valid`, so the severity channel in A003
has a complete call-site list before it changes any of them. Read-only: report
findings, change nothing.

## Requirements

- List every consumer of `Issue` and `Result` in `pi-specs/modules/verify` and trace how `valid` reaches an exit code: `renderCheck`, `renderStatus`, `renderList`, `runCheck`, the slash-command `ok` flag, and the `check` command nonzero exit.
- Do the same for `pi-profiles` (`verifyProfileFile`, `engines.verifyAll`) and `pi-prompts` (`verifyPrompt`, `verifyPromptFile`, and the richer `VerifyIssue` that already carries `fix` and `line`).
- Record which fields the two artifact verifiers do not check, and confirm by experiment that an unresolvable `skills:` name verifies clean in both stores.
- Record which packages expose a report-only verification mode and which do not.
- Capture the fixture status vocabulary already in use (`mock-ok`, `mock-stale`, `mock-complete`, `mock-bad`) so a future warning never collides with the word stale.

## Completion

- [ ] Findings recorded in this task MEMORY.md with file and line references for every call site
- [ ] The skills non-check is reproduced, with the command run and its output quoted
- [ ] No file outside `.agents/@montflow/specs/` was modified
