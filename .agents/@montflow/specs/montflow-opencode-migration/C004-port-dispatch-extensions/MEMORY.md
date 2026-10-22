# Memory

## Context

Port the in-session dispatch concerns (`reviews`, `skills`) onto the native
adapter seams: `SessionDispatchPort`, `ToolPort`, `SkillPort`, `CommandPort`,
and remove every `Runtime.activeSessionRunnerHost` consumer. C002 had already
renamed `pi-reviews`/`pi-skills` to `@montflow/{reviews,skills}` and deleted
their Pi extension faces, so this task adds the native `./server` / `./tui`
faces, the two missing ports, and rewrites the dispatch glue off
`@montflow/pi-sessions`.

## Progress

- complete — `SkillPort` (`packages/opencode/src/modules/ports/skill/`) with
  `defineSkill` so concern packages never import `@opencode/*`; `EventPort`
  (`…/event/`) with a narrow `HostEvent` slice; both wired into `PortsContext`,
  `Ports`, `makePorts`, and `ports/index.ts`.
- complete — port contract tests for both
  (`skill/tests/skill.test.ts`, `event/tests/event.test.ts`); `packages/opencode`
  went from 72 to 88 tests.
- complete — `@montflow/reviews` gained `./server` + `./tui`. `startReview` now
  takes the seam ports (`session` + `model` slice), ensures the series ledger,
  resolves the optional model pin, creates a native session, and prompts it.
  `server.ts` registers `review_create` via `ToolPort` and `/mf-reviews` via
  `CommandPort`. The `Runtime.activeSessionRunnerHost` read, the
  "sessions extension not loaded" failure, and the `REVIEW_TOOLS` allowlist are
  gone.
- complete — `@montflow/skills` gained `./server` + `./tui`. `makeSkillSessionPorts`
  was rewritten over `SessionDispatchPort`: create → prompt → fork a settle
  watcher (`wait` → `reply` → completion hook). `apps/server/syncSkills`
  publishes every stored `SKILL.md` through `SkillPort`; `server.ts` registers
  `/mf-skills` via `CommandPort` and `skill_create` / `skill_modify` /
  `skill_transform` via `ToolPort`.
- complete — removed the last Pi coupling in these packages: both
  `@montflow/pi-sessions` deps, the `@earendil-works/pi-coding-agent` devDep and
  its only import (`FilterUi.custom`), plus the dead Pi-shaped
  `Interactive.register` / `CommandApi` / `FilterUi` surfaces. Zero
  `activeSessionRunnerHost` consumers remain repo-wide; the only match is the
  definition inside `packages/pi-sessions` itself (C006 deletes the package).
- complete — loader smoke extended to `reviews` and `skills` (entrypoints, ids,
  `/mf-reviews` + `review_create`, and skills publishing a stored skill plus
  `/mf-skills` and the three dispatch tools from a temp store).
- complete — `pi-reviews` / `pi-skills` no longer exist on disk (C002 renamed
  them); nothing was deleted here, and `packages/{reviews,skills}` stay in place.
- Gate evidence (2026-10-21):
  - `bun run --cwd packages/opencode test` → `Test Files 18 passed (18)`,
    `Tests 88 passed (88)`, `Type Errors no errors`.
  - `bun run --cwd packages/opencode ts:check` → `$ tsc --noEmit` (clean).
  - `bun run --cwd packages/opencode lint:check` → `$ oxlint --deny-warnings .` (clean).
  - `bun run --cwd packages/opencode format:check` → `All matched files use the correct format.`
  - `bun run --cwd packages/opencode smoke` → `9 pass`, `0 fail`,
    `46 expect() calls`, `Ran 9 tests across 1 file.`
  - `bun run --cwd packages/reviews test` → `Test Files 16 passed (16)`,
    `Tests 98 passed (98)`, `Type Errors no errors`; `ts:check` clean;
    `lint:check` clean; `format:check` → `All matched files use the correct format.`
  - `bun run --cwd packages/skills test` → `Test Files 40 passed (40)`,
    `Tests 241 passed (241)`, `Type Errors no errors`; `ts:check` clean;
    `lint:check` clean; `format:check` → `All matched files use the correct format.`
  - `bun run verify:montflow` → `Tasks: 17 successful, 17 total`; extension
    verifies: skills `46 skills · 0 issues` + doctor up to date, prompts
    `4 prompts · 0 issues · 0 warnings`, specs `4 specs · 0 failed · 0 issues`,
    profiles `11 profiles · 0 issues · 0 warnings`, sessions doctor ok, reviews
    `17 files · 0 issues` + doctor up to date.

## Findings

- The settle watcher must not run the completion hook when `wait` fails. A
  recovered `reply` is `undefined` (no assistant text); a failed `wait` is a
  session that never settled and is reported as such, with no store write.
