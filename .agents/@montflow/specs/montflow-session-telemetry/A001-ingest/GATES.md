## Stage 0: Verification

- [x] formatting passes (`bun run --cwd packages/telemetry format:check` — 20 files)
- [x] linting passes (`bun run --cwd packages/telemetry lint:check` — no warnings)
- [x] typecheck passes (`bun run --cwd packages/telemetry ts:check`)
- [x] tests pass (`bun run --cwd packages/telemetry test` — 66 tests, 12 files)

## Stage 1: Headless collection

- [x] the ingest module imports no SQLite driver (`src/modules/event/tests/isolation.test.ts` scans every production source for `bun:sqlite`/`node:sqlite`)
- [x] the ingest module imports no network API (same test rejects `node:http|https|net|tls|dgram|dns`, `fetch(`, `WebSocket`, `Bun.serve`)
- [x] no listener, port, or child process is created to collect (same test rejects `.listen(`, `createServer(`, `child_process`, `Bun.spawn`)
- [x] the plugin loads and writes with no external service running (`src/modules/plugin/tests/server.test.ts` loads `src/server.ts`, runs `setup` over the recorded fixture, and writes 11 lines; a real `opencode run` session wrote `~/.local/share/opencode/telemetry/2026-10-28.ndjson`)

## Stage 2: Durability

- [x] an injected write error is swallowed and disables the writer (`src/modules/store/tests/writer.test.ts`: no throw, `disabled === true`, one report for two appends)
- [x] a process killed mid-write leaves no unparseable line (one `writeSync` per line; torn-tail repair test truncates a partial line before the next append; `timeout -s KILL` on a real `opencode run` left the file newline-terminated with every line parseable)
- [x] a session with no events leaves no stray empty file (`writer.test.ts`: no directory/file after `close()` with zero appends; `server.test.ts`: empty stream leaves no file)
- [x] retention pruning removes only files older than the configured window (`writer.test.ts`: 2026-09-20/27 removed, 2026-09-28/10-01/today and `notes.txt` kept)
