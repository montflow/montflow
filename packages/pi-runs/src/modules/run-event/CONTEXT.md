# Run-event module

One `session.jsonl` line per turn. Call-site reads `RunEvent.Event`.

## Belongs here

- `Role` (`user` / `assistant` / `system`), `Event` class plus boundary helpers
- `decodeUnknown`, `encode` for `session.jsonl` append and replay

## Does not belong here

- Appending to disk — sole writer is `Store.append` (future `store` module)
- Rendering `run.md` — derived view, not stored truth
- Subrun evidence — pointers via `subrunId`, details live in the subrun dir
