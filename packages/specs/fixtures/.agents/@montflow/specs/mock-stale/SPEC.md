---
name: mock-stale
status: in-progress
workspace-type: in-place
author: Mock
created: 2026-01-01
locked-phases: A
---

# Mock Stale

## Description

A bookkeeping contradiction: every task is complete and phase A is
locked, but the spec status is still `in-progress`.

## Requirements

- Flip status to complete.

## Tasks

| ID   | Name            | Type      | Status   | Gates |
| ---- | --------------- | --------- | -------- | ----- |
| A001 | implement-thing | execution | complete | No    |
| A099 | review-phase    | review    | complete | No    |
