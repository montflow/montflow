---
id: A004
name: synthesize-ci-contract
type: exploratory
originator: user
depends-on: A001, A002, A003
related-tasks:
status: complete
---

# Task A004: Synthesize the CI contract

## Type: exploratory

## Description

Reduce A001–A003 to a single rule matrix and a candidate CI + hook shape,
naming the decisions Phase B must put to the user.

## Requirements

- Cover every check with: what it validates, its command, its cost, its existing coverage, and whether CI, the pre-push hook, or both should run it.
- Resolve the overlap with `release.yml` explicitly — reuse, delegate, or leave — with the reasoning.
- Propose a candidate CI job layout: jobs, sharding, caching, concurrency, timeouts, and required permissions.
- Propose a candidate pre-push hook design and its install path, drawn from A003.
- Propose the shared entry-point scripts and what each runs.
- List the open decisions Phase B must put to the user, each with its options and trade-offs.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [x] Rule matrix, candidate shape, and open-decision list captured in MEMORY.md
