# Memory

## Context

B001 adds the engine that decides whether one CLI is behind upstream and
caches the verdict. The source of truth is the git repository, read with one
`git ls-remote` request and no GitHub API, token, or authentication.

Design decisions:

- One request fetches both the package's tags and `refs/heads/main`:
  `git ls-remote --refs <remote> '@montflow/<cli>@*' 'refs/heads/main'`.
  The spec's example used `--tags`, but `--tags` excludes heads, and a second
  request would violate the "exactly one request per check" rule. `--refs`
  keeps one request and supports the commit fallback.
- The remote defaults to `https://github.com/montflow/montflow`.
- Verdicts: `behind`, `current`, `ahead` (local version newer than the newest
  tag), `unknown` (probe failed/timeout/non-git), `skipped` (opt-out).
- Commit fallback is only used when no tag matches: equal commits → `current`,
  different → `behind` with the main commit as the available identity.
- Cache: `${XDG_CACHE_HOME:-$HOME/.cache}/montflow/version-check.json`, entries
  keyed by package name + checkout path. Successes 24h, failures 1h. A missing
  HOME disables caching rather than failing the check.
- The probe is an injectable port (`Probe`), so tests stub the git call at the
  process boundary; the default implementation is the only place that spawns.
  The default probe reuses `BuildInfo.probeEnv` so ambient `GIT_DIR` and
  friends cannot redirect it.
- Timeouts are `Effect.timeoutOption(2s)`, driven by `TestClock` in tests.

## Progress

- complete: `packages/version/src/modules/update-check` with `check`,
  `compareSemVer`, `parseSemVer`, `versionOfTag`, `decide`, `cacheKey`,
  `cacheFileFor`, `skipReason`, and the default git probe.
- 13 runtime tests (plus typecheck duplicates) cover behind, current,
  ahead-of-newest-tag, unknown, commit fallback, cache hit, real on-disk cache
  expiry, forced check, per-checkout keys, all three opt-outs, the 24h/1h
  lifetimes, and a simulated two-second timeout. No test performs network I/O.
- Verified: `bun run --cwd packages/version {format:check,lint:check,ts:check,test}`
  all exit 0; version suite 84 passing.

## Open Questions

- None.

## Handoff

- B002 consumes `check` and the `Probe` type; the notice layer writes
  `notifiedAt` into the same cache file to enforce once-per-24h-per-checkout.
- A forced check is the only mode B002 may turn into exit 1.

## Deviations

- `--tags` dropped in favour of `--refs` so the heads fallback stays within one
  request. Recorded above.
