---
id: A
objective: Ship the profile-runner prompt and the profiles variable source that powers it.
status: pending
review: waived
review-reason: Single-package behavior, review waived per light rigor.
review-evidence: A001:0, A002:0, A003:0
gate: none
serial-reason: Each task depends on the prior artifact — the profile-runner prompt cannot pass mf-prompts verify until A001 lands the profiles source literal, and A003 verifies the prompt A002 ships.
---

# Phase A

## Notes

Created by mf-specs init.

## Task dependencies

- A001 add-profiles-variable-source (no deps) — lands the `profiles` variable
  source in `mf-prompts`.
- A002 add-profile-runner-prompt (after A001) — ships the `profile-runner` prompt
  whose profile variable declares that source.
- A003 verify-profile-runner (after A002) — verifies the render/execute path and
  the `mf-profiles doctor` payload sync.