# Fallback-notice module

The durable note a fallback leaves in the session history. `switchModel` already
records a `model-switched` separator; this note says _why_ the switch happened
and survives replay.

## Belongs here

- `make` — note text, timeline description, and metadata for one switch
- `Phase` — whether the session retried in place or resumed after failure

## Does not belong here

- Writing the note — `apps/server` calls `session.synthetic`
- Choosing a model or a trigger — `model-chain`, `fallback-trigger`
