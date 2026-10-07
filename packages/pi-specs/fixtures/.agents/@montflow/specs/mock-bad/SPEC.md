---
name: mock-bad
status: in-progress
workspace-type: in-place
author: Mock
created: 2026-01-01
locked-phases:
---

# Mock Bad

## Description

A deliberately broken spec used to exercise every failure path:
unknown task type, missing MEMORY.md, table/status drift, a forward
dependency, a Gates column without GATES.md, a phase with no review task,
a placeholder GATES.md, and a MEMORY.md missing a section.

## Requirements

- None of this is right.

## Tasks

| ID   | Name            | Type        | Status  | Gates |
| ---- | --------------- | ----------- | ------- | ----- |
| A001 | implement-thing | execution   | pending | Yes   |
| A002 | explore-thing   | exploratory | pending | No    |
| A003 | bad-kind        | chore       | pending | No    |
| B001 | late-thing      | execution   | pending | No    |
| B002 | gated-thing     | execution   | pending | Yes   |
| B099 | review-phase    | review      | pending | No    |
