# @montflow/telemetry

In-process OpenCode session telemetry. The server plugin appends normalized
events to day-rotated NDJSON under `$XDG_DATA_HOME/opencode/telemetry`
(default `~/.local/share/opencode/telemetry`); the viewer is an on-demand local
page with a realtime trace waterfall.

## Enable in OpenCode

OpenCode auto-loads plugins from `plugins/` directories. Create a global
re-export so every session collects:

```sh
mkdir -p ~/.config/opencode/plugins/telemetry
cat > ~/.config/opencode/plugins/telemetry/index.ts <<'TS'
export { default } from "/absolute/path/to/packages/telemetry/src/server.ts";
TS
```

For a single project, put the same file under `<project>/.opencode/plugins/telemetry/index.ts`.
Confirm collection by checking `~/.local/share/opencode/telemetry/YYYY-MM-DD.ndjson`
after a session, or `/mf-telemetry` inside OpenCode.

## Open the trace

- Inside OpenCode: `/mf-telemetry` (opens the current session).
- From a shell after `cd packages/telemetry && bun link`:
  `mf-telemetry` opens the newest folded session, or
  `mf-telemetry --session <id>` / `--directory <dir>` / `--no-open`.

The viewer starts on explicit action, binds a loopback port, and stops on the
page close beacon or the five-minute idle timeout.

## Delete history

From a shell:

```sh
mf-telemetry delete --all --yes
mf-telemetry delete --session <id> --yes
mf-telemetry delete --older-than 30d --yes
mf-telemetry cleanup --yes          # uses config.json retentionDays
```

Inside OpenCode, the same actions are arguments to the command:

```
/mf-telemetry delete --all
/mf-telemetry delete --session current
/mf-telemetry delete --older-than 7d
/mf-telemetry cleanup
```

Without `--yes`, the CLI asks for confirmation on a terminal and refuses on a
non-interactive stdin. A specific session is removed by rewriting the day
files, so the derived database is dropped and rebuilt by the next fold.

Run a CLI deletion while OpenCode is stopped, or use the slash command while
the session is open: the plugin closes its writer first. An external rewrite
can race the live writer, and an external `--all` can leave that writer
appending to a deleted inode until the next day rotation.

## Retention config

`config.json` in the data directory sets the shared retention window:

```json
{ "retentionDays": 14 }
```

`setup` prunes older day files (and the derived database) on every session,
`mf-telemetry cleanup` uses the same value, and an explicit `--older-than`
overrides it. A plugin `retentionDays` option wins over the file. Invalid or
missing values fall back to 30 days.

## Sessions and subagents

`session.created` payloads carry a `parentID` when the host creates a child
session. The fold stores it on `sessions.parent_id`, and the sidebar nests a
child under its parent with a `↳` marker. A child whose parent is not in the
store renders as a root. Correlation is one level of nesting, not a graph.

## Verify

```sh
bun run --cwd packages/telemetry test ts:check lint:check format:check
CHROME=/path/to/chromium bun run --cwd packages/telemetry viewer:acceptance
```
