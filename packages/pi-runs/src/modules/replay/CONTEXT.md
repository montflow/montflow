# Replay module

Turn a stored transcript back into Pi messages so a run resumes anywhere.

## Belongs here

- `replayable` / `canReplay` — per-event and whole-transcript verdicts
- `toMessage` / `toMessages` — event → Pi `Message` mapping, in `seq` order

## Rules

- Raw `message` wins; user turns without one synthesize from `text`.
- `system` pointers skip (not LLM context).
- Assistant / tool-result without raw `message` is not replayable — resume
  refuses rather than silently dropping context.

## Does not belong here

- Writing events — `Store.append` owns the write path
- Creating the Pi session — the runner appends the returned messages
