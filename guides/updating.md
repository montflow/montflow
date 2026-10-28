# Updating

This guide is the destination every stale notice names. It covers reading the
warning, checking on demand, updating the checkout, re-syncing installed
stores, and every opt-out.

Set `M` to the checkout you run the CLIs from:

```bash
export M="${M:-$HOME/src/montflow}"
```

The `mf-*` CLIs are run from a git checkout, not installed from npm. An update
is a `git pull` plus `bun install` in that checkout; the network check is
optional and only tells you an update exists.

## Reading the warning

When a CLI is behind upstream it prints one plain line on stderr:

```text
mf-skills 0.0.1 is behind 0.0.2 in /path/to/montflow — update: guides/updating.md#mf-skills
```

It names the installed version, the available version, the checkout, and the
section below for that CLI. Stdout and the command's exit code are unchanged.

## mf-skills

```bash
bun run --cwd "$M/packages/skills" cli version --check
```

Exits `0` with `current`, `unknown`, `ahead`, or `skipped`, and `1` with
`behind` or `diverged`.
Prove the update took effect:

```bash
bun run --cwd "$M/packages/skills" cli version --json
```

## mf-specs

```bash
bun run --cwd "$M/packages/specs" cli version --check
```

Prove the update took effect:

```bash
bun run --cwd "$M/packages/specs" cli version --json
```

## mf-prompts

```bash
bun run --cwd "$M/packages/prompts" cli version --check
```

Prove the update took effect:

```bash
bun run --cwd "$M/packages/prompts" cli version --json
```

## mf-profiles

```bash
bun run --cwd "$M/packages/profiles" cli version --check
```

Prove the update took effect:

```bash
bun run --cwd "$M/packages/profiles" cli version --json
```

## mf-reviews

```bash
bun run --cwd "$M/packages/reviews" cli version --check
```

Prove the update took effect:

```bash
bun run --cwd "$M/packages/reviews" cli version --json
```

## Installed stores

A workspace installed with `mf-skills sync` records what it received once the
sync manifest exists; `mf-skills version --dir <workspace>` reports the store
version when it does. `mf-skills sync --check` reports whether installed files
differ from the source, and `mf-skills sync` refreshes them.

## Opting out

Set any one of these to skip the check entirely:

- `MONTFLOW_NO_UPDATE_CHECK=1`
- `--no-update-check` on any command
- `CI=true`

There is no TTY detection: agents capture output, so the warning must still be
visible without a terminal.
