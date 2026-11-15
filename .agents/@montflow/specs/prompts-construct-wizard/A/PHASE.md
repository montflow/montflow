---
id: A
objective: Define and wire the shared construct engine and wizard.
status: pending
review: required
gate: none
serial-reason: A002 consumes the construct engine (A001), and A003 wires the command that binds both, so the three waves follow a real output-consumption chain.
---

# Phase A

## Notes

One phase, three work tasks plus the A004 review. Standard rigor: gate is
per-task (no phase gate), review is required. The chain is a stated decision,
not a fallback: the wizard renders through the shared engine, and the command
wiring exposes the wizard, so each depends on the prior task's output. A001
runs first, A002 waits on A001, A003 waits on both.

- Wave 1: A001 construct-engine
- Wave 2: A002 construct-wizard
- Wave 3: A003 wire-construct-command
- A004 review-phase gates the whole phase
