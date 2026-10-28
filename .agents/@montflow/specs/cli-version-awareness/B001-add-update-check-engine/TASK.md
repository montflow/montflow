---
id: B001
name: add-update-check-engine
type: execution
originator: user
depends-on: A001, A002
related-tasks:
status: pending
---

# Task B001: add-update-check-engine

## Type: execution

## Description

Add the shared engine that decides whether a CLI is behind upstream and caches the verdict, so a warning is possible without a network round trip on every command.

## Requirements

- Source of truth is the GitHub repository: `git ls-remote --tags --refs <remote> '@montflow/<cli>@*'`, newest tag by SemVer; fall back to a `refs/heads/main` commit comparison when no tag matches.
- Exactly one request per check; no GitHub REST API, no token, no authentication, no response larger than the ref list.
- Hard timeout of 2 seconds. Timeout, DNS failure, no remote, or a non-git install yields `unknown`, prints nothing, and keeps exit code 0.
- The verdict is cached in `${XDG_CACHE_HOME:-~/.cache}/montflow/version-check.json`, keyed by package name and checkout path; successes live 24 hours, failures 1 hour, so an offline sandbox pays one timeout per day.
- Opt-outs: `MONTFLOW_NO_UPDATE_CHECK=1`, `--no-update-check`, and `CI=true` each skip the check entirely. No TTY detection — agents capture stdout and must still see the warning.
- `check({ force: true })` bypasses the cache; a forced check is the only path allowed to report a non-zero exit (1 = update available, 0 = current or unknown).
- Tests cover behind, current, ahead-of-newest-tag, unknown, cache hit, cache expiry, forced check, every opt-out, and a simulated timeout.

## Completion

- [ ] Done.
