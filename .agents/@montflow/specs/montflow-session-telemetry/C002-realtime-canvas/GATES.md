## Stage 0: Verification

- [ ] formatting passes (`bun run --cwd packages/telemetry format:check`)
- [ ] linting passes (`bun run --cwd packages/telemetry lint:check`)
- [ ] typecheck passes (`bun run --cwd packages/telemetry ts:check`)
- [ ] tests pass (`bun run --cwd packages/telemetry test`)

## Stage 1: Realtime growth

- [ ] an NDJSON append appears on the timeline within one second
- [ ] the page updates without a reload or a full trace rebuild
- [ ] follow-tail is on by default, pauses on manual pan/zoom, and resumes on an explicit action
- [ ] the live path handles a day file shorter than the fingerprint window and a rewritten file larger than the old offset

## Stage 2: Canvas at 20k

- [ ] the 20k fixture meets the C001 acceptance numbers (first paint, append latency, pan/zoom p95, heap)
- [ ] span bars use typed arrays and instanced drawing; no per-span DOM nodes
- [ ] labels are viewport-only with level-of-detail; the minimap matches the full trace
- [ ] hit-testing returns the correct span at the cursor and from the keyboard

## Stage 3: Integration and lifecycle

- [ ] `/telemetry` starts the viewer and opens the current session; history still renders after NDJSON pruning
- [ ] close and the idle timeout stop the listener; nothing listens before the command
- [ ] the shell exposes session list, filter, detail inspector, and controls without blocking the canvas

## Stage 4: Isolation

- [ ] the viewer never writes NDJSON or authoritative state
- [ ] the ingest path still imports no SQLite driver and no network API
- [ ] the data layer's fold/tail tests still pass unchanged
