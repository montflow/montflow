# Memory

## Context

A003 validates the migration hypothesis that `pi-sessions` is retired entirely and
replaced by OpenCode's native `ctx.session.*` surface + built-in subagent system.
Compared capability-by-capability against the pinned reference clone
`.agents/references/opencode/` @ `v2.0.18` (`packages/core/src/session/**`,
`packages/plugin/src/effect/session.ts`, `specs/v2/session.md`). Conclusion: the
hypothesis holds — **retire `pi-sessions`**. No capability is missing that would
justify keeping a montflow-owned session engine; the only no-exact-analog items are
UI projections (toast/notify/status), the file-based receipt/verify ledger, and
copyable/portable transcripts — the last the single candidate product question — all
of which are dropped or re-projected, not engine work.

## Progress

- 2026-10-13: complete

## Findings

### 1. pi-sessions inventory (v1 sources)

- **Durable transcript store** — `packages/pi-sessions/src/services/store/store.services.module.ts`
  (`Store.make`/`build`): per-session dir with `session.jsonl` (events),
  `session.md` (frontmatter descriptor + rendered body), `receipt.md`, a `.lock`
  dir + atomic temp-rename writes, `Ephemeral` in-memory backend, and
  `verifyStoreIgnored` git-ignore guard. Transcript here is a git-ignored local
  file tree (not committed).
- **Lifecycle states** — `modules/session/session.module.ts` `STATUSES` =
  `pending | running | awaiting-input | done | failed | cancelled`; `Session`
  class carries `parent`, `related`, `spec`, `model`, `thinking`, `tools`, `progress`.
- **steer/answer/interrupt/resume** — `services/session-runner/session-runner.services.module.ts`
  `SessionRunnerImpl` (`steer` L473, `answer` L482, `interrupt` L499, `resume` L424);
  asks park via `Store.ask` (`awaiting-input`) and `Store.unpark`; `pendingAsks` map.
- **Receipts** — `modules/receipt/receipt.module.ts` `Receipt`
  (`outcome: done|failed|cancelled`, `summary`, `endedAt`); written once by
  `Store.settle`/`Store.cancel`.
- **replay/verify** — `modules/replay/replay.module.ts` (`toMessages`/`canReplay`
  seed a fresh Pi session from stored transcript); `modules/verify/verify.module.ts`
  (`verifySession` checks frontmatter, event `seq` ordering, receipt consistency,
  resumability; `verifyStoreIgnored` for `.gitignore`).
- **Runner/Factory/Port** — `SessionRunner` service; `SessionFactory` + `SessionPort`
  abstraction (`session-runner.services.module.ts` L40-77); real Pi wiring in
  `pi-session.services.module.ts` (`createPort`, `SessionManager.open/inMemory`).
- **`Runtime.activeSessionRunnerHost`** — `apps/runtime/runtime.apps.module.ts`
  L84-138: per-repo-root `ManagedRuntime<SessionRunner>` cache, module-global
  `activeHost`, `setActiveSessionRunnerHost`/`activeSessionRunnerHost`.
- **Child-session tools** — `pi-session.services.module.ts` `interactionTools`
  L69-133: `ask_user`, `notify_user`, `toast_user`, `update_status`.
- **`session_*` agent tools + command** — `extension.ts` L197-328
  (`session_start/status/verify/list/resume/interrupt/steer/answer`) plus
  `/mf-sessions` command; verbs implemented in `apps/commands/commands.apps.module.ts`,
  CLI in `apps/cli/main.ts`.
- **Session event stream** — `modules/session-event/session-event.module.ts`
  (`seq/role/text/at`, raw Pi message for replay); mirrored from Pi
  `message_end`/`agent_settled` in `pi-session.services.module.ts` `sessionEventOf`.
- **Workspace bridge** — `WorkspaceBridge` service (toast/notify), ConsoleBridge
  and per-context Pi bridge.

### 2. OpenCode session + subagent surface

- **Facade/API** — `packages/core/src/session.ts` `Session.Interface`: `create`,
  `fork`, `get`, `remove`, `list`, `messages`, `message`, `context`, `diff`, `inbox`,
  `cancelInbox/steerInbox/queueInbox`, `log`, `switchAgent/switchModel`, `rename`,
  `setMetadata/setPermissions`, `move`, `prompt`, `generate`, `command`, `shell`,
  `skill`, `compact`, `wait`, `active`, `background`, `resume`, `interrupt`,
  `synthetic`, `revert.*`. Plugin mirror in `packages/plugin/src/effect/session.ts`
  `SessionDomain` (L153-170).
- **ID-bound ops** — `packages/core/src/session/session.ts` `make().forSession`
  (L371-422): admission-owned `prompt` (L146), `synthetic` (L274), `compact` (L247),
  `wait` (L266), `resume` (L270), `interrupt` (L316), inbox mutation.
- **Delivery + durable inbox** — `session/inbox.ts`: `Delivery = steer|queue`,
  `admit`/`reconcile` idempotency, `admitCompaction`, `promote` at safe step
  boundaries; `session_inbox` is pending-only. Spec `specs/v2/session.md` L5-23,51.
