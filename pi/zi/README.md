# @montflow/zi

The montflow **workspace** — a Pi extension that owns the project's agent state and serves it through a **single web UI**. The architecture is server-first: **all logic lives server-side** and the browser is a pure render target.

- A **machine-level router daemon** (`router.ts`) serves the SPA on one port for ALL project folders, exposes a **WebSocket** (`/ws`) that browsers read live state from (session events, agentic-run streams, notifications, folder/workspace lists), and a **REST API** for mutations (workspaces, skills, profiles, runs, models, session renames).
- Each pi process runs a thin **backend adapter** (`ui-server.ts`) that connects *out* to the router, registers its folder, streams pi events, and executes browser commands: prompts into the main session, and **agentic runs** (isolated, resumable agent sessions that author skills/profiles).
- The interactive TUI wizard was **removed** — the browser is the only interface. The adversarial review loop was removed and is being **reworked** (see below).

This extension also **merges the former `@montflow/profiles` feature**: named agent profiles are managed from the web UI (manual or agentic runs), and `profiles:get` / `profiles:list` are served on the event bus for other extensions (see [Profiles](#profiles)).

**All state lives under `.agents/@montflow/`** in the project:

```text
.agents/@montflow/
  profiles/             # named agent profiles (<name>/PROFILE.md + TEMPLATE.md)
  reviews/              # review state (from previous runs; loop being reworked)
  workspace.json        # generated workspace identity (for the web UI)
```

## Architecture

```text
┌─ SERVER (router daemon, one per machine) ──────────────┐
│  · serves the SPA (ui/dist)                            │
│  · WS /ws → browsers: events, skillGen, notify, …      │
│  · REST API: workspaces, skills, profiles, runs, …     │
│  · run store (sqlite), model picker, session renames   │
└───────────┬────────────────────────────────────────────┘
            │ WS /backend (pi adapter connects OUT)
┌───────────▼────────────────────────────────────────────┐
│  pi extension (thin connector per folder)              │
│  · registers folder/workspace/models                   │
│  · prompt/steer/followUp → main pi session             │
│  · agentic runs (isolated agents) + event forwarding   │
└────────────────────────────────────────────────────────┘
```

Any number of pi sessions share one router; the browser gets a **folder picker**. The protocol between all three layers is defined once in `ui-protocol.ts` (mirrored in `ui/src/protocol.ts`).

## Commands

| Command | What it does |
|---|---|
| `/zi` | Launch the montflow **web UI** for the current workspace. Auto-creates `.agents/@montflow/workspace.json` (named after the current **git branch**) when missing, then opens the shared UI at the workspace page. Flags: `--stop` stops the router, `--port=NNNN` pins the port. `restart` stops and restarts the UI (fresh router, same port), `kill` ends every registered session and stops the router (e.g. `/zi kill`). `status` reports router state. Works without a TUI (RPC/print). |
| `/montflow` | Alias of `/zi` (same flags) — kept for muscle memory. |

## Web UI

The SPA (React, `ui/`) is a pure render target — every piece of data it shows comes from the router's WS push or REST API:

- **Workspaces** — landing list of known projects (folder picker, session renames, remove).
- **Sessions** — the pi session transcript for a connected folder, live-streamed over the WS (`prompt` / `steer` / `followUp`).
- **Skills & Profiles** — filesystem-backed CRUD over the REST API (`.agents/skills/<name>/SKILL.md`, `.agents/@montflow/profiles/<name>/PROFILE.md`), editable manually or **agentically**.
- **Runs** — agentic run history + live transcript pages. Agentic runs are the core workhorse: each run gets its **own isolated, resumable pi agent session** under `~/.pi/agent/runs/<cwd-slug>/<runId>/`, streams deltas + tool activity to the browser, persists across restarts, and supports answering back (the run continues with context).
- **AI input** — a one-shot `textGenerate` fills any text field agentically (ephemeral: no run record, no persistence).
- **Model picker** — per-run model override; the router unions models across connected sessions and persists the selection.

### Agentic runs

Two command families (all over the WS `command` messages):

| Kind | What it does |
|---|---|
| `skillAgentic` / `profileAgentic` | Isolated agent authors/edits a SKILL.md or PROFILE.md, streamed live to the run page |
| `textAgentic` / `textGenerate` | AI-input fill: full run (recorded) vs one-shot (ephemeral) |

Runs are durable: metadata lives in the router's sqlite store (`run-store.ts`) and each run's transcript in its pi session file, so a run survives pi and router restarts and can be resumed. `skillReply` answers a waiting run; `skillSetStatus` force-stops or overrides a stuck run.

## Profiles

The **merged `@montflow/profiles` feature** — a pure profile store. A profile is data — a one-line description (the agent's role and what it does), custom instructions, a review checklist, a preferred model, and a list of skills — nothing more. Profiles live at `.agents/@montflow/profiles/<name>/PROFILE.md`; the canonical structure is defined by the bundled `profiles/TEMPLATE.md` (copied into `.agents/@montflow/profiles/TEMPLATE.md` on first use).

Profiles are managed from the **montflow web UI** (`/montflow` → Profiles): create/modify manually (raw PROFILE.md) or **agentically** — an isolated agent run reads the profile, applies the change, and writes it back, streamed to the run page where you can answer back.

This extension **never executes anything** on the profiles side: no activation, no model switching, no prompt injection, no skill loading. It only stores profiles and serves profile context to **other extensions** over the event bus (`profiles:get` / `profiles:list` — see `profiles/api.ts`):

```ts
import { getProfileViaBus, listProfilesViaBus } from './profiles/api.ts';
const result = await getProfileViaBus(pi, 'code-reviewer', ctx.cwd); // { ok, profile } | { ok, error }
const names = await listProfilesViaBus(pi, ctx.cwd);                 // { ok, names } | { ok, error }
```

Channels: `profiles:get` `{ id, name, cwd }` → `profiles:get:result`; `profiles:list` `{ id, cwd }` → `profiles:list:result`. Client helpers time out (5s default) when no server is registered.

## REST API (router)

All under the router port; workspaces are addressed by their generated id (`workspace.json`):

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Router liveness + protocol version + registered folders |
| `GET /api/folders` | Connected pi sessions (folder picker) |
| `GET/PUT /api/models` | Pickable models + persisted selection |
| `GET /api/workspaces` · `DELETE /api/workspaces/<id>` | Workspace list / remove from home |
| `PUT /api/sessions/<id>` | Session rename (persisted) |
| `GET /api/workspaces/<id>/info` | Git identity (folder, repo, branch, path) |
| `GET/POST /api/workspaces/<id>/skills` · `GET/PUT/DELETE .../skills/<skillId>` | SKILL.md CRUD |
| `GET/POST /api/workspaces/<id>/profiles` · `GET/PUT/DELETE .../profiles/<name>` | PROFILE.md CRUD |
| `GET /api/runs?workspace=&status=` | Durable agentic-run history |

WS pushes (`/ws`): `folders`, `hello` (session snapshot), `event` (live pi events), `notify`, `skillGen` (run streams), `textGen`, `modelsChanged`, `skillChanged`/`profileChanged` (cross-tab invalidation), `sessionChanged`.

## Reworking the review loop

The adversarial review loop (reviewer roster → supervisor → fixer state machine, the interactive wizard, review presets, and their TUI widget) was **removed** in this iteration. The plan is to rebuild it **server-side**: the router daemon will own the run orchestration and stream state over the WS (an API to start runs, plus decision requests for cycle-max prompts), so it runs headlessly with the web UI as the only frontend.

## Installation

```json
{
  "pi": {
    "extensions": ["path/to/zi/index.ts"]
  }
}
```

Requires `@earendil-works/pi-coding-agent` as a peer dependency. TypeScript loaded by Pi's jiti loader — no build step. Runtime side effects use Effect v4 + `@effect/platform-node`. The router daemon runs under plain `node` type-stripping (Node >= 23.6).

## Module map

| File | Responsibility |
|---|---|
| `index.ts` | Pi command entry — registers `/zi` (alias `/montflow`) and the merged profile bus API |
| `ui-server.ts` | Pi-side backend adapter — connects to the router, registers the folder, streams events, executes browser commands (prompt/steer/followUp + agentic runs) |
| `router.ts` | Machine-level server daemon — SPA, WS relay, REST API, run store, model picker |
| `ui-protocol.ts` | Wire protocol shared by router, backend, and SPA |
| `skill-run.ts` | Agentic-run machinery (isolated resumable agent sessions) |
| `runner.ts` | Agent session runner (persistent agents, retry policy, model fallback) |
| `models-client.ts` | Model-picker helpers (available models, current-model preselection) |
| `run-title.ts` | Generated run titles (opencode big-pickle) |
| `run-store.ts` | Router-side sqlite run store |
| `git.ts` | Git branch helper (workspace identity) |
| `profiles/` | **Merged `@montflow/profiles` feature**: profile store (`store.ts`), parse/serialize (`model.ts`), template (`TEMPLATE.md`), and the event-bus API for other extensions (`api.ts`) |
| `ui/` | The SPA (React + Vite) — pure render target |
| `test/` | Unit tests |
