# @montflow/telemetry

In-process OpenCode session telemetry. The server plugin appends normalized
events to day-rotated NDJSON under `$XDG_DATA_HOME/opencode/telemetry`
(default `~/.local/share/opencode/telemetry`); the viewer is an on-demand local
page with a realtime canvas timeline.

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
