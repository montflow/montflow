# Updating

This guide is the destination every stale notice names. It covers reading the
warning, checking on demand, updating the checkout, re-syncing installed
stores, and every opt-out.

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

Exits `0` with `current`, `unknown`, or `ahead`, and `1` with `behind`.
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

A workspace installed with `mf-skills sync` records what it received in
`.agents/skills/.montflow-sync.json`. `mf-skills version --dir <workspace>`
reports that store version; `mf-skills sync --check` reports whether it is
behind, and `mf-skills sync` refreshes it.

## Opting out

Set any one of these to skip the check entirely:

- `MONTFLOW_NO_UPDATE_CHECK=1`
- `--no-update-check` on any command
- `CI=true`

There is no TTY detection: agents capture output, so the warning must still be
visible without a terminal.
