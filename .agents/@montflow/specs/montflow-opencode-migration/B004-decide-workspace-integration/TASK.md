---
id: B004
name: decide-workspace-integration
type: planning
originator: user
depends-on: A004, A006
related-tasks:
status: complete
---

# Task B004: Decide the workspace integration surface

## Type: planning

## Description

Decide the workspace's target OpenCode integration surface: the split between a
server plugin, a TUI plugin route, and main-session contributions.

## Requirements

- Decide the split: server plugin (services/dispatch), TUI plugin route (the grid dashboard), and main-session contributions (`session.panel`, slots).
- Decide per panel which surface it uses, and what stays out of the main session.
- Decide how dispatch and detail flows reuse OpenCode's native session view and subagent sessions, with the receipt/lifecycle overlay dropped or minimized.
- Decide the OpenTUI/Solid upgrade path and the concrete component port.
- Decide what happens to the standalone app and the `pi`-probe fallback.

## Completion

- [ ] Surface split and per-panel placement recorded
- [ ] Native-session reuse and overlay fate decided
- [ ] Upgrade path and standalone-app fate decided
