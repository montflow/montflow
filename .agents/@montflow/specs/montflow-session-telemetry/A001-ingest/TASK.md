---
id: A001
name: ingest
type: execution
originator: user
depends-on:
related-tasks: A002
status: complete
---

# Task A001: ingest

## Type: execution

## Description

Create `packages/telemetry` (`@montflow/telemetry`) and ship its server plugin entry: an in-process subscriber that appends a normalized event stream to local NDJSON files. This task builds collection only. It exposes no UI, opens no database, and creates no process.

The plugin runs inside the OpenCode server, which is already running whenever a session exists. That is the whole collection mechanism. Nothing is started, listened on, or connected to.

Existing reference implementations to read before writing code, not to depend on:

- `xrmghost-maintainer/opencode-telemetry` — in-process write pattern and migration layout.
- `DEVtheOPS/opencode-plugin-otel` — the V2 event-to-signal mapping and token/cost field names.

## Requirements

- `packages/telemetry` follows repo package conventions: `@montflow/telemetry`, package scripts `test`, `ts:check`, `lint:check`, `format:check`, colocated `.test.ts` files, `src/index.ts` entry.
- The plugin is `Plugin.define({ id: "montflow.telemetry" })`. `setup` returns a cleanup function that flushes and closes the writer.
- Subscription uses an explicit type allowlist: `session.created`, `session.execution.started|succeeded|failed|interrupted`, `session.step.started|ended|failed`, `session.tool.called|success|failed`, `session.usage.updated`, `session.compaction.started|ended|failed`, `session.retry.scheduled`, `session.idle`, `session.inbox.enqueued`, `permission.asked|replied`.
- `session.text.delta`, `session.reasoning.delta`, `session.tool.input.delta`, and `session.compaction.delta` are not persisted unless `captureDeltas: true` is set.
- exactly one JSON object per line: `{ v: 1, ts, type, sessionID, agent?, model?, payload }`. Events that fail extraction are skipped, never fatal.
- Files are `YYYY-MM-DD.ndjson` under `$XDG_DATA_HOME/opencode/telemetry` (default `~/.local/share/opencode/telemetry`). The directory is overridable by the `directory` plugin option for tests.
- Rotation is by UTC day. At `setup`, files older than `retentionDays` (default 30) are pruned; pruning failure is logged and ignored.
- Message bodies are not written by default. Store `sha256`, byte length, and token counts; write raw text only when `captureBodies: true`.
- Every write is wrapped. A thrown write logs once, then disables the writer for the process lifetime. Telemetry failure must never surface into the session.
- The ingest module imports no SQLite driver and no network API. This is asserted by test, not by convention.
- Tests: replay a recorded event fixture and assert file contents, line order, and session attribution; assert an injected write error does not propagate and disables the writer; assert delta events are absent by default and present when enabled.

## Completion

- [x] `packages/telemetry` exists and passes `bun run --cwd packages/telemetry test ts:check lint:check format:check` (run per script; 66 tests).
- [x] A real OpenCode session produces a non-empty NDJSON file under the default directory (12 lines at `~/.local/share/opencode/telemetry/2026-10-28.ndjson`).
- [x] Killing the session mid-run leaves a readable, partially written file with no corrupt line (SIGKILL run: every line parses, file newline-terminated).
