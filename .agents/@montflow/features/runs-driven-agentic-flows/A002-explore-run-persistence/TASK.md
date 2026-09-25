---
id: A002
name: explore-run-persistence
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A002: Design our own run persistence + resume

## Type: exploratory

## Description

Runs are always local and our store owns the chat history — not Pi's session
store. Design the persistence and resume model:

- Source of truth: `runs/<id>/{run.md,session.jsonl,receipt.md}` (existing Store).
- Runtime: Pi `AgentSession` over `SessionManager.inMemory(cwd)`; mirror events
  into our Store on `message_end`.
- Resume on another machine: replay our `session.jsonl` into a fresh in-memory
  `SessionManager` via `appendMessage`, then continue prompting.
- Lossless replay: decide whether `RunEvent.Event` must carry the raw Pi message
  (assistant `api/provider/model/usage/stopReason`) or whether minimal
  user/assistant messages reconstruct acceptably.
- Subagent framing: parent/child runs, settle order, depth cap (see
  `packages/pi-runs/wiki/session-model.md`).

## Requirements

- Exact persistence table: what is written, when, by whom.
- Resume algorithm stated step by step, including missing/partial transcripts.
- Recommendation on extending the `Event` schema for lossless replay.
- Git portability rules (what is committed, conflict/lock behavior).

## Completion

- [ ] Findings summarized in MEMORY.md
