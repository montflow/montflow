---
id: B002
name: decide-adapter-seams
type: planning
originator: user
depends-on: A006
related-tasks:
status: pending
---

# Task B002: Decide the adapter seams

## Type: planning

## Description

Decide the ports that isolate OpenCode so the domain code stays host-agnostic
and testable, and specify each interface plus its concrete OpenCode
implementation.

## Requirements

- Define each port interface (session, interactive/dialog, model catalogue, plugin host/runtime, notifications) and the concrete OpenCode implementation behind it.
- Decide how the OpenCode Effect domain client is injected, given the plugin runtime's `effect` redirection.
- Decide how the ports are tested without a running OpenCode server.
- Decide what is deliberately not abstracted, and why (avoid speculative indirection).
- Record the interface signatures and the files that will hold them.

## Completion

- [ ] Port interfaces and implementing files recorded
- [ ] Injection and test strategy for each port captured
- [ ] Deliberate non-abstractions listed