- **Execution/ownership** — `session/execution.ts` (`SessionExecution`, write-ahead
  `claim`/`release`, terminal events), `session/run-coordinator.ts`
  (`SessionRunCoordinator` join/coalesce/interrupt/awaitIdle).
- **Context/compaction/instructions** — `session/context.ts` (`select`/`load`),
  `session/compaction.ts`, `session/history.ts`; instructions algebra per
  `specs/v2/session.md` L90-104.
- **Subagent system** — `tool/plugin/subagent.ts` (`subagent` tool: `agent`,
  `description`, `prompt`, `model`, `sessionID` to continue a child,
  `background`); `session/subagent-job.ts` (`SubagentJob`, parent/child,
  background jobs); `session/subagent-completion.ts` (`SubagentCompletion.deliver`
  admits a `<subagent …/>` synthetic into the parent); `job.ts` (`Job.Service`
  running/completed/error/cancelled, `block`/`background`/`wait`, durable
  `pendingBackground` markers); depth limit `experimental.subagent_depth`.
  Parent/child via `sessions.create({ parentID })`; child depth walk in
  `subagent.ts` L117-133.
- **Ask-user tool** — `tool/plugin/question.ts` (`question` tool + `Form` service,
  `Question.Prompt`), the native analog of `ask_user`.
- **Event stream** — `Session.log` (`session.ts` L165-169, 393-403) → `Bus.log`
  durable session events + `EventLog.Synced`; durable event inventory in
  `packages/schema/src/session-event.ts` (`session.execution.started/succeeded/
  failed/interrupted`, `session.inbox.enqueued/delivered/cancelled/delivery.changed`,
  step/text/tool events, `session.instructions.updated`) and ephemeral
  `session.status` (`session-status-event.ts`: idle/retry/busy).
- **Durable store** — `session/store.ts` (`SessionStore`: SQLite via `Database`,
  `messages`/`context`/`message`, `claim`/`release`/`listSuspended`/`countResume`);
  crash recovery per `specs/v2/session.md` L114-118.

### 3. Capability-by-capability comparison

| pi-sessions capability | OpenCode native cover | Verdict |
| --- | --- | --- |
| Durable transcript (`Store`, `session.jsonl`) | `SessionStore` SQLite + durable Bus (`store.ts`, `session-event.ts`) | Covered (SQLite not committed files) |
| `session.md`/frontmatter descriptor | `Session.Info` row via `store.get`/`list` | Covered |
| Lifecycle `pending/running/awaiting-input/done/failed/cancelled` | `session.execution.*` terminal events + ephemeral `session.status` + `Job` status | Covered |
| `awaiting-input` parking | `question` tool + `Form.ask` (tool call blocks; no discrete status) | Covered (status is derived, not stored) |
| steer | `steerInbox` + `prompt` delivery `steer` (`inbox.ts`) | Covered, richer (`queue` too) |
| answer | `question` tool answer, or `prompt` | Covered |
| interrupt | `Session.interrupt` → `SessionExecution`→`SessionRunCoordinator.interrupt` | Covered |
| resume | core `Session.resume`; crash recovery via `claim`/`listSuspended` (plugin `ctx.session` exposes **no** `resume` — dispatch/continue via the `subagent` tool with a child `sessionID`) | Covered, stronger |
| child-session tools `ask_user` | `question` (`tool/plugin/question.ts`) | Covered |
| `notify_user` / `toast_user` | agent-invocable tools (`pi.defineTool`, `pi-session.services.module.ts:69-133`); replacement needs a montflow-registered tool (ToolPort) bridging to `Toast.show`/`Attention.notify` | Gap (no first-class native tool; custom tool required) |
| `update_status` | agent-invocable tool (`pi.defineTool`); replacement needs a montflow-registered tool bridging to `Job` title/metadata + `session.synthetic` | Gap (no first-class native tool; custom tool required) |
| `session_*` tools (`start/status/list/resume/interrupt/steer/answer`) | `subagent` tool + `Session.list/get/messages/prompt/resume/interrupt` | Covered |
| `session_verify` (mechanical) | none (DB integrity + decode errors only) | Gap (dropped) |
| receipt (`Receipt`, `receipt.md`) | terminal `session.execution.*` + `Job.Info.status/output` + `SubagentCompletion.text` | Covered functionally; no persisted artifact |
| replay (`Replay.toMessages`) | durable projected history + crash recovery resume | Covered (local); cross-machine portability gap |
| verify (`verifySession`) | none | Gap (dropped) |
| `SessionRunner`/`SessionFactory`/`SessionPort` | native `SessionRunner` (`session/runner/index.ts`) + `Session.Service` | Covered |
| `WorkspaceBridge` | client/TUI concern | Covered (deleted) |
| `Runtime.activeSessionRunnerHost` singleton | host-scoped `Session.make` + global `Session.Service` node | Covered (deleted) |
| `SessionEvent` stream | `Session.log` durable + live instance stream | Covered, richer |
| `mf-sessions` CLI | `opencode` CLI + session API | Covered |

