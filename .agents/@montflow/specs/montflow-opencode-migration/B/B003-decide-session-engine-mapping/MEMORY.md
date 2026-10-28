# Memory

## Context

B003 ratifies the A003/A006 hypothesis: **`pi-sessions` is deleted**, and OpenCode's
built-in session execution + subagent system is the *only* session mechanism. No
montflow-owned engine, runner, host, ledger, or lifecycle is retained. Every
`pi-sessions` flow is re-pointed to a named native call. Inputs: A003 §2–§6
(capability map + `activeSessionRunnerHost` consumers), A006 §2/§3/§5 and its Open
Questions 7/8, A001 (seams + `session_*`/CLI inventory). Evidence is checked against
the pinned clone `.agents/references/opencode/` @ `v2.0.18`
(`packages/plugin/src/effect/session.ts`, `packages/core/src/session.ts`,
`packages/core/src/session/session.ts`, `packages/core/src/tool/plugin/subagent.ts`,
`packages/core/src/tool/plugin/question.ts`, `packages/plugin/src/tui/context.ts`).
Locked inputs (not revisited): transcripts local-only is acceptable (portability
blocker dropped, no export/projection step); authoring API is Effect; distribution is
private Git/local; workspace is TUI + server plugin; OpenTUI `>=0.5.12`. This is a
decision task — no code, no files outside this `MEMORY.md`.

## Progress

- 2026-10-13: complete

## Findings

### 1. Retire decision

**DELETE `pi-sessions` entirely and adopt OpenCode's built-in session/subagent system
as the single mechanism; no montflow session engine is retained.** (A003 §4; A006 §2).
The engine's whole reason to exist — durably owning a Pi `AgentSession`, mirroring its
transcript, and exposing a runner/host so sibling extensions and the workspace could
dispatch (A001 "Session-loop-owning") — is now native: the plugin `SessionDomain`
(`packages/plugin/src/effect/session.ts:153-170`) + core `Session.Service`
(`packages/core/src/session.ts:117-227`) + `SessionExecution` + `SessionRunCoordinator`
+ the `subagent` tool (`tool/plugin/subagent.ts`) + `Job` background system. Deleted:
`Store`/`session.jsonl`/`session.md`, `SessionRunner`/`SessionFactory`/`SessionPort`,
`Session` lifecycle class + `STATUSES`, `Receipt`/`replay`/`verify`,
`WorkspaceBridge`, and `Runtime.activeSessionRunnerHost` (A003 §1, §4).

The only no-exact-analog items are all decisions, not engine work, and are ruled below:
(a) agent-invocable `notify_user`/`toast_user`/`update_status` (§7), (b) the mechanical
`session_verify`/receipt/replay ledger (§4, §8), (c) portable transcripts — **dropped by
locked input** (local-only acceptable; A003 Open Q1 / A006 Q1 resolved: no
export/projection step).

### 2. Flow → native-call mapping

The plugin `SessionDomain` surface is used *honestly*: it exposes only
`create`/`get`/`switchAgent`/`switchModel`/`prompt`/`generate`/`command`/`synthetic`/
`interrupt`/`update`/`move`/`wait`/`context` (+ `hook`) — `session.ts:153-170`. Anything
outside that `Pick` is **core-only** (server/`opencode` client), not a plugin call.
Message/history/status reads come from the client projection `ctx.data.session.*`
(`tui/context.ts:63-140`) or `ctx.event.subscribe`.

