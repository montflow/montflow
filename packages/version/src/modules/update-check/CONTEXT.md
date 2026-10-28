# Update check

Decides whether one `mf-*` CLI is behind its upstream git repository and caches
the verdict so the check can run on every command.

## Belongs here

- One `git ls-remote` probe per check: the package's tags plus `refs/heads/main`.
- SemVer comparison of the newest matching tag, with a commit fallback when no
  tag matches.
- A two-second cap, and `unknown` for timeouts, DNS failures, no remote, or a
  non-git install.
- Disk cache under `${XDG_CACHE_HOME:-$HOME/.cache}/montflow/version-check.json`,
  keyed by package and checkout: 24h for successes, 1h for failures.
- Opt-outs: `MONTFLOW_NO_UPDATE_CHECK=1`, `--no-update-check`, `CI=true`.
- An injectable `Probe` so tests never touch the network.

## Does not belong here

- Printing the notice or choosing an exit code (the CLI/runner layer).
- Install identity (package version/commit) — that is `BuildInfo`.
- Fetching or mutating the checkout.
