# Stamp module

One clock helper for every generated instant. It owns the instant format the
verifier accepts, so a writer and a parser can never drift apart.

## Belongs here

- `ISO_INSTANT_PATTERN` / `ISO_INSTANT_SOURCE` — UTC, second precision, `Z`
- `instant(millis)` — format one epoch instant
- `stampNow` — the current instant as an effect
- `isInstant(value)` — the one parser predicate

## Does not belong here

- Any verb that writes a record (the `stamp` verb, `mail`, `gate run`); those
  consume this helper
- Time zone or locale handling: records are always UTC
