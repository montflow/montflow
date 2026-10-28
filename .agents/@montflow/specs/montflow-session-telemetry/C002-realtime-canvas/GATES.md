## Stage 0: Verification

- [x] formatting passes (`bun run --cwd packages/telemetry format:check` — 44 files)
- [x] linting passes (`bun run --cwd packages/telemetry lint:check` — no warnings)
- [x] typecheck passes (`bun run --cwd packages/telemetry ts:check`)
- [x] tests pass (`bun run --cwd packages/telemetry test` — 172 tests: 156 vitest + 16 bun)

## Stage 1: Realtime growth

- [x] an NDJSON append appears on the timeline within one second (20,001st span at 254ms)
- [x] the page updates without a reload or a full trace rebuild (one `addParticle`; no rebuild)
- [x] follow-tail is on by default, pauses on manual pan/zoom, and resumes on an explicit action (wheel → `paused`, button → `following`)
- [x] the live path handles a day file shorter than the fingerprint window and a rewritten file larger than the old offset (`Tail.fingerprint` reset + `fileSize` smaller than the cursor reset; viewer tests)

## Stage 2: Canvas at 20k

- [x] the 20k fixture meets the C001 acceptance numbers (first paint 606ms; pan p95 17.2ms, max 29.6ms; append 254ms; heap 13.2MB)
- [x] span bars use the Pixi `ParticleContainer`/`ParticleBuffer` instanced layout; no per-span DOM nodes
- [x] labels are viewport-only with level-of-detail (lane + axis labels; per-span text is LOD 0 and lives in the tooltip/detail); the minimap matches the full trace
- [x] hit-testing returns the span at the cursor and from the keyboard (`pick` by lane/time; `ArrowLeft`/`ArrowRight` opens detail)

## Stage 3: Integration and lifecycle

- [x] `/telemetry` starts the viewer and opens the current session; history still renders after NDJSON pruning (existing fold/viewer tests)
- [x] close and the idle timeout stop the listener; nothing listens before the command (viewer lifecycle tests; real command check)
- [x] the shell exposes session list, filter, detail inspector, and controls without blocking the canvas

## Stage 4: Isolation

- [x] the viewer never writes NDJSON or authoritative state (`isolation.test.ts`: only the collector appends)
- [x] the ingest path still imports no SQLite driver and no network API (`isolation.test.ts`)
- [x] the data layer's fold/tail tests still pass unchanged