- `Effect.fork` does not exist in the pinned effect line
  (`4.0.0-rc.112`); the supervised, scope-free primitive is `Effect.forkChild`.
  The settle watcher uses `forkChild`, so a dispatch tool keeps
  `Effect<void, never, Scope.Scope>` and the plugin scope owns the watcher.
- `SessionDispatchPort.create` mints a branded `Session.ID`; internal helpers
  must carry that type (`SessionId = Effect.Success<ReturnType<…['create']>>`),
  not `string`, or every `wait`/`prompt`/`reply` call fails typecheck.
- The host `EventDomain.subscribe` is generic over the event-type union and is
  assignable to a `string`-constrained method slice, so `EventPort` needs no
  event-schema import. No C004 consumer needed evented observation: settlement
  is `SessionDispatchPort.wait` + `reply`, which is the terminal-outcome
  equivalent B003 §4 describes.
- Pi's per-session `tools` allowlist (`REVIEW_TOOLS`, `SESSION_TOOLS`) and the
  `thinking` level have no plugin-surface analog on `2.0.18`; both were dropped
  rather than faked. Per B003 §6 the allowlist belongs to the reviewer agent's
  permission ruleset, not a per-call argument.
- Both dispatch modules had **zero** consumers outside their own tests, so the
  rewrites changed exported signatures freely (`startReview(ports, input)`,
  `makeSkillSessionPorts(ports, { storeFor })`) without touching callers.
- `Interactive.SkillStore` needed no service: `storeFor(root)` now maps directly
  onto `modules/skill-store` (`SkillStore.skillFilePath` was exported for it).
- Skill registration needs the raw `SKILL.md` plus its absolute path; the store
  reads both, so `SkillPort` stays a registry seam and the file store remains the
  source of truth.
- `bun.lock` moved with the manifest edits (pi-sessions → opencode in reviews;
  skills dropped pi-sessions and the Pi agent devDep).

## Open Questions

- `skill_create` returns "Session dispatched to …" without the session id: the
  `Interactive.SkillGenerator` contract fails with the fixed `DISPATCHED`
  marker, so the id only reaches the host log. Widening that contract would let
  the tool reply name the session; deferred as a domain-API change.
- Skill writing/deleting through the `ToolPort` is not exposed (only dispatch);
  `/mf-skills create|modify|delete` still covers manual edits. A `skill_apply`
  tool is a product decision, not a port gap.
- `EventPort` currently has no consumer in this phase. It is landed with contract
  tests for C005's event-driven panels; if C005 does not need it, delete it then
  rather than growing a second event abstraction.
- `packages/skills/src/apps/interactive` still says "pi coding agent" in its
  authoring preprompts; that text is prompt content shipped to child sessions,
  not runtime coupling, and changing it is a separate content task.

## Handoff

Files: `packages/opencode/src/modules/ports/{skill,event}`,
`ports.module.ts`, `ports/index.ts`,
`packages/{reviews,skills}/src/{server,tui}.ts` and `package.json`,
`packages/reviews/src/apps/dispatch/review-dispatch.apps.module.ts`,
`packages/skills/src/apps/sessions/sessions.apps.module.ts`,
`packages/skills/src/apps/server/skills.apps.module.ts`,
`packages/skills/src/modules/skill-store/skill-store.module.ts`,
`packages/skills/src/apps/interactive/interactive.apps.module.ts`,
their tests, READMEs, `bun.lock`, and
`packages/opencode/test/plugin-loader.test.ts`.

Commits: `4d77813 feat(opencode): add skill and event adapter ports`,
`6960af1 feat(reviews): dispatch reviewer sessions over native ports`,
`ebb1c47 feat(skills): dispatch skill sessions over native ports`,
`2be4c77 test(opencode): smoke reviews and skills plugin faces`,
`1984350 fix(skills): skip completion when a dispatched session never settles`.

Next: C005 owns the `./tui` flows (both faces are load-only stubs) and any
`EventPort` consumer; C006 deletes `packages/pi-sessions`, which is now the only
place `activeSessionRunnerHost` exists. `apps/workspace` still depends on
`@montflow/pi-sessions` and is C005's scope.

## Deviations

- "Delete `pi-reviews`/`pi-skills`" is recorded as already done by C002: neither
  directory exists, and this task removed the residual Pi runtime coupling
  instead of deleting packages.
- `startReview` no longer accepts `parent` or `thinking` (no plugin-surface
  mapping); the series/target/spec/root context still travels in the prompt.
- Skill completion hooks now take the session's last assistant reply instead of
  a `SessionDetail.events` transcript; `finalAssistantText` was dropped with the
  engine type it decoded.
- The skills dispatch notice no longer points at the retired `/mf-sessions
  status` command.
- `EventPort` is added and tested but not consumed by either package yet; see
  Open Questions.
