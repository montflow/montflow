# Memory

## Context

Implement the surface chosen in `B001-render-surface/MEMORY.md` (§ Handoff): an
on-demand `Bun.serve` viewer with a virtualized list, started by `/telemetry`,
plus the surface-independent data layer (NDJSON tail + SQLite fold).

## Progress

- 2026-10-28: complete. `bun run --cwd packages/telemetry test` = **154 tests**
  (139 vitest + 15 bun:test), `ts:check`, `lint:check`, `format:check` green
  (41 formatted files).
- 20k acceptance run against the real viewer with a 20,000-line fixture
  (headless Chromium 144):
  - first row **129.7ms** (worst observed across runs 237ms; budget 1000ms)
  - **60 rows / 81 DOM nodes** (budget 120 rows / 300 nodes)
  - scroll over 120 steps: avg **16.67ms**, p95 **16.8ms**, max **16.8ms**,
    **0** frames over 20ms
  - JS heap **11.5MB** (budget 50MB)
  - appended NDJSON line visible in the page in **303ms** (budget 1000ms)
  - totals at 20k: `20000 spans · $23.9988 · 2399880 in / 599970 out` (cost and
    tokens from `session.step.ended` only)
- Real command path: a standalone OpenCode server loaded the local plugin
  directory; `POST /api/session/{id}/command` with `name: telemetry` returned
  200, `xdg-open` received a `127.0.0.1` viewer URL, the page served 200;
  `POST /close` closed the loopback port after the 10s grace period while the
  OpenCode server stayed up (no separate viewer process exists).
- Data layer: `modules/tail` (byte-offset reads, complete lines only),
  `modules/fold` (idempotent fold into `telemetry.db` with per-file offsets),
  `modules/sqlite` (the only driver adapter). Surface reads only these modules.

## Open Questions

- None blocking. The viewer runs in the plugin's server process; history and
  live data are memory-mapped through the same process, so a very large page
  competes with the session for memory. 20k spans measured at 11.5MB JS heap and
  the fold at ~144ms, well inside the budget.

## Handoff

### Shape

- `/telemetry` (registered by `setup` through `context.command`) dynamically
  imports `modules/viewer` (so the ingest path stays free of the viewer), starts
  a loopback server in-process, and hands the URL to `xdg-open`/`open`/`start`.
  Re-running the command reopens the active viewer URL; cleanup stops it.
- `modules/viewer` folds history at start (best effort, failure surfaced via
  `/api/status`), serves `/`, the JSON APIs, heartbeat, and close. Idle timeout
  is 5 minutes; the page heartbeats every 30s.
- The page's `pagehide` schedules close after a 10s grace period. A refresh
  re-heartbeats and cancels it; a closed tab exits after the grace period.
- Data layer files: `modules/tail`, `modules/fold`, `modules/sqlite`. The
  viewer imports them; none of them imports the viewer.

### Contract details B002 relies on

- `Line` files are `<UTC day>.ndjson`; tail ignores a trailing partial line and
  skips malformed lines. Offsets are byte offsets at the last newline.
- `telemetry.db` is derived state, safe to delete: `files(path, offset)`,
  `sessions(...)`, `spans(..., file, ...)`, with `PRAGMA user_version = 1`.
  Cost/tokens are summed from `session.step.ended` only (`usage.updated` is
  cumulative and would double-count).
- Folding uses a per-file `BEGIN IMMEDIATE`, so overlapping viewers serialize
  instead of duplicating rows. A file smaller than its stored offset has its
  spans replaced and its sessions rebuilt from the remaining rows.
- The page recycles between 60 and 120 `.row` elements based on viewport
  height; `windowRange` (in `CLIENT_SCRIPT`, shared with tests) computes the
  window. Totals are computed on data change, not per scroll frame.
- Live polling is 400ms. The page seeds cursors from the fold's per-file
  offsets (`{ fromFold: true }`), so bytes appended between the fold and page
  load are delivered. `/api/live` returns lines for every session and the page
  buffers them per session, so a sidebar switch does not drop a tail.
- The page rejects foreign `Host`/`Origin` headers, escapes the embedded
  session id, and renders fold failures separately from an empty store.

### Verification

- `bun run --cwd packages/telemetry test` (vitest for data/config/tail/fold/
  sqlite under Node exercising the `node:sqlite` fallback; `bun test` for the
  viewer because it uses `Bun.serve`).
- The browser acceptance harness was throwaway and is deleted; the numbers
  above are the recorded pass condition from B001. CI covers the page script
  parsing, the shared window/summary functions, the API layer, the lifecycle,
  and the packaged-artifact entry shape.

## Deviations

- **Viewer lifecycle is in-process**, not a dedicated child (B001's note
  proposed a child). The packaged artifact only emits `server.js`/`index.js`,
  so a child entry cannot survive `pack:plugins`; running the loopback server in
  the plugin process keeps `/telemetry` working on the shipped install and
  removes the launcher/orphan class of defects. `/telemetry` still starts it
  only on explicit action, and close/idle stops the listener.
- **Close uses a 10s grace period** so a refresh can re-heartbeat and cancel
  the shutdown. Closing a tab leaves only that listener for at most 10s.
- Viewer tests run under `bun test`, not `@effect/vitest`: the viewer needs
  `Bun.serve`/`Bun.sleep`, which are absent in the vitest Node worker. The
  package `test` script runs `vitest run --typecheck` then
  `bun test src/modules/viewer/tests`; vitest excludes the viewer directory.
- `node:sqlite` prints Node's experimental warning when the fallback is
  exercised under vitest. Expected; the Bun runtime uses `bun:sqlite`.
- The real command evidence used a standalone server and
  `POST /api/session/{id}/command` rather than the interactive TUI: `opencode
  run "/telemetry"` sends the text as a prompt, it does not invoke the command.
- `telemetry.db` is written by the viewer's fold. It is a derived cache of the
  NDJSON, never authoritative, and can be deleted without data loss.
