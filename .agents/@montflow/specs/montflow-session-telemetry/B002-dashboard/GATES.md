## Stage 0: Verification

- [x] formatting passes (`bun run --cwd packages/telemetry format:check` — 41 files)
- [x] linting passes (`bun run --cwd packages/telemetry lint:check` — no warnings)
- [x] typecheck passes (`bun run --cwd packages/telemetry ts:check`)
- [x] tests pass (`bun run --cwd packages/telemetry test` — 154 tests: 139 vitest + 15 bun)

## Stage 1: Surface

- [x] /mf-telemetry` opens the surface chosen in `B001-render-surface/MEMORY.md` (§ Handoff) (real OpenCode server: `POST /api/session/{id}/command` with `name: telemetry` returned 200; the fake `xdg-open` received a `http://127.0.0.1:PORT/` URL that served the viewer with HTTP 200; the in-process viewer left only the OpenCode server listener after close)
- [x] a 20k-span fixture meets the recorded acceptance test (first row 129.7ms ≤ 1000ms; 60 rows / 81 nodes ≤ budget; scroll avg 16.67ms, p95 16.8ms, max 16.8ms, 0 frames over 20ms; heap 11.5MB ≤ 50MB; live append visible in 303ms ≤ 1000ms; worst observed first row across runs 237ms)
- [x] closing the viewer leaves no process behind (no separate viewer process exists; `POST /close` closes the loopback listener after the 10s grace period, and `viewer.test.ts` covers close, idle, and the refresh-cancelled close)
- [x] nothing listens before the user asks (setup only subscribes and registers the command; `Bun.serve` exists only in the viewer module, reached by a dynamic import from the command, and the isolation test keeps it out of the ingest path)

## Stage 2: Data layer

- [x] the live tail reads only bytes appended since the last offset (`tail.test.ts` asserts the offset and an empty second read; `viewer.test.ts` asserts 12 → 0 → 1 lines across two polls plus an append, and resumes from the fold offsets so the fold-to-page window is not lost)
- [x] folding twice produces the same rows (`fold.test.ts`: second run returns `{ files: 0, spans: 0 }` and the span count/cost stay identical; a concurrent two-fold run still produces 12 spans)
- [x] history renders after the source NDJSON is pruned (`fold.test.ts` and `viewer.test.ts`: delete the day file, `/api/sessions` and `/api/spans` still return the session)
- [x] an absent store renders an empty state instead of throwing (`viewer.test.ts`: `/api/sessions` is `[]`; the page contains the explicit “No telemetry yet” state, and a fold failure is reported separately via `/api/status`)

## Stage 3: Isolation

- [x] the viewer never writes NDJSON or authoritative state (isolation test: only `modules/store/store.module.ts` appends/writes `.ndjson`; the viewer reads NDJSON and writes only the derived `telemetry.db`, stamped with `PRAGMA user_version`)
- [x] the ingest path still imports no SQLite driver (isolation test: driver references exist only in `modules/sqlite/sqlite.module.ts`)
- [x] the ingest path still imports no network API (isolation test: no `fetch`, `Bun.serve`, `node:http(s)`, listener, or child process in `server.ts` + `modules/{config,digest,event,path,platform,plugin,store}`)
