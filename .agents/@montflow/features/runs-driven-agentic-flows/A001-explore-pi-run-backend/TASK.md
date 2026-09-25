---
id: A001
name: explore-pi-run-backend
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: Explore the Pi run backend

## Type: exploratory

## Description

Decide how `@montflow/pi-runs` executes a run against Pi. Compare the two
candidate paths and pick one (or a split):

- `pi --mode rpc` subprocess: typed `RpcClient`, `prompt`/`steer`/`follow_up`/
  `abort`/`clear_queue`, `agent_settled`, and the extension UI Q&A sub-protocol.
- In-process `AgentSession` (`@earendil-works/pi-coding-agent`) and the existing
  `@montflow/pi-effect` `AgentRun.runAgent` (`createAgentSession`, in-memory).

Read local docs and `dist` typings first (`finding-references`).

## Requirements

- Single recommendation with rationale.
- Steering and Q&A mapped to concrete calls for the chosen path.
- How a caller-supplied model pin and cwd flow through.
- Known limitations (streaming deltas, process lifetime, abort semantics).

## Completion

- [ ] Findings summarized in MEMORY.md
