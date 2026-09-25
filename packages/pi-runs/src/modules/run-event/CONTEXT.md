# Run-event module

One `session.jsonl` line per turn. Call-site reads `RunEvent.Event`.

## Belongs here

- `Role` (`user` / `assistant` / `system` / `toolResult`), `Event` class plus boundary helpers
- `decodeUnknown`, `encode` for `session.jsonl` append and replay
- `message` (raw Pi `Message` JSON) for lossless replay; `text` is the display projection

## Does not belong here

- Appending to disk — sole writer is `Store.append`
- Rendering `run.md` — derived view, not stored truth
- Replaying into a Pi session — see the `replay` module
- Subrun evidence — pointers via `subrunId`, details live in the subrun dir
