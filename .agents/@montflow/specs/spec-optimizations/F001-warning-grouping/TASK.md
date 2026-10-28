---
id: F001
name: warning-grouping
type: execution
originator: user
size: small
depends-on: 
related-tasks:
status: pending
---

# Task F001: warning-grouping

## Type: execution

## Description

`mf-specs check` prints 79 full `task.missing-size` diagnostics on every run, so the gate log is 640 lines and the signal is buried. The warnings are advisory historical data and need no backfill.

Group them without hiding the count or the detail.

## Requirements

- Group warning-severity findings in `renderCheck` by spec and code: one line per group with the count, the code, and a representative path or fix pointer; the count is never hidden.
- Errors keep the existing full diagnostic blocks and aggregate across every spec.
- `--verbose` expands each grouped warning into its full coded diagnostic; without it the current tree stays under roughly 25 lines.
- `--strict` still promotes warnings, counts them as failures, and renders the promoted findings as errors.
- Tests cover one code across several specs, several codes in one spec, verbose expansion, zero warnings, and strict promotion.

## Completion

- [ ] The current tree renders its 79 warnings in grouped one-line summaries
- [ ] `mf:check:specs` stays under roughly 25 lines on the current tree
- [ ] `--verbose` expands every grouped warning
- [ ] `--strict` and error rendering are unchanged
- [ ] Grouping, verbose, empty, and strict tests pass
