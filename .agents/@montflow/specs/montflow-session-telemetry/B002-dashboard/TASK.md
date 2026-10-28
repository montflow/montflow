---
id: B002
name: dashboard
type: execution
originator: user
depends-on: B001
related-tasks: A001, B001
status: complete
---

# Task B002: dashboard

## Type: execution

## Description

Implement the viewer surface chosen in `B001-render-surface/MEMORY.md` (§ Handoff), plus the read path it needs. `/telemetry` opens the current session as a live trace; history across sessions reads from `telemetry.db`.

This task implements a decision, it does not re-litigate one. If the chosen surface cannot meet the acceptance test in `B001-render-surface/MEMORY.md` (§ Handoff), stop and send the finding back to B001 rather than silently lowering the bar.

The data layer is surface-independent and lands first: incremental NDJSON tail for the live view, SQLite fold for history. The chosen surface is a consumer of that layer, so it stays swappable.

## Requirements

- `B001-render-surface/MEMORY.md` (§ Handoff) is present and its acceptance test is the pass condition for this task.
- The shared data layer ships as its own module with no surface imports: NDJSON tail by byte offset, and a fold into `telemetry.db` that records the last consumed offset per file.
- Live view reflects events within one second of the writer appending them, for the session that is currently running.
- History view lists prior sessions and renders a completed session after its NDJSON file has been pruned.
- SQLite access is isolated in one adapter module: `bun:sqlite` first, `node:sqlite` fallback, read-only where possible, WAL, `busy_timeout=5000`. No other module imports a driver.
- `/telemetry` remains the only entry point and works from the command surface chosen in B001.
- Any process the viewer needs is started by that entry point and exits on close or after the idle timeout named in the decision. Nothing listens before the user asks.
- Collection is untouched: the viewer never writes NDJSON, never writes authoritative state, and never becomes required for a session to run.
- Malformed NDJSON lines are skipped. An empty or absent store renders an explicit empty state.
- Tests cover: incremental tail reading only new bytes; fold idempotence across two runs; span rows and cost totals from a fixture; empty-state rendering; and the viewer's start/stop lifecycle without a real display.
- Tests also assert the collection path still imports no driver and no network API after the viewer lands.

## Completion

- [x] `/telemetry` opens the chosen surface for the current session in a real OpenCode run (standalone server command POST → fake opener URL → HTTP 200; see MEMORY).
- [x] The view updates while a session streams (appended line visible in 303ms; poll interval 400ms).
- [x] A 20k-span fixture meets the acceptance test recorded in `B001-render-surface/MEMORY.md` (§ Handoff) (first row 129.7ms, 60 rows/81 nodes, p95 16.8ms with 0 dropped frames, heap 11.5MB).
- [x] A completed session remains viewable after its NDJSON file is pruned (fold test + viewer test).
- [x] Closing the viewer leaves no process behind (port closed and viewer PID gone; lifecycle test).
- [x] `bun run --cwd packages/telemetry test ts:check lint:check format:check` passes (scripts run individually; 154 tests).
