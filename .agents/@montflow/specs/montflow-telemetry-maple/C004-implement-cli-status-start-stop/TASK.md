---
id: C004
name: implement-cli-status-start-stop
type: execution
originator: user
depends-on: B003
related-tasks: B003
status: pending
---

# Task C004: implement-cli-status-start-stop

## Type: execution

## Description

Implement `/mf-telemetry status|start|stop|restart` commands for maple.

## Requirements

- `status`: PID, port, data dir, refcount, reachability, starter flag.
- `start`: spawn maple if not running.
- `stop`: run `maple stop`, decrement refcount.
- `restart`: stop then start.

## Completion

- [ ] Commands implemented
- [ ] Output verified