| `pi-sessions` flow (A003 §1) | Native replacement | Surface |
| --- | --- | --- |
| **dispatch** — start a session/child (`SessionRunner.start`) | `create` a child then `prompt` it: `ctx.session.create({ parentID, title, agent, model })` + `ctx.session.prompt({ sessionID, text })`; from inside an agent, invoke the native `subagent` tool (`agent`/`description`/`prompt`/`model`/`background`) | plugin `SessionDomain` (`create`,`prompt`); `subagent` (`tool/plugin/subagent.ts:100-268`) |
| top-level dispatch (no parent) | core `Session.create({ location, agent, model })` (the `parentID`-or-`location` union — `session.ts:82-91,121`) via the server/`opencode` client; plugin `create` requires a parent | core-only |
| **steer** — queue a steering message (`SessionRunnerImpl.steer`, A003 §1) | `ctx.session.prompt({ sessionID, text, delivery: "steer" })` (default delivery is already `steer`; `session.ts:146-156`). Pair with `cancelInbox`/`queueInbox` only on the core surface for queue/cancel | plugin `prompt` (`kind: "primary"`); Delivery = `steer|queue` (`session/inbox.ts`) |
| **interrupt** — interrupt live/abandoned (`SessionRunnerImpl.interrupt`) | `ctx.session.interrupt(sessionID)` → `SessionExecution.interrupt` (idle/unknown is a no-op; public API rejects unknown). Interrupting the `subagent` tool call cascades to the child (`subagent.ts:234-239`) | plugin `interrupt` |
| **resume** — resume a valid session, optional new prompt (`SessionRunnerImpl.resume`) | **Not on `ctx.session`** (`session.ts:153-170` omits it). Continue a child via the `subagent` tool passing a child `sessionID` (`subagent.ts:40-43`); resume a top-level/claimed session via core `Session.resume` (startup recovery auto-resumes claimed top-level sessions) | `subagent` tool; core-only `resume` |
| **answer** — answer a parked (`awaiting-input`) session (`SessionRunnerImpl.answer`/`Store.unpark`) | No parked state exists: the native `question` tool blocks and is answered through `Form` (`tool/plugin/question.ts:48-111`); TUI reply is `ctx.data.session.form.reply` (`tui/context.ts:94-100`). If the session is merely idle awaiting a prompt, deliver via `ctx.session.prompt` | `question`/`Form`; plugin `prompt` |
| **author/modify session** — sibling workspace dispatchers start author/modify runs (A003 §6) | Same dispatch path as **dispatch**: `create` (child) + `prompt`, or the `subagent` tool with the author/modify agent profile | plugin `create`/`prompt`; `subagent` |
| message read / transcript (`SessionEvent`, `messages`) | `ctx.data.session.message.list/get` (reactive TUI) or the client API; live stream via `ctx.event.subscribe`. Core `Session.messages`/`log` are core-only | `ctx.data.session.message.*`; `ctx.event.subscribe` |
| **status / lifecycle** (`STATUSES`) | `ctx.data.session.status()` → `"idle" \| "running"` (`tui/context.ts:75`); terminal outcome from durable `session.execution.succeeded/failed/interrupted`; `Job.Info.status` for jobs | `ctx.data.session`; `ctx.event.subscribe`; core `Session.log` |
| **list** | `ctx.data.session.list()` / `family()` / `root()` (`tui/context.ts:70-73`); core `Session.list` core-only | `ctx.data.session` |
| **fork** | core-only `Session.fork` (`session.ts:122-124`); no plugin `fork` | core-only |
| **wait / awaitIdle** | `ctx.session.wait(sessionID)` (`session.ts:166,208`) | plugin `wait` |
| **child-session tools** `ask_user` | native `question` tool (`tool/plugin/question.ts`) | first-class native tool |
| **notice/status tools** `notify_user`/`toast_user`/`update_status` | ruled in §7 | `Toast`/`Attention`/`session.synthetic` |
| **receipt / replay / verify** | ruled in §4 | — |

Honest gap restated: plugin `ctx.session` exposes **no** `resume`, `messages`, `list`,
`fork`, `log`, `inbox`/`steerInbox`, or `diff` — those are core `Session.Interface` /
server-client only. This is not a blocker (the flows above route through `subagent` +
`ctx.data`/client), but ported code must not assume the `ctx.session` façade is complete.

### 3. CLI fate — `mf-sessions` retired

`mf-sessions` (A001 "`mf-*` CLI inventory"; `apps/cli/main.ts` → `PiSessionFactory`) is
**retired with the engine** — no montflow session CLI ships. Its verbs map to the
`opencode` CLI / session API: `list`/`status` → client session list + `ctx.data.session`;
`start`/`resume`/`interrupt`/`steer`/`answer` → `create`/`prompt`/`interrupt`/
`subagent`; `verify` and `doctor` **drop** with the ledger (§4). The other `mf-*` CLIs
(`mf-specs`, `mf-profiles`, `mf-prompts`, `mf-reviews`, `mf-skills`) are filesystem-only
and **unaffected** (A001; A006 §1).

