# Memory

## Context

Port the `prompts` and `profiles` child runs off Pi's `ModelRuntime` onto native
OpenCode sessions (plugin `SessionDomain` + registered agents). C002 had already
renamed the packages and deleted their Pi extension faces, so this task adds the
native `./server` / `./tui` faces, the adapter ports they need, and removes the
remaining Pi plugin registration seams.

## Progress

- complete — adapter ports `ModelPort`, `SessionDispatchPort`, `ToolPort`,
  `AgentPort` under `packages/opencode/src/modules/ports/{model,session-dispatch,tool,agent}`,
  wired into `Ports` together with `cwd`; host-free `defineTool` / `defineAgent`
  helpers keep concern packages off `@opencode/*`.
- complete — prompts `./server` registers `/mf-prompts`, `prompt_inspect`, and
  `prompt_execute`; execution resolves the model, creates a native session,
  prompts it with skills instructions, waits, and returns the last reply.
- complete — profiles `./server` registers every stored `PROFILE.md` as an
  `mf-<slug>` `mode: subagent` agent, `/mf-profiles`, and `profile_execute`;
  execution creates a session with that agent and the profile/override model.
- complete — `./tui` entries (`{ id, setup }`) for both packages; minimal until
  C005 widens `TuiPluginContext`.
- complete — removed `register` / Pi `Effect` seams and the
  `@earendil-works/pi-coding-agent` devDeps from both packages.
- complete — port contract tests for all four new ports plus loader smoke
  extended to both packages (command, tool, and agent registration from a temp
  profile store).
- Gate evidence (2026-10-21): `bun run verify:montflow` → 17/17 turbo tasks,
  all six extension verifies report 0 issues. Scoped: `packages/opencode` 72
  tests / no type errors + smoke 7 pass; `packages/prompts` 555 tests;
  `packages/profiles` 140 tests; lint and format clean in all three.

## Findings

- Host `SessionDomain.create` has no `parentID` on `2.0.18`; the public API
  creates a session at a location. Dispatch therefore creates a peer session in
  the plugin directory. B003 §2's `create({ parentID, … })` mapping is wrong for
  this host version.
- `SessionDomain.context({ sessionID })` returns the message list, so `reply`
  reads the last non-empty assistant text. B002's "no message reads on the
  server" claim does not hold for `context`.
- `ctx.agent.transform` + `editor.update(id, …)` creates a missing agent, which
  is what `AgentPort.upsert` relies on.
- `Host.resolve` under Bun 1.3.13 rethrows on the absent `./rpc` subpath because
  Bun's `ResolveMessage` is not `instanceof Error` while the host only ignores
  `Error` values carrying a Node `code`. The smoke test normalizes
  `Bun.resolveSync` failures locally; the host bug would hit any plugin without
  an `rpc` export.
- Profiles register the interactive command name `/mf-profiles`, but execute
  the headless CLI until C005 replaces the TUI half.
- Prompts child runs use the host default agent with a pinned model; profiles
  child runs use the registered `mode: subagent` agent.

## Open Questions

- Should `prompt_execute` dispatch through a dedicated hidden subagent agent
  instead of the host default `build` agent? GATES only requires native
  create/prompt, so this is deferred.
- `Host.resolve`'s Bun incompatibility is upstream; C007 may want a real host
  fix or pin instead of the test-local normalization.
- `packages/profiles/src/modules/pi-profiles` is pure domain code despite the Pi
  name; a rename is cosmetic and out of scope.
- Prompts still depends on `@montflow/pi-interactive` for dialog widgets and
  profiles on `@montflow/pi-effect` `Changes`; both are widget/data helpers, not
  child-run runtime. C005 owns replacing them with TUI ports.

## Handoff

Files: `packages/opencode/src/modules/ports/{model,session-dispatch,tool,agent}`,
`ports.module.ts`, `packages/{prompts,profiles}/src/{server,tui,apps/server}`,
their interactive modules and package manifests, `bun.lock`, and
`packages/opencode/test/plugin-loader.test.ts`.

Next: C004 adds its dispatch ports on top of `Ports` without touching these
files; C005 widens `TuiPluginContext` and turns the `./tui` stubs into real
flows.

## Deviations

- "Delete `pi-prompts`/`pi-profiles`" follows the C002 decision: the packages
  were already renamed, so this task removes the residual Pi runtime coupling
  rather than deleting the packages.
- `./tui` faces are stubs because `TuiPluginContext` is still opaque; the task
  only needs both entrypoints to load.
- `SessionDispatchPort.messages` returns the narrow `SessionEntry` shape dispatch
  actually reads, so tests and callers do not fabricate full host messages.
