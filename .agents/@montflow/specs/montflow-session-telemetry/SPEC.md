---
name: montflow-session-telemetry
status: complete
workspace-type: worktree
author: Daniel Montilla
created: 2026-10-28
locked-phases: A, B, C
---

# montflow-session-telemetry

## Description

Headless OpenCode session telemetry: in-process event ingest to a local NDJSON
store and a derived SQLite history, plus `/telemetry`, a single on-demand
viewer for the entire trace of a session.

Collection must cost nothing to run: no collector, no daemon, no port, no
network call. The OpenCode server already runs, so a plugin writes events from
inside it.

The viewer is a local browser surface: a thin DOM shell around a GPU-rendered
timeline. A running session grows the timeline as events arrive; the trace
carries provider and tool identity with hover detail. Phase C replaces the
phase B DOM row list with that canvas surface and keeps the data layer intact.

Phases A and B are historical: A collected events; B proved a virtualized list
and shipped the data layer. `B001`'s DOM surface is superseded by `C001`.

## Requirements

- Collection is in-process. The server plugin writes during a session; nothing else is started to collect.
- Ingest has no port, no listener, and no network call.
- The ingest path is dependency-free. NDJSON append via `node:fs`; no native module on the write path.
- Telemetry never fails a session. Every write is best-effort, logged at most once, and swallowed.
- Data lives under `$XDG_DATA_HOME/opencode/telemetry` (default `~/.local/share/opencode/telemetry`), never inside OpenCode's own database.
- Default capture excludes streaming deltas and message bodies. Both are opt-in per plugin options.
- One read path materializes `telemetry.db` for history. SQLite access is isolated in a single adapter with `bun:sqlite` then `node:sqlite` runtime detection.
- The viewer surface is chosen by measurement, not assumption; `C001-canvas-surface/MEMORY.md` (§ Handoff) is the current decision and acceptance test.
- The viewer is realtime: a running session's timeline appends within one second, without a full page reload. Follow-tail is the default; manual scroll pauses it and an explicit action resumes it.
- The trace embeds identity: local provider/model and tool icons, plus hover tooltips with the span's type, agent, model, cost, tokens, duration, and redacted payload summary. No network fetch for assets.
- The viewer starts only on explicit user action and exits on close or idle timeout. It never collects, never writes authoritative state, and a session must run fine without it.
- Large traces are a first-class case: 20k spans must stay usable, with canvas culling, level-of-detail, and a typed-array layout named in the decision.
- Out of scope: OTLP export, external collectors, remote sync, cross-machine aggregation, evaluations, prompt management.

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | ingest | execution | complete | Yes |
| A099 | review-phase | review | complete | No |
| B001 | render-surface | exploratory | complete | No |
| B002 | dashboard | execution | complete | Yes |
| B099 | review-phase | review | complete | No |
| C001 | canvas-surface | exploratory | complete | No |
| C002 | realtime-canvas | execution | complete | Yes |
| C003 | trace-embeds | execution | complete | Yes |
| C099 | review-phase | review | complete | No |
