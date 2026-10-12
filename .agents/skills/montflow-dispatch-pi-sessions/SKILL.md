---
name: montflow-dispatch-pi-sessions
description: Dispatches, observes, and controls local agent sessions through the @montflow/pi-sessions engine using the `mf-sessions` CLI and the `session_*` tools. Use when an agent must start a session, steer or answer a live session, resume a stopped session, or read session status, verification, and receipts.
id: e6fc4e127b49f396
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - workflow
---

# When To Use

Use when work should run in a separate agent session instead of the current one —
scouting, reviewing, long edits, parallel tasks — or when an existing session must be
observed, steered, answered, interrupted, or resumed.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Ensure the Skill Is Installed

Run `mf-sessions doctor`. It checks `.agents/skills/montflow-dispatch-pi-sessions/`
and installs the skill from the package when missing. Re-run after upgrading
`@montflow/pi-sessions`.

## 2. Pick the Dispatch Surface

1. **`session_start` tool** (inside a Pi session): returns immediately (`detach`).
   The session stays live in this process, so `session_steer` / `session_answer` reach it.
2. **`mf-sessions start` CLI** (from bash or a script): blocks until the session settles,
   up to 30 minutes, then the process exits. Use it for fire-and-collect work.
   A session dispatched this way is only steerable from the process that started it.

Never call the CLI in the foreground to dispatch a long session you intend to steer —
it owns the session and blocks.

## 3. Start a Session

Give every session a lowercase kebab id. Capture the initial prompt explicitly.

```bash
mf-sessions start --id scout-auth --prompt "Map the auth code" --model opencode-go/deepseek-v4.1-flash --tools read,grep,glob
```

- `--model` pins `provider/model-id`; omitted means Pi's settings default.
- `--tools` restricts the tool allowlist; `ask_user`/`notify_user` are always added.
- `--parent <session-id>` makes this a subsession; `--related a,b` links siblings.
- The session store is `.agents/@montflow/sessions/` and is git-ignored.

## 4. Observe

```bash
mf-sessions list [--status <states>]
mf-sessions status <session-id>
mf-sessions verify <session-id>
```

- `list --status <states>` keeps only sessions in the named states (comma-separated),
  e.g. `mf-sessions list --status running,awaiting-input`. Omit it to list every session.
- `status` prints id, lifecycle status, turn count, receipt, and whether the
  store is git-ignored.
- `verify` prints `valid` and `resumable`. A session is resumable when it is valid,
  has no receipt, and its status is `running` or `awaiting-input`.
- Statuses: `pending`, `running`, `awaiting-input`, `done`, `failed`, `cancelled`.

## 5. Control a Live Session

These require the session to be live **in the same process** as the caller:

```bash
mf-sessions steer <session-id> "focus on tests"
mf-sessions answer <session-id> "production"
mf-sessions interrupt <session-id>
```

`steer` queues a turn for a running session. `answer` unparks an `awaiting-input`
session (the answer travels through the `ask_user` tool result). A different process
reports "not live" — resume the session there instead.

## 6. Resume After a Crash or Restart

A hard crash leaves the session `running` with no receipt, so it is resumable.
A clean shutdown interrupts sessions and writes a `cancelled` receipt, which is
**not** resumable.

```bash
mf-sessions resume <session-id> [--prompt "continue"]
```

Resume rebuilds the session from the stored transcript and replays it. Refuses
when the session fails `verify`.

## 7. Collect the Result

Settlement writes a receipt: `done`, `failed`, or `cancelled`, plus a summary.
Read it through `mf-sessions status` or the session's `receipt.md`. A `done` session has no
live session; a `failed` session's summary names the error.

# Reference

- **Session directory**: `.agents/@montflow/sessions/<session-id>/` with `session.md`, `session.jsonl`, `receipt.md`.
- **Engine docs**: `packages/pi-sessions/wiki/` — architecture, session model, storage, process and recovery.
- **Package source**: `packages/pi-sessions/src/` — `apps/commands` (verbs), `services/session-runner` (engine), `services/store` (files).
