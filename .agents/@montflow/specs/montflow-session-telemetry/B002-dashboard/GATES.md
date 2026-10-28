## Stage 0: Verification

- [ ] formatting passes
- [ ] linting passes
- [ ] typecheck passes
- [ ] tests pass

## Stage 1: Surface

- [ ] `/telemetry` opens the surface chosen in `B001-render-surface/MEMORY.md` (§ Handoff)
- [ ] a 20k-span fixture meets the recorded acceptance test
- [ ] closing the viewer leaves no process behind
- [ ] nothing listens before the user asks

## Stage 2: Data layer

- [ ] the live tail reads only bytes appended since the last offset
- [ ] folding twice produces the same rows
- [ ] history renders after the source NDJSON is pruned
- [ ] an absent store renders an empty state instead of throwing

## Stage 3: Isolation

- [ ] the viewer never writes NDJSON or authoritative state
- [ ] the ingest path still imports no SQLite driver
- [ ] the ingest path still imports no network API
