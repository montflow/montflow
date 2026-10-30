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

Picker verification succeeded with the plugin installed as a path specifier.
In an isolated `HOME` whose config lists `"plugins": ["file:/<repo>/packages/prompts"]`,
OpenCode 2.1.4 loads the package's `./server` and `./tui` entries and:

- `/mf-prompts` appears in slash completion with the picker's own description
  ("Pick a stored prompt"), then opens a select dialog listing
  `demo — Demo prompt` from `.agents/@montflow/prompts/demo.json`.
- Choosing the row inserts the template ("Run the demo task.") into the
  composer.
- `list` opens the picker by design; other verbs run the server command, whose
  output posts through the session reply channel (verified earlier in the same
  host when a session was open).

So the dev override has two working forms: one `.opencode/plugins/<name>.ts` file
exporting a single definition with both `effect` and `setup`, or a
`"plugins": ["file:<abs path>"]` entry that exercises the real package
`./server` + `./tui` split. The npm-name form requires a registry install.