### 4. Retire-or-keep verdict

**RETIRE `pi-sessions` entirely.** No concrete capability is unmet. The engine's
whole reason to exist — durably owning a Pi `AgentSession`, mirroring its transcript,
and exposing a runner/host so sibling extensions and the workspace could dispatch —
is now native: the `Session.Service` facade + `SessionExecution` +
`SessionRunCoordinator` + the `subagent` tool and `Job` background system.

Blockers to escalate (none keep the engine): the only items with **no exact native
analog** are (a) a user-facing `notify`/`toast`/`update_status` tool, (b) the
mechanical `session_verify`/`verifySession` ledger, and (c) copyable/portable
`session.jsonl` transcripts replayable on another machine. (a) is a UI projection
(notifier / `session.synthetic`), (b) is dropped with the receipt ledger, and (c) is
the one genuine product question — **both** stores are durable-and-local (the old
`.agents/@montflow/sessions` file tree is git-ignored, `.gitignore:266-267`;
OpenCode persists in local SQLite), so the real delta is durable local file tree vs
durable local SQLite — tracked in Open Questions; it does not justify retaining the
engine.

### 5. Receipt / replay / verify ledger fate

**Drop the ledger by default.** `Receipt`, `Store.settle`/`Store.cancel`,
`session_verify`/`verifySession`, `verifyStoreIgnored`, and `Replay.*` are deleted.
The functional minimum survives for free: terminal outcome = `session.execution.
succeeded/failed/interrupted` (+ `Job.Info.status`); completion summary = last
assistant message text (`SubagentCompletion.text`, `subagent-completion.ts` L10-18);
resumption = durable projected history. **Smallest projection if a durable receipt is
later required:** one derived record per top-level session mapping the terminal
execution event + last assistant message, read from `Session.log` — no new store, no
new engine. Cost: consumers reading `detail.receipt` (see below) switch to that read.

### 6. `activeSessionRunnerHost` consumers → replacement paths

Every consumer of `Runtime.activeSessionRunnerHost` in the repo (3 references, 1 use
site):

- **`packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts`** L102/115
  (`startReview`): reads the host and calls `sessionRunner.start({parent, spec, tools})`.
  → Replace with an OpenCode subagent session: `sessions.create({ parentID: ctx.sessionID,
  agent, model })` + `sessions.prompt(...)`, or invoke the native `subagent` tool with
  a reviewer profile. `parent`/`spec` come from `ctx.session`; `tools` allowlist is the
  agent profile's tool policy.
- **`packages/pi-sessions/src/extension.ts`** L120 (`setActiveSessionRunnerHost`) and
  L102-155 dispatch/interrupt/`session_*` tools: deleted with the engine; superseded by
  the `subagent` tool + `Session.*`.
- **`apps/workspace/src/services/sessions/sessions.services.module.ts`**
  (`withSessionRunner`, `runtimeFor`, `startSession`/`steerSession`/`answerSession`/
  `interruptSession`, `SESSION_TOOL_NAMES`, `DEFAULT_SESSION_TOOLS`): the TUI's
  pi-sessions adapter is removed; the dashboard becomes an OpenCode client reading
  `Session.list/get/messages/log` and calling `prompt`/`interrupt`/`resume`.
- **Workspace sibling dispatchers** that start author/modify sessions through the
  engine — `services/specs/specs.services.module.ts`,
  `services/skills/skills.services.module.ts`, `services/prompts/prompts.services.module.ts`
  (all import `SessionDetail as EngineSessionDetail` from `@montflow/pi-sessions`): each
  moves onto `ctx.session` / subagent dispatch; `SessionDetail.receipt` reads become
  "last assistant message + terminal execution event".

## Open Questions

1. Does montflow require **copyable/portable transcripts** replayable on another
   machine? Neither store is committed: the old `.agents/@montflow/sessions` file
   tree is git-ignored local-only (`.gitignore:266-267`; `Store.SESSIONS_SEGMENTS`,
   `store.services.module.ts:44`; enforced by `verifyStoreIgnored`, called at
   `session-runner.services.module.ts:542`), and OpenCode persists in local SQLite
   (`store.ts`). The concrete delta is durable/local **file tree** vs durable/local
   **SQLite**. If a product flow needs portable session artifacts (e.g. copyable
   session files), that projection must be re-specified (export/projection step) —
   the single candidate blocker.
2. Do the workspace notices (`notify_user`/`toast_user`/`update_status` semantics)
   need a native replacement tool, or is client-side notification + `session.synthetic`
   sufficient? (Default: sufficient.)
3. Does anything rely on the mechanical `session_verify` resumability verdict, or is
   native decode/DB error surfacing enough? (Default: enough.)

## Handoff

- Feeds B003 decide-session-engine-mapping and A006 synthesize-migration-contract.

## Deviations

- None.
