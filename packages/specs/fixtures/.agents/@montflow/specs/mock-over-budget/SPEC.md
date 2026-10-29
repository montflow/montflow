---
name: mock-over-budget
status: complete
workspace-type: in-place
author: Mock
created: 2026-01-01
locked-phases: A
---

# Mock Over Budget

## Description

A spec whose phase A review series holds four rounds attributed to a phase
whose `tiny` tasks buy exactly one. Fails with one `review.budget-exceeded`
error naming the series, phase, budget, and actual count.

## Requirements

- Fails with the review budget error.

## Tasks

| ID   | Name            | Type      | Status   | Gates |
| ---- | --------------- | --------- | -------- | ----- |
| A001 | implement-thing | execution | complete | No    |
| A099 | review-phase    | review    | complete | No    |
