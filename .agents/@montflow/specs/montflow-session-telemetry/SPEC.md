---
name: montflow-session-telemetry
status: in-progress
workspace-type: worktree
author: Daniel Montilla
created: 2026-10-28
locked-phases:
---

# montflow-session-telemetry

## Description

Headless OpenCode session telemetry: in-process event ingest to a local SQLite trace store, plus `/telemetry`, a viewer for the entire trace of a session.

Collection must cost nothing to run: no collector, no daemon, no port, no network call. The OpenCode server already runs, so a plugin writes events from inside it.

The rendering surface is not assumed. A TUI panel may not survive a session with thousands of spans, and a webview means a second process and a real dependency choice. Phase B measures the candidates before any viewer code is written, then implements the one that holds up.

## Requirements

- Collection is in-process. The server plugin writes during a session; nothing else is started to collect.
- Ingest has no port, no listener, and no network call.
- The ingest path is dependency-free. NDJSON append via `node:fs`; no native module on the write path.
- Telemetry never fails a session. Every write is best-effort, logged at most once, and swallowed.
- Data lives under `$XDG_DATA_HOME/opencode/telemetry` (default `~/.local/share/opencode/telemetry`), never inside OpenCode's own database.
- Default capture excludes streaming deltas and message bodies. Both are opt-in per plugin options.
- One read path materializes `telemetry.db` for history. SQLite access is isolated in a single adapter with `bun:sqlite` then `node:sqlite` runtime detection.
- The viewer surface is chosen by measurement, not assumption: an in-TUI panel, a localhost browser UI, or an embedded webview. The decision and its acceptance test live in `B001-render-surface/MEMORY.md` (§ Handoff).
- The viewer starts only on explicit user action and exits on close or idle timeout. It never collects, never writes authoritative state, and a session must run fine without it.
- Large traces are a first-class case: 20k spans must stay usable, with virtualization named in the decision.
- Out of scope: OTLP export, external collectors, remote sync, cross-machine aggregation, evaluations, prompt management.

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | ingest | execution | complete | Yes |
| A099 | review-phase | review | pending | No |
| B001 | render-surface | exploratory | complete | No |
| B002 | dashboard | execution | complete | Yes |
| B099 | review-phase | review | pending | No |
