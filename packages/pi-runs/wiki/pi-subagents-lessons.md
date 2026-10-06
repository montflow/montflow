# Pi-subagents lessons

Patterns borrowed from `pi-subagents` instead of inventing new ones. All four
are now realized in code, as noted per item.

## What to reuse

1. Settlement receipts — realized as `receipt.md` in the `receipt` module.
2. Session lease — realized as the per-run `.lock/` directory in `Store`.
3. Structured output — subrun results are pointers (`parent` frontmatter + a
   `subrunId` on the parent's event), not inline blobs.
4. Event-bus RPC — _not_ used; surfaces call the in-process `Runner` directly
   instead. Revisit only if a separate process needs to spawn/steer runs.

## What to skip

1. Skip worktree isolation for v1 — runs share the repo cwd.
2. Skip watchdog, fleet view, external CLI adapters — add after file persistence works.
3. Skip `workflowScript` sandbox — subruns are plain Effect calls with `parent` frontmatter.

Reference source lives at `.pi/git/github.com/nicobailon/pi-subagents/src/` — start with `runs/shared/`, `workflows/workflow-settlement.ts`, `runs/shared/session-lease.ts`.

## Mapping

| pi-subagents                            | pi-runs                                     |
| --------------------------------------- | ------------------------------------------- |
| async run + `runId`                     | `runs/<run-id>/` directory                  |
| `details.results[]` with stable `index` | flat `runs/<id>/` with `parent` frontmatter |
| file lifecycle artifacts                | `run.md` + `session.jsonl`                  |
| settlement receipt                      | `receipt.md`                                |
| `status` RPC                            | in-process `Runner.list` / read `run.md`    |

## See also

- [Architecture](./architecture.md) for the components that consume these patterns.
- [Session model](./session-model.md) for the flat subrun layout and settle order.
- [Storage](./storage.md) for file formats and the git-ignore rule.
- [Process and recovery](./process-and-recovery.md) for the in-process model.
- [Index](./index.md) for the page map.
