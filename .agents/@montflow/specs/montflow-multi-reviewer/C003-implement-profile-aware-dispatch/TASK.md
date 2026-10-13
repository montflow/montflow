---
id: C003
name: implement-profile-aware-dispatch
type: execution
originator: user
depends-on: B003, C002
related-tasks:
status: pending
---

# Task C003: Make review dispatch profile-aware

## Type: execution

## Description

Teach `startReview` to dispatch one reviewer session per declared profile,
applying the profile's model and thinking and stamping the series ledger with
the profile.

## Requirements

- Accept a reviewer profile in dispatch and start one session per profile; each session runs the unchanged `montflow-adversarial-review` skill against its own series.
- Apply the profile's `model` and `thinking` to the spawned session, falling back to the request's pins when the profile leaves them unset.
- Stamp the series ledger `Profile:` for each series and verify the profile through the existing `ProfileProbe`.
- Fail before starting a session when a declared profile is unknown or fails verification.
- Add tests: one profile, two profiles, unknown profile, and unchanged single-reviewer behavior when no profile is declared.

## Completion

- [ ] Dispatch starts one session per profile with the profile's model and thinking
- [ ] Ledger profile stamped and profile verified before dispatch
- [ ] Tests green for all listed cases
- [ ] GATES.md passed
