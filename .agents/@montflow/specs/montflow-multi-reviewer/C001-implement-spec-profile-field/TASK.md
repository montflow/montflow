---
id: C001
name: implement-spec-profile-field
type: execution
originator: user
depends-on: B003
related-tasks:
status: complete
---

# Task C001: Add the review-task profile field

## Type: execution

## Description

Add the `profiles` field to the task contract and make the scaffold emit it on
the generated review task, so a phase can declare its reviewer profiles.

## Requirements

- Extend the task frontmatter schema so a review task may carry an ordered `profiles` list of kebab-case profile names; absent or empty preserves today's behavior.
- Extend `verifyTaskFile` to accept the field and to reject a non-slug profile name with an actionable issue.
- Emit the field on the scaffold's review task, defaulting to empty, and accept a profile list through the scaffold input.
- Add unit tests for the field: present, absent, invalid, and empty.
- Update the authoring-spec contract text to document the field.

## Completion

- [x] `profiles` parsed and verified on the task contract
- [x] Scaffold emits the field on the review task
- [x] Tests green for all four cases
- [x] GATES.md passed
