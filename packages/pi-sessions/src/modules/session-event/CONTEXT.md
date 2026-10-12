# Session-event module

One `session.jsonl` line per turn. Call-site reads `SessionEvent.Event`.

## Belongs here

- `Role` (`user` / `assistant` / `system` / `toolResult`), `Event` class plus boundary helpers
- `decodeUnknown`, `encode` for `session.jsonl` append and replay
- `message` (raw Pi `Message` JSON) for lossless replay; `text` is the display projection

## Does not belong here

- Appending to disk — sole writer is `Store.append`
- Rendering `session.md` — derived view, not stored truth
- Replaying into a Pi session — see the `replay` module
- Subsession evidence — pointers via `subsessionId`, details live in the subsession dir
