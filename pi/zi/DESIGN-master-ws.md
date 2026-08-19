# Design: Master WS + Static-HTTP Split

> Status: **proposed**. Single master process handles ALL connections over WebSocket; HTTP is reduced to serving the SPA bundle (and liveness probes). Browser commands and CRUD move from HTTP/REST and one-directional WS into a typed request/response protocol on `/ws`. The master is rebuilt on Effect.

## Locked decisions

1. **One master process per machine.** It owns every connection: browser tabs (`/ws`) and pi backends (`/backend`). Tabs and backends are stateless clients; the master owns all registries, caches, and stores. This is the current `router.ts` role — unchanged.
2. **Everything is WS except static bytes.** The HTTP listener serves only `ui/dist` (the SPA) and `healthz` (liveness, used by the backend for router discovery). No business logic, no CRUD, no commands over HTTP.
3. **Browser ↔ master is a typed RPC channel on `/ws`.** Request/response with correlation ids; pushes ride the same socket server-initiated. No HTTP semantics (methods/status codes) — one envelope, Schema-typed.
4. **Backend ↔ master stays WS `/backend`.** Register/events/run-streams up, command dispatch down — already both directions today; no change in spirit.
5. **All wire types are Effect Schema.** One discriminated union per direction, validated on both ends. Corrupt/garbage messages fail decode and are dropped with an error response, never interpreted.
6. **The master runs detached via `node router.ts`** (erasable TypeScript, Node ≥ 23.6 type-stripping). Effect compiles fine there; no tsx-only syntax.

## Motivation

Today the master speaks two dialects: HTTP/REST for CRUD (`/api/workspaces`, `/api/skills`, `/api/profiles`, `/api/presets`, `/api/runs`, `/api/models`, `/api/reviewers`, `/api/folders`, `/api/shutdown`, `/api/kill`) and WS for everything else. The browser therefore has two transport paths — `fetch` in the `use*` hooks and command messages over the socket — plus the router itself is plain Node with Effect sprinkled in, not one coherent stack.

One WS channel with an RPC layer gives:

1. **One transport, one protocol** — a single Schema catalog documents every message in both directions; no route table, no method/status translation, no two code paths in the frontend.
2. **One codebase style** — master, protocol, and backend all Effect + Schema; the daemon stops being the odd plain-TS file.
3. **One source of truth** — requests that mutate state (skill CRUD, run status, model selection, shutdown) are handled by the same master code that already owns the state, instead of REST handlers bolted beside WS handlers.

## Architecture

```
┌─ MASTER (one per machine, Effect) ───────────────────────┐
│  HTTP  → static SPA (ui/dist) + /healthz                │
│  WS /ws      ← browser tabs: push down, RPC up          │
│  WS /backend ← pi backends: events/streams up, cmds down│
│  State: Connections · Folders · Runs · Workspaces ·     │
│         Models · Notifier  (all behind one Layer)       │
└──────────────────────────────────────────────────────────┘
```

## Wire protocol

One envelope, three kinds (Schema discriminated union):

```ts
// Browser → master (and any other request path)
{ kind: 'request', id: string, method: Method, payload: Json }
// Master → requester
{ kind: 'response', id: string, ok: boolean, error?: { code: string, message: string }, payload?: Json }
// Master → browser (server-initiated push)
{ kind: 'push', topic: Topic, payload: Json }
```

- `id` is a client-generated uuid; responses correlate to requests. A request with no live handler or a decode failure returns `{ ok: false, error }` — the browser never hangs.
- `method` is a Schema literal-union of every browser→master operation (catalog below).
- `topic` is a Schema literal-union of every push (folders, hello, skillGen, modelsChanged, notify, event, …).

### Method catalog (browser → master)

Migrated from today's REST + WS command surface:

| Method | Today (REST / WS) |
|---|---|
| `workspaces.list` / `workspaces.remove` | `GET|DELETE /api/workspaces[/<id>]` |
| `workspace.info` | `GET /api/workspaces/<id>/info` |
| `skills.list` / `skills.create` / `skills.read` / `skills.update` / `skills.delete` | `GET|POST|PUT|DELETE /api/workspaces/<id>/skills…` |
| `profiles.list` / `profiles.create` / `profiles.read` / `profiles.update` / `profiles.delete` | `…/profiles…` |
| `presets.list` / `presets.create` / `presets.read` / `presets.update` / `presets.delete` | `…/presets…` |
| `runs.list` | `GET /api/runs?workspace=&status=` |
| `models.list` / `models.select` | `GET|PUT /api/models` |
| `reviewers.list` | `GET /api/reviewers` |
| `command.dispatch` (prompt / steer / followUp) | WS `command` message |
| `run.reply` / `run.snapshot` / `run.setStatus` | WS `skillReply` / `skillSnapshot` / `skillSetStatus` |
| `run.start` (skill / profile / preset / text agentic + textGenerate) | WS `skillAgentic` / `profileAgentic` / `presetAgentic` / `textAgentic` / `textGenerate` |
| `server.shutdown` / `server.kill` | `POST /api/shutdown` / `POST /api/kill` |

### Push catalog (master → browser)

Unchanged set, same wire meaning as today: `folders`, `hello`, `skillGen`, `modelsChanged`, `notify`, `event`, `sessionChanged`, `textGen`.

### Backend ↔ master

Unchanged in spirit (`register` / `unregister` / `event` / `modelsChanged` / `hello` / `notify` / `textGen` / `skillGen` / `sessionChanged` up; `command` down; `ok`/`error` acks). Gains Schema typing on the shared envelope.

## Master internals (Effect)

- **`Connections`** service — browser socket set + backend registry (`Map<folderSlug, BackendConn>`, instance suffixing), broadcast helper.
- **`Folders`** service — folder list, cached `hello`, run→folder routing.
- **`Runs`** service — in-memory cache + `node:sqlite` store behind one interface (SQLite stays optional: older Node falls back to cache-only), 30-day retention.
- **`Workspaces`** service — durable workspaces list, session renames, workspace marker read/write.
- **`Models`** service — picker union across backends + persisted selection (`models.json`).
- **`Notifier`** service — push fan-out.
- One `Layer` composes them; the daemon entry builds it, runs the HTTP (static + healthz) and both WS servers, and wires shutdown.

## Migration path

1. **Protocol first** — define the envelope + method/push Schema unions in `ui-protocol.ts` (types today; Schema codecs replace the hand-rolled interfaces).
2. **Master RPC dispatch on `/ws`** — add the envelope decode + dispatch table next to the existing command handling; implement each method by moving the current REST handler body into a handler function.
3. **Frontend** — add an `rpc(method, payload) → Promise` helper over the socket (id correlation, timeout, error surfacing); rewrite the `use*` hooks' `fetch` calls to it; keep hook signatures identical so components don't change.
4. **Delete the REST routes** — leave only static serving + `healthz`.
5. **Backend** — move its message send/recv onto the shared Schema codecs; no behavioral change.
6. **Verify** — `ui-smoke-test.mjs` updated to assert the RPC round-trip (prompt dispatch, CRUD, run status) over WS instead of HTTP where applicable.

## Open question

**Per-tab sockets vs one shared socket.** This design keeps one socket per browser tab (standard; the master is the single source of truth). A truly single socket across tabs (SharedWorker/BroadcastChannel) is possible later without touching the master — out of scope for now.
