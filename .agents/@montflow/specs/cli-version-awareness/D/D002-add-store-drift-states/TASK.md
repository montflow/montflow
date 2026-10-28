---
id: D002
name: add-store-drift-states
type: execution
originator: user
depends-on: D001
related-tasks:
status: complete
---

# Task D002: add-store-drift-states

## Type: execution

## Description

Distinguish "behind the checkout" from "locally edited" so an agent following the update guide never clobbers a hand-tuned skill.

## Requirements

- Three outcomes per skill: `current`, `stale` (source moved since the manifest commit), and `diverged` (target bytes differ from the manifest hash).
- `sync --check` reports the outcome per skill and exits 1 for `stale` or `diverged` and 0 for `current`; these codes stay distinct from the CLI-staleness exit code.
- A normal sync refuses to overwrite a `diverged` skill unless `--force` is passed; `stale` overwrites as it does today.
- A `diverged` report names the files that differ and the manifest commit the skill was installed from.
- A store with no manifest keeps today's byte-comparison behaviour and is reported as `unmanaged`, never `diverged`.
- Tests cover all four outcomes, `--force`, an unmanaged store, and the unchanged default sync path.

## Completion

- [x] Done.
