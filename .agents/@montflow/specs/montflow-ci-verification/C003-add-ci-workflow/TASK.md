---
id: C003
name: add-ci-workflow
type: execution
originator: planner:B002
depends-on: C002
related-tasks:
status: complete
---

# Task C003: Add the GitHub Actions verification workflow

## Type: execution

## Description

Author `.github/workflows/verify.yml` as a push-to-main matrix of per-artifact
verifications and repo checks, per B001 decisions 1–2.

## Requirements

- Trigger `push` to `branches: [main]` only; `permissions: { contents: read }`; concurrency on workflow+ref; `timeout-minutes: 15`.
- A setup job installs with `--frozen-lockfile` and the pinned bun version, caching `~/.bun/install/cache` keyed on `bun.lock`.
- A matrix job with one cell per check: skills, prompts, specs, profiles, runs freshness, lint, format, typecheck, test — each calling its own shared script so a failure names the target.
- A header comment documents the boundary with `release.yml` (kept as is).
- No secrets or write permissions.

## Completion

- [x] Workflow authored and locally validated (scripts exist; YAML is plain mapping/sequence)
