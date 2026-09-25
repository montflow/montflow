---
name: runs-driven-agentic-flows
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-09-21
locked-phases:
---

# Runs-driven agentic flows

## Description

Workspace agentic flows spawn short-lived headless `pi -p` children and parse
output. Runs stay invisible, cannot be steered, cannot ask questions, and report
back only by re-reading files. First, make `@montflow/pi-runs` functional
software: a run engine over Pi whose transcript and lifecycle live in our own
repo-local store — not Pi's session store — so a run can be started on one
machine, committed and pushed, then resumed on another. Runs behave like
subagents. Expose the engine as a Pi extension and a CLI, then let the workspace
consume it as a dependency and dispatch steerable profile-creation runs. Scope
ends at the agentic profile creation flow.

## Requirements

- `@montflow/pi-runs` gains a run engine over Pi, functional without the workspace.
- Runs are always **local** to a repository; there is no global/in-memory mode.
- Our own store owns chat history and lifecycle (`run.md`, `session.jsonl`, `receipt.md`) — never Pi's session store.
- A run is portable: start on machine A, commit + push, resume the same run on machine B.
- Resume reconstructs the Pi session from our store (replay), not from a Pi session file.
- A run is mechanically verifiable (`verifyRun`): validity + resumability; invalid runs refuse to resume.
- Runs are subagent-like: a run can carry a parent and be spawned/steered like one.
- `@montflow/pi-runs` exposes two surfaces — a Pi extension and a CLI — over the shared engine.
- The workspace consumes the package as a plain dependency and requires the extension installed for agentic flows.
- Agentic profile creation dispatches a run with the author prompt/params; dispatch toasts the run with a keybind to its detail page.
- Run detail supports live transcript, steering while running, and answering while parked.
- On completion the run invokes the profile CLI command; the workspace refreshes and displays the new profile.
- Runs can make two calls back to the workspace: dispatch a toast and dispatch a notification.
- Deferred: profile modify/fix and every other agentic flow.

## Tasks

| ID   | Name                       | Type        | Status  | Gates |
| ---- | -------------------------- | ----------- | ------- | ----- |
| A001 | explore-pi-run-backend     | exploratory | complete | No   |
| A002 | explore-run-persistence    | exploratory | complete | No   |
| A003 | explore-dual-surface       | exploratory | complete | No   |
| A004 | interrupt-lock-contract    | interruptor | complete | No   |
| A099 | review-phase               | review      | complete | No   |
| B001 | implement-run-store        | execution   | complete | Yes  |
| B002 | implement-run-engine       | execution   | complete | Yes  |
| B003 | implement-run-verify       | execution   | complete | Yes  |
| B004 | test-run-engine            | execution   | complete | Yes  |
| B005 | implement-pi-factory       | execution   | complete | Yes  |
| B006 | implement-subruns          | execution   | complete | Yes  |
| B007 | fix-review-findings        | execution   | complete | Yes  |
| B008 | persist-tools-allowlist    | execution   | complete | Yes  |
| B009 | test-session-port          | execution   | complete | Yes  |
| B099 | review-phase               | review      | complete | No   |
| C001 | implement-extension-entry  | execution   | complete | Yes  |
| C002 | implement-cli-surface      | execution   | complete | Yes  |
| C003 | test-surfaces              | execution   | complete | Yes  |
| C099 | review-phase               | review      | complete | No   |
| D001 | explore-workspace-integration | exploratory | complete | No |
| D002 | implement-session-runner   | execution   | complete | Yes  |
| D003 | implement-detail-steering  | execution   | complete | Yes  |
| D099 | review-phase               | review      | complete | No   |
| E001 | wire-profile-create        | execution   | complete | Yes  |
| E002 | test-profile-create        | execution   | complete | Yes  |
| E099 | review-phase               | review      | complete | No   |
