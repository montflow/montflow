---
id: E002
name: test-profile-create
type: execution
originator: user
depends-on: E001
related-tasks:
status: complete
---

# Task E002: End-to-end tests for agentic profile creation

## Type: execution

## Description

Cover the refactored flow: runs-extension absent → install gate; dispatch →
toast + run row; completion → profile refresh + detail open; failure paths toast
without regressing manual creation.

## Requirements

- Gate, success, and failure paths covered.
- Runner faked at the service boundary.
- Manual profile creation tests keep passing.

## Completion

- [ ] Tests pass (`bun run --cwd apps/workspace test`)
- [ ] Output summarized in MEMORY.md
