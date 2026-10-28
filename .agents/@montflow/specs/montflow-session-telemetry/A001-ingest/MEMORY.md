# Memory

## Context

Phase A needed collection before any viewer: a server plugin inside the already
running OpenCode server that appends normalized events to local NDJSON. Nothing
else may start, listen, or connect.

Built `packages/telemetry` (`@montflow/telemetry`) with four plain modules —
`config` (option/environment decode and defaults), `event` (allowlist,
normalization, body redaction), `store` (lazy day-rotated writer, tail repair,
retention pruning), and `plugin` (stream drain) — plus `src/server.ts` as the
`Plugin.define` entrypoint exporting `./server`.

## Progress

- 2026-10-28: complete. `test` 66/66, `ts:check`, `lint:check`, `format:check`
  pass for `packages/telemetry`; all GATES.md items checked with evidence.
- Real-session evidence: a local `.opencode/plugins/telemetry` directory
  re-exporting this package's `src/server.ts` ran under `opencode run
  --standalone`; it wrote
  `~/.local/share/opencode/telemetry/2026-10-28.ndjson` with one JSON object
  per line, correct `sessionID`, `agent`, `model`, and token/cost payloads.
- Kill evidence: `timeout -s KILL 3 opencode run …` mid-session left the file
  newline-terminated with every complete line parseable (14 lines, 0 corrupt).
- Pruning runs at `setup`; a failure is reported once through the same
  once-guard as write failures and ignored.

## Open Questions

- None blocking. `permission.asked.metadata` is treated as a body field; if it
  proves to carry only routing data, move it out of `BODY_FIELDS`.

## Handoff

- **B001** does not consume this task; its surface decision is independent.
- **B002 data layer inputs**: files are `<UTC day>.ndjson` under the resolved
  directory, one line per event, each `{ v: 1, ts, type, sessionID, agent?,
  model?, payload }`. Tail by byte offset against the active day file; a day
  rollover starts a new file. `payload` is the host event's `data` with body
  fields replaced by `{ redacted, sha256, bytes }` unless `captureBodies`.
- Stored `model` is the host shape `{ providerID, id, variant? }` (the host
  calls the model id `id`, not `modelID`). `agent` is present for events whose
  `data.agent` is a string (`session.created`, `session.step.started`).
- Event types actually observed in a one-prompt session: `session.inbox.enqueued`,
  `session.execution.started`, `session.step.started`, `session.step.ended`,
  `session.usage.updated`, `session.execution.succeeded`. `session.idle` did not
  arrive before the CLI exited.
- Cost/tokens are passed through untouched; do not re-hash or drop them when
  folding into `telemetry.db`.

## Deviations

- `packages/telemetry` depends on `@opencode/plugin` directly. The task mandates
  `Plugin.define`, which lives in the host package; the repo's adapter-is-the-only-
  `@opencode`-importer convention covers runtime plugins, not this promise-style
  entrypoint.
- `node:crypto`, `node:fs`, `node:os`, and `process.env` appear behind
  line-level `montflow/no-node-platform-imports` / `no-process-env` disables:
  the spec requires `node:fs` on the write path and there is no Effect platform
  layer inside the server plugin. Each disable carries its reason inline.
- A minimal `MutableModel` / `MutableJsonObject` interface exists only because
  `exactOptionalPropertyTypes` forbids assigning an optional field to a readonly
  contract; public types stay readonly.
