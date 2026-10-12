---
id: A004
name: add-artifact-reference-resolution
type: execution
originator: user
depends-on: A001
related-tasks: A003
status: pending
---

# Task A004: add artifact reference resolution

## Type: execution

## Description

Make a broken `skills:` reference a finding instead of silence. The five spec-role
profiles and two pipeline prompts authored for this overhaul add roughly thirty
new references, and today every one of them could name a nonexistent skill and
still verify clean.

## Requirements

- `verifyProfileFile` and `verifyPromptFile` resolve each `skills:` entry against the workspace skill store and report an unresolved name by its exact name.
- An unresolved reference is a warning by default, so adding a skill locally cannot red-out CI; strict mode makes it an error.
- Resolution honors the store the caller already targeted with `--dir`, and reports the root it searched so a miss is diagnosable.
- Both verifiers keep working when no skill store exists at all, such as a package fixture or a fresh clone, with no crash and no false issue.
- Existing fixtures and artifacts that reference real skills are unaffected.

## Completion

- [ ] A profile and a prompt naming a nonexistent skill now report the name instead of verifying clean, shown by an actual run
- [ ] The same artifacts verify clean once the name is corrected
- [ ] `bun run verify:montflow:profiles` and `bun run verify:montflow:prompts` still report zero issues
- [ ] Tests cover the no-store case and the strict promotion
