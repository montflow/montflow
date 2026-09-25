---
id: A004
name: interrupt-lock-contract
type: interruptor
originator: user
depends-on: A001,A002,A003
related-tasks:
status: complete
---

# Task A004: Lock the run engine contract

## Type: interruptor

## Description

Present A001–A003 and lock, before any code:

1. Execution backend: in-process `AgentSession` (not RPC subprocess).
2. Persistence: our Store owns all history; Pi runs on `SessionManager.inMemory`; resume replays our transcript. Cross-machine resume via git commit/push.
3. Engine API: always local; `run({ root, id, prompt, model?, tools? })` — no mode argument.
4. Extension + CLI command surface over the shared engine.
5. Completion hook (`/mf-profiles-cli create …` vs engine-side) and the two workspace notification calls.

## Requirements

- Each decision recorded verbatim in MEMORY.md `Handoff`.
- User explicitly approves or amends each decision.

## Completion

- [ ] User decision recorded in MEMORY.md
