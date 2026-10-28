---
id: C009
name: cleanup-remaining-skills
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C009: Clean up the remaining skills

## Type: execution

## Description

Apply the small, independent cleanups accepted in B001: a stale reference, a
dead annotation exception, and a JSDoc minimization.

## Requirements

- `setup-typescript-package`: retire the dangling `CHECKLIST.md` reference; fold
  anything worth keeping into the skill.
- `typescript-prefer-inference`: drop the `// perf:` annotation exception.
- `writting-jsdoc`: minimize — JSDoc is not required and is ultra-minimal when
  present.
- Update each touched skill's `CHANGELOG.md`.

## Completion

- [ ] Each cleanup is applied and changelogged