### 4. Ledger / lifecycle fate — drop (smallest projection = none)

**Drop the receipt/replay/verify ledger and the custom lifecycle states entirely.**
Deleted: `Receipt` (`receipt.md`), `Store.settle`/`cancel`, `Replay.toMessages`,
`verifySession`, `verifyStoreIgnored`, and `STATUSES`
(`pending|running|awaiting-input|done|failed|cancelled`) (A003 §1, §5). The functional
minimum survives for free on native primitives:
- **terminal outcome** = durable `session.execution.succeeded` / `failed` /
  `interrupted` (+ `Job.Info.status` for jobs);
- **completion summary** = last assistant message text (`SubagentCompletion.text`);
- **resume** = durable projected history + automatic top-level crash recovery;
- **status** = derived `ctx.data.session.status()` + live execution events.

**Smallest projection if a durable receipt is ever required (not adopted now):** one
derived record per top-level session from `Session.log` — the terminal execution event
plus the last assistant message. A read projection over the native log; no new store,
no new engine. Consumers that today read `SessionDetail.receipt` switch to that read
(A003 §5).

### 5. `session_*` agent tools — retired, no remap

The 8 `session_*` tools (`session_start/status/verify/list/resume/interrupt/steer/answer`,
`packages/pi-sessions/src/extension.ts:197-328`) are **retired**, not remapped. The
native `subagent` tool already *is* the agent-invocable "start/continue child session"
surface (`agent`/`description`/`prompt`/`model`/`sessionID`/`background`); `status`/
`list`/message reads are UI/client concerns served by `ctx.data.session.*`, not agent
tools. `session_verify` is retired (see §8). No thin shim is kept: remapping the nouns
onto `create`/`prompt`/`interrupt` would re-encode the deleted lifecycle and is not
needed by any consumer. If a later flow genuinely needs an agent-invocable "list/status"
tool, it is a new montflow `ctx.tool` registration, not a remap of the engine's tools.

### 6. Consumer migration (`activeSessionRunnerHost`, A003 §6)

Every consumer drops the host singleton and moves onto native sessions/subagents:

- **`pi-reviews` dispatch** — `packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts:102-128`
  (`Runtime.activeSessionRunnerHost()` + `sessionRunner.start({ root,id,name,prompt,model,thinking,parent,spec,tools })`):
  replace with native dispatch — `ctx.session.create({ parentID: input.parent, title: `Review: ${input.name}`, agent, model: input.model })`
  then `ctx.session.prompt({ sessionID, text: reviewerPrompt(input) })`; or invoke the
  `subagent` tool with a reviewer profile. `root`/`name`/`spec` travel in the prompt
  (already built by `reviewerPrompt`); `REVIEW_TOOLS` (`read/write/edit/bash`,
  `:59`) becomes the reviewer agent profile's tool policy (permission ruleset), not a
  per-call allowlist. The "sessions extension not loaded" failure (`:103-107`) is
  replaced by native `create`/`prompt` errors.
- **workspace session adapter** — `apps/workspace/src/services/sessions/sessions.services.module.ts`
  (`withSessionRunner`, `runtimeFor`, `startSession`/`steerSession`/`answerSession`/
  `interruptSession`, `SESSION_TOOL_NAMES`, `DEFAULT_SESSION_TOOLS`): becomes an
  OpenCode TUI client over `ctx.data.session.list/get/status/message.list/pending.list`,
  acting with `prompt`/`interrupt` and answering via `ctx.data.session.form.reply`;
  `SessionDetail as EngineSessionDetail` import and the `SessionRunner` layer are removed.
- **workspace sibling dispatchers** — `services/specs/specs.services.module.ts`,
  `services/skills/skills.services.module.ts`, `services/prompts/prompts.services.module.ts`
  (all import `SessionDetail as EngineSessionDetail` from `@montflow/pi-sessions`): move
  onto `ctx.session`/subagent dispatch; `SessionDetail.receipt` reads become "last
  assistant message + terminal execution event" (§4).
- **`pi-sessions` itself** — `extension.ts` `setActiveSessionRunnerHost` (`:120`),
  dispatch/`session_*` tools (`:102-328`), and `apps/runtime/runtime.apps.module.ts`
  host (`:84-138`) are deleted with the package.

