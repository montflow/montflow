---
id: F002
name: enforce-dependency-contract
type: execution
originator: planner:F001
size: medium
depends-on: F001, C001
related-tasks: E001
status: pending
---

# Task F002: enforce the dependency-integrity contract

## Type: execution

## Description

Implement F001's rules in the dependency verification path. The explicit graph
checks stay: unknown targets, self-reference, forward-phase edges, and cycles.
Add the implicit contradictions: a non-review task that reaches its own phase's
review task, a `complete` task with an incomplete dependency, a repeated
`depends-on` id, and a `related-tasks` entry that does not resolve. Every
finding is coded, actionable, and covered by a fixture.

## Requirements

- Reject a non-review task whose `depends-on` closure reaches a `review` task in
  its own phase, reporting the path from the task to the review. A dependency
  on an earlier phase's review task stays valid.
- Reject a `complete` task whose `depends-on` target exists but is not
  `complete`. An unknown target keeps its existing finding and does not also
  become a status finding.
- Reject a repeated id in `depends-on`; normalize nothing silently.
- Reject a `related-tasks` entry that names no task or names the task itself. A
  valid cross-phase target stays valid.
- Give every new finding a stable code, an expected/actual pair where it
  applies, and a fix that names the record to edit.
- Add a fixture per rule: a direct review dependency, a transitive review
  dependency through a same-phase chain, complete-before-dependency, a
  duplicate id, a dangling `related-tasks`, a self `related-tasks`, and a
  passing fixture with an earlier-phase review dependency.
- Update `packages/specs/src/modules/structure/CONTEXT.md` and the task module
  context with the rules they now enforce.
- No existing spec in the store gains a finding; the baseline scan F001 records
  is the proof.

## Completion

- [ ] A non-review task reaching its own phase's review fails with a coded
      finding naming the path
- [ ] A complete task with an incomplete dependency fails; an unknown
      dependency reports only its existing finding
- [ ] Duplicate `depends-on` and unresolvable or self `related-tasks` fail with
      their own codes
- [ ] A dependency on an earlier phase's review task passes
- [ ] `bun run --cwd packages/specs test` passes with the new fixtures
- [ ] `bun run mf-specs:check` reports zero issues for every spec in the store
- [ ] `ts:check`, `lint:check`, and `fmt:check` pass
