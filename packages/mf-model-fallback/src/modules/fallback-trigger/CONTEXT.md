# Fallback-trigger module

Which provider failures are worth leaving a model for. Session error types and
HTTP statuses fold onto one closed set of triggers.

## Belongs here

- `Trigger` — the closed set of failure classes (`quota`, `rate-limit`, `auth`,
  `timeout`, `provider-internal`, `transport`)
- `classify` — a provider failure to its trigger, error type first, status second
- `matches` — classify plus the enabled-trigger check
- `defaults` — the triggers used when options are silent

## Does not belong here

- Retry timing, attempt counts, or schedules — the host retry policy owns those
- Choosing the next model — `model-chain`
