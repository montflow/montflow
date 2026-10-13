---
id: A002
name: explore-profile-binding
type: exploratory
originator: user
depends-on:
related-tasks:
status: pending
---

# Task A002: Map how profiles bind to reviewers

## Type: exploratory

## Description

Map how a profile is referenced, verified, and turned into a session today, and
assess the existing `effect-reviewer` profile as the code-phase reviewer. The
goal is to know exactly what it takes for a declared profile to drive a spawned
reviewer session.

## Requirements

- Record the PROFILE.md contract (frontmatter `name`, `description`, `model`, `skills`) and how a profile is discovered and verified.
- Record how `pi-reviews` references a profile today: the optional ledger `Profile:` field, the `ProfileProbe` verification, and the fact that dispatch takes no profile.
- Identify what a profile would need to drive session dispatch: applying its `model` and `thinking`, loading its `skills`, and how a session's tools are chosen.
- Assess the `effect-reviewer` profile as the code-phase reviewer: its skills and checklist, its missing `model` pin, and how it composes with a general reviewer over the same phase.
- Note any profile field that has no consumer today and would stay informational.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Profile contract, reference, and verification path captured in MEMORY.md
- [ ] Session-driving requirements and the effect-reviewer fit recorded
