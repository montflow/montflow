# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See TASK.md.

## Deviations

- None.

## Progress

Real-host verification on OpenCode 2.1.4 (`/home/daniel/.opencode/bin/opencode`):

- Local dev override works through `.opencode/plugins/<name>.ts`, and each file must
  export ONE default definition carrying BOTH `effect` and `setup`. Split
  `*-server.ts` / `*-tui.ts` files collide on the plugin id: the second file
  registers as a failed duplicate. Verified in `/tmp/ocverify`.
- With the merged override, all five plugins load with no warnings. `/mf-prompts list`
  runs the server command and posts its output into the session (the new
  `makeCommandReply` channel), which confirms the "never silent" requirement.
- The `plugins` config key is not a local-path mechanism: the host tries to npm
  install the name (404 for `@montflow/*`). Local testing must use
  `.opencode/plugins/*.ts`.
- `effect` must stay at the host's 4.0.1 and `@opencode/plugin`/`@opencode/schema`
  at 2.1.4; with 2.0.18 every entry died on `Schema.isStartsWith`.
- `effect/cli` replaced `effect/unstable/cli` in 4.0.1, and the specs server graph
  must import `slash.apps.module.js` so it never reaches the CLI binary.

Still unverified: the TUI picker interception in a live TUI. The available
harness hands local plugin `setup` a server-shaped context (no `ui`), so the
picker cannot be exercised there; a real interactive session is needed.
