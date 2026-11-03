# Memory

## Context

Decide how a phase is authored for parallel execution, how the C003 board and
mailbox channels are used to speed handoffs, and how verification runs are keyed,
serialized, and reused so parallel agents do not launch the same heavy command.

## Progress

- 2026-11-02: pending, not started.

## Open Questions

- None yet.

## Handoff

- E002 implements the scheduler on top of C002's `gate run`.
- E003 teaches the phase shape, channel protocol, and scheduler in the authoring
  and execution artifacts.

## Deviations

- None yet.
