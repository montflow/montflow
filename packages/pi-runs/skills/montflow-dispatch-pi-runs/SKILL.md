---
name: montflow-dispatch-pi-runs
description: Dispatches, observes, and controls local agent runs through the @montflow/pi-runs engine using the `mf-runs` CLI and the `run_*` tools. Use when an agent must start a run, steer or answer a live run, resume a stopped run, or read run status, verification, and receipts.
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
scouting, reviewing, long edits, parallel tasks — or when an existing run must be
observed, steered, answered, interrupted, or resumed.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Ensure the Skill Is Installed

Run `mf-runs doctor`. It checks `.agents/skills/montflow-dispatch-pi-runs/`
and installs the skill from the package when missing. Re-run after upgrading
`@montflow/pi-runs`.

## 2. Pick the Dispatch Surface

1. **`run_start` tool** (inside a Pi session): returns immediately (`detach`).
   The run stays live in this process, so `run_steer` / `run_answer` reach it.
2. **`mf-runs start` CLI** (from bash or a script): blocks until the run settles,
   up to 30 minutes, then the process exits. Use it for fire-and-collect work.
   A run dispatched this way is only steerable from the process that started it.

Never call the CLI in the foreground to dispatch a long run you intend to steer —
it owns the session and blocks.

## 3. Start a Run

Give every run a lowercase kebab id. Capture the initial prompt explicitly.

```bash
mf-runs start --id scout-auth --prompt "Map the auth code" --model opencode-go/deepseek-v4.1-flash --tools read,grep,glob
```

- `--model` pins `provider/model-id`; omitted means Pi's settings default.
- `--tools` restricts the tool allowlist; `ask_user`/`notify_user` are always added.
- `--parent <run-id>` makes this a subrun; `--related a,b` links siblings.
- The run store is `.agents/@montflow/runs/` and is git-ignored.

## 4. Observe

```bash
mf-runs list [--status <states>]
mf-runs status <run-id>
mf-runs verify <run-id>
```

- `list --status <states>` keeps only runs in the named states (comma-separated),
  e.g. `mf-runs list --status running,awaiting-input`. Omit it to list every run.
- `status` prints id, lifecycle status, turn count, receipt, and whether the
  store is git-ignored.
- `verify` prints `valid` and `resumable`. A run is resumable when it is valid,
  has no receipt, and its status is `running` or `awaiting-input`.
- Statuses: `pending`, `running`, `awaiting-input`, `done`, `failed`, `cancelled`.

## 5. Control a Live Run

These require the run to be live **in the same process** as the caller:

```bash
mf-runs steer <run-id> "focus on tests"
mf-runs answer <run-id> "production"
mf-runs interrupt <run-id>
```

`steer` queues a turn for a running run. `answer` unparks an `awaiting-input`
run (the answer travels through the `ask_user` tool result). A different process
reports "not live" — resume the run there instead.

## 6. Resume After a Crash or Restart

A hard crash leaves the run `running` with no receipt, so it is resumable.
A clean shutdown interrupts runs and writes a `cancelled` receipt, which is
**not** resumable.

```bash
mf-runs resume <run-id> [--prompt "continue"]
```

Resume rebuilds the session from the stored transcript and replays it. Refuses
when the run fails `verify`.

## 7. Collect the Result

Settlement writes a receipt: `done`, `failed`, or `cancelled`, plus a summary.
Read it through `mf-runs status` or the run's `receipt.md`. A `done` run has no
live session; a `failed` run's summary names the error.

# Reference

- **Run directory**: `.agents/@montflow/runs/<run-id>/` with `run.md`, `session.jsonl`, `receipt.md`.
- **Engine docs**: `packages/pi-runs/wiki/` — architecture, session model, storage, process and recovery.
- **Package source**: `packages/pi-runs/src/` — `apps/commands` (verbs), `services/runner` (engine), `services/store` (files).
