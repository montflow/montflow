# Updating

This guide is the single destination every stale notice names. It covers
reading the warning, checking on demand, updating the checkout, re-syncing an
installed store, verifying the result, and every opt-out.

The `mf-*` CLIs are run from a git checkout, not installed from npm. An update
is a `git pull` plus `bun install` in that checkout; the network check is
optional and only tells you an update exists.

```bash
export M="${M:-$HOME/src/montflow}"
M="$(cd "$M" && pwd)"
```

Every step after the checkout is present works offline. `git pull` and
`bun install` need the network; `version --check` and the automatic notice do
too, and both are opt-outable.

## Reading the warning

When a CLI is behind upstream it prints one plain line on stderr:

```text
mf-skills 0.0.1 is behind 0.0.2 in /path/to/montflow — update: guides/updating.md#mf-skills
```

It names the installed version, the available version, the checkout, and the
section below for that CLI. A `diverged` checkout gets the same line with
`has diverged from`. Stdout and the command's exit code are unchanged, and the
line appears at most once per checkout per 24 hours.

## Update the checkout

```bash
git -C "$M" pull
(cd "$M" && bun install)
```

`bun install` is required after a pull: workspace dependencies are linked from
the lockfile. The guide never asks for a global install or an npm package.

## mf-skills

Check on demand:

```bash
bun run --cwd "$M/packages/skills" cli version --check
```

Exit codes: `0` for `current`, `unknown`, `ahead`, or `skipped`; `1` for
`behind` or `diverged`. Prove the update took effect:

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
`.agents/skills/.montflow-sync.json`: source path, remote, commit, ref,
version, sync time, and a version plus content hash per skill.

Report the store from any checkout:

```bash
bun run --cwd "$M/packages/skills" cli version --dir "$PWD"
```

A managed store prints `store <version> (<commit>)`; a store without a manifest
prints `store unmanaged`; a damaged manifest prints `store corrupt|unreadable|unsupported manifest`;
no store line means no store. A damaged manifest fails `sync` instead of being
treated as unmanaged.

Re-sync and inspect drift before writing:

```bash
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD" --check
```

Each skill reports `current`, `stale`, `diverged`, or `unmanaged` (internal
skills report `skipped`). `--check` writes nothing and exits `1` for `stale`,
`diverged`, or an `unmanaged` store whose bytes differ; it exits `0` otherwise. A
corrupt or unsupported manifest is a non-zero error, not a blessing. An
`unmanaged` store keeps the older byte comparison.

Apply an update:

```bash
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD"
```

A normal sync overwrites `stale` skills, prunes files the source deleted, and
refreshes the manifest. It refuses
to overwrite a skill marked `diverged` (someone edited it locally). Review the
named files, then pass `--force` to replace them:

```bash
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD" --force
```

Prove the store is current:

```bash
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD" --check
```

It is updated when every skill reports `current` and the exit code is `0`.

## Opting out

Set any one of these to skip the automatic check entirely:

- `MONTFLOW_NO_UPDATE_CHECK=1`
- `--no-update-check` on any command
- `CI=true`

There is no TTY detection: agents capture output, so the warning must still be
visible without a terminal. An explicit `version --check` is the only path that
turns staleness into a non-zero exit.

## mf-references

```bash
bun run --cwd "$M/packages/references" cli version --check
```

Prove the update took effect:

```bash
bun run --cwd "$M/packages/references" cli version --json
```
