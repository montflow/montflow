---
id: B007
name: fix-review-findings
type: execution
originator: user
depends-on: B099,B006
related-tasks: B099
finding-ref:
status: complete
---

# Task B007: Remediate Phase B review findings

## Type: execution

## Description

Fix the accepted Phase B adversarial-review findings via engine-dispatched
subruns (dogfooding B006): three disjoint fix runs in parallel under a
coordinator, then a verification run. All runs carry `parent: fix-coordinator`
and `related: review-phase-b`.

## Requirements

- Each finding dispositioned (resolved / open / blocked) with evidence.
- Package gates green after the fixes.

## Completion

- [x] 17/19 findings resolved with tests
- [x] Tests pass (`bun run --cwd packages/pi-runs test`, 88 tests)
- [x] Output summarized in MEMORY.md