`pi-skills` dispatch (`makeSkillSessionPorts`, A001) re-layers onto the same native
path via the `SessionDispatchPort` seam (A006 §3).

### 7. Notify/status semantics — ruling (A006 Open Q7)

**The pi-sessions tool *implementation* is retired; the capability is re-exposed as a
montflow-registered tool.** The old agent-invocable `notify_user`/`toast_user`/
`update_status` `pi.defineTool` registrations are deleted with the engine, but the
capability is **not** dropped — it is built by default as a montflow-registered tool via
`ctx.tool`/`ToolPort` bridging to `Toast.show`/`Attention.notify`, with `update_status`'s
analog also using `Job` title/metadata + `ctx.session.synthetic` (the `NotifyPort` of A006
§2 item 2 / §3; B002 §1/§2/§7; B004 §1 — `NotifyPort.registerTools()` registers exactly
those three). Client-side `Toast.show`/`Attention.notify` plus derived
`ctx.data.session.status()` remain the UI surface (A003 §3; A006 §3). `session.status` is
derived ephemeral state, not a stored lifecycle (§4).

### 8. `session_verify` requirement — ruling (A006 Open Q8)

**Nothing relies on the mechanical resumability verdict.** Native decode/DB error
surfacing (`MessageDecodeError`, `NotFoundError`, `PromptConflictError`, A003 §2) plus
automatic crash recovery (`claim`/`listSuspended`; spec `specs/v2/session.md` L114-118)
is enough. `session_verify` / `verifySession` / `verifyStoreIgnored` are retired and not
replaced (A003 §5).

### 9. Migration + rollback

**Migration (aligns A006 §5, retiring `pi-sessions` as the *last* step):**
1. Consumers migrate **behind the `SessionDispatchPort` seam** (B002; A006 §3) —
   `pi-prompts`/`pi-profiles` (step 3), then `pi-reviews`/`pi-skills`/`pi-specs` (step 4),
   then workspace (step 5) — while `pi-sessions` remains installed and loadable and
   `activeSessionRunnerHost` stays wired. Migration is **additive**: each consumer gains
   the native path without deleting the engine.
2. Only after every consumer and the workspace are green on native does the final cut
   run: delete `packages/pi-sessions`, drop its template/dependency entries, remove the
   extension registrations and `activeSessionRunnerHost` host.

**Rollback / recoverability:**
- The engine is never modified in place during migration; it stays published and
  working (SPEC §41: packages stay in place until the execution phase ports them).
- **Rollback is phase-level `git revert`, not per-consumer-independent.** Because each old
  `pi-*` package is removed at its own port phase (B001 §8.5), the only rollback that can
  restore a consumer's pre-migration path is a `git revert` of that port phase's commits.
  The adapter-disable fallback (disable the `SessionDispatchPort` adapter and fall back to
  the still-installed `pi-sessions` engine) is meaningful **only in the window before that
  consumer's old package is removed**; once it is removed the fallback no longer exists.
- **At/after the final cut**, rollback = `git revert` the single retirement commit,
  restoring `packages/pi-sessions` and its host. The delete is atomic (one commit) so it
  is cleanly revertible; per-phase seam adoption already landed in earlier commits and
  need not be reverted.
- Keep the retirement commit isolated from the seam-adoption commits so the cut is a
  named, one-commit reversal (matches the SPEC §52 "explicit cut and rollback per step").

## Open Questions

- None blocking. A003 Open Q1 (portable transcripts) is closed by the locked input:
  local-only is acceptable, no export/projection. A006 Q7/Q8 are ruled in §7/§8. The only
  residual is a *future* product ask — a durable receipt or an agent-invocable notice
  tool — both specified as read-only projections over native surfaces (§4, §7) and
  deferrable to execution.

## Handoff

- Feeds B005 plan-migration-sequence.
- Constrains B002 (`SessionDispatchPort` shape: create/prompt(steer)/interrupt/wait +
  `subagent` for continue/resume; message reads via `ctx.data.session`/`ctx.event`/
  client) and B004 (workspace session panels read `ctx.data.session` and answer via
  `form.reply`). Feeds B006 only in that no new engine package ships.

## Deviations

- None.
