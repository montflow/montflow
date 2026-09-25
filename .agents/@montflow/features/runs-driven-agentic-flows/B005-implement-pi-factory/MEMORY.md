# Memory

## Context

Task B005: real Pi session factory.

## Progress

- 2026-09-21: complete.

## Done

- `services/runner/pi-session.services.module.ts`: `PiSessionFactory` over
  `createAgentSession` + `SessionManager.inMemory`, seeded via `appendMessage`.
- Model pin resolved with `resolveCliModel`; tools allowlist passed through.
- Interaction injected as custom tools `ask_user` / `notify_user` bound to
  `SessionUi` — no `ExtensionUIContext`/Theme faking needed headless.
- `isPiMessage` / `sessionEventOf` map `message_end` and `agent_settled`;
  `toPort` runs listener effects and wires prompt/steer/abort/messages/dispose.
- `typebox@1.3.7` added to pi-runs dependencies.
- Tests for message narrowing and event mapping.

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (48 tests).

## Open Questions

- `notify_user` covers the toast call; the second workspace call is wired in C001.

## Handoff

- C001/C002 and D002 can provide `PiSessionFactory` to `Runner.Default`.

## Deviations

- Chose custom-tool interaction over a full `ExtensionUIContext`; documented above.
