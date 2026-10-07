---
id: C005
name: verify-release-boundary
type: execution
originator: planner:B002
depends-on: C003
related-tasks:
status: complete
---

# Task C005: Verify the release boundary

## Type: execution

## Description

`release.yml` is deliberately kept as is (B001 decision 6). Confirm the new
workflow does not touch it and document why release keeps its own conditions.

## Requirements

- Confirm `.github/workflows/release.yml` is unchanged by this spec (`git diff` shows nothing for it).
- Document the boundary in the `verify.yml` header comment: release checks are per-publish-candidate conditions, not a repo gate.
- Confirm no push path is left without checks; note that a release push overlaps `release.yml`'s per-package checks, which is accepted.
- Keep the changesets publish path (tokens, OIDC) working.

## Completion

- [x] `release.yml` unchanged; boundary documented
