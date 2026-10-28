---
id: C099
name: review-phase
type: review
originator: user
depends-on: C005
related-tasks: C001, C002, C003, C004, C005
reviewer-profiles: effect-reviewer
status: complete
---

# Task C099: Review phase C

## Type: review

## Description

Run an independent adversarial review over phase C. The claim under test is that
every montflow plugin loads in a real OpenCode host and exposes the same picker
behaviour, with no plugin keeping its own dialog or store-duplication copy.

## Requirements

- Findings written to the phase review round.
- Each plugin entry is imported through the host loader path; an entry that only
  loads in tests is a finding.
- The shared picker is checked for real sharing: a plugin that reimplements
  dialog, search, or insertion is a finding.
- The prompts stopgap is confirmed gone, with no second command implementation
  left in `.opencode/plugins/`.
- Silent output paths are checked: any command that can fail or reply without
  reaching the session is a finding.
- The verification check is challenged: name the load failure it would miss.

## Completion

- [x] Findings written and reviewed (rounds 001-003, both series).
