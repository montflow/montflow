# Memory

## Context

Implement the surface chosen in `B001-render-surface/MEMORY.md` (§ Handoff): an
on-demand `Bun.serve` viewer with a virtualized list, started by `/telemetry`,
plus the surface-independent data layer (NDJSON tail + SQLite fold).

## Progress

- 2026-10-28: complete. `bun run --cwd packages/telemetry test` = 110 tests
  (102 vitest + 8 bun:test), `ts:check`, `lint:check`, `format:check` green.
- 20k acceptance run against the real viewer with a 20,000-line fixture
  (headless Chromium 144):
  - first row **124.8ms** (worst observed across runs 237ms; budget 1000ms)
  - **60 rows / 80 DOM nodes** (budget 120 rows / 300 nodes)
  - scroll over 120 steps: avg **16.53ms**, p95 **16.8ms**, max **17.3ms**,
    **0** frames over 20ms
  - JS heap **11.3MB** (budget 50MB)
  - appended NDJSON line visible in the page in **303ms** (budget 1000ms)
- Real command path: a standalone OpenCode server loaded the local plugin
  directory; `POST /api/session/{id}/command` with `name: telemetry` returned
  200, `xdg-open` received a `127.0.0.1` viewer URL, the page served 200, and
  `POST /close` closed the port and exited the viewer process.
- Data layer: `modules/tail` (byte-offset reads, complete lines only),
  `modules/fold` (idempotent fold into `telemetry.db` with a per-file offset),
  `modules/sqlite` (the only driver adapter). Surface reads only these modules.

## Open Questions

- None blocking. The viewer child needs a `bun` executable on `PATH`
  (`Bun.which('bun')`); a machine that only has the compiled OpenCode binary
  cannot start the child until a bun runtime is available. The failure is
  swallowed, so collection and the session are unaffected.

## Handoff

### Shape

- `/telemetry` (registered by `setup` through `context.command`) imports
  `apps/viewer/launch` **dynamically** (so the ingest path stays free of the
  viewer), spawns `apps/viewer/main.ts` with `--directory`/`--session`, waits
  for the first stdout line, and hands the URL to `xdg-open`/`open`/`start`.
- `apps/viewer/main.ts` starts the module, prints the URL, and waits for
  `done`; SIGINT/SIGTERM stop it.
- `modules/viewer` folds history at start (best effort), serves `/`, the JSON
  APIs, heartbeat, and close. Idle timeout is 5 minutes; the page heartbeats
  every 30s and beacons `/close` on `pagehide`.
- Data layer files: `modules/tail`, `modules/fold`, `modules/sqlite`. The
  viewer imports them; none of them imports the viewer.

### Contract details B002 relies on

- `Line` files are `<UTC day>.ndjson`; tail ignores a trailing partial line and
  skips malformed lines. Offsets are byte offsets at the last newline.
- `telemetry.db` is derived state, safe to delete: `files(path, offset)`,
  `sessions(...)`, `spans(...)`. Cost tokens are summed from
  `session.step.ended` only (not `usage.updated`, which is cumulative).
- The page keeps exactly 60 recycled `.row` elements; `windowRange` clamps to
  the dataset. Summary totals are computed on data change, not per scroll frame.
- Live polling is 400ms; `/api/live` accepts `{ sessionID, cursors }` and
  returns new lines plus updated cursors. `{ fromEnd: true }` seeks to the
  current file sizes after history is loaded, so DB rows and live rows never
  duplicate.

### Verification

- `bun run --cwd packages/telemetry test` (vitest for data/config/tail/fold/
  sqlite under Node exercising the `node:sqlite` fallback; `bun test` for the
  viewer because it uses `Bun.serve`).
- The browser acceptance harness was throwaway and is deleted; the numbers
  above are the recorded pass condition from B001.

## Deviations

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
