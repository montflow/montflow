# Pi-subagents lessons

Patterns borrowed from `pi-subagents` instead of inventing new ones. All four
are now realized in code, as noted per item.

## What to reuse

1. Settlement receipts — realized as `receipt.md` in the `receipt` module.
2. Session lease — realized as the per-session `.lock/` directory in `Store`.
3. Structured output — subsession results are pointers (`parent` frontmatter + a
   `subsessionId` on the parent's event), not inline blobs.
4. Event-bus RPC — _not_ used; surfaces call the in-process `SessionRunner` directly
   instead. Revisit only if a separate process needs to spawn/steer sessions.

## What to skip

1. Skip worktree isolation for v1 — sessions share the repo cwd.
2. Skip watchdog, fleet view, external CLI adapters — add after file persistence works.
3. Skip `workflowScript` sandbox — subsessions are plain Effect calls with `parent` frontmatter.

Reference source lives at `.pi/git/github.com/nicobailon/pi-subagents/src/` — start with `runs/shared/`, `workflows/workflow-settlement.ts`, `runs/shared/session-lease.ts`.

## Mapping

| pi-subagents                            | pi-sessions                                         |
| --------------------------------------- | --------------------------------------------------- |
| async session + `sessionId`             | `sessions/<session-id>/` directory                  |
| `details.results[]` with stable `index` | flat `sessions/<id>/` with `parent` frontmatter     |
| file lifecycle artifacts                | `session.md` + `session.jsonl`                      |
| settlement receipt                      | `receipt.md`                                        |
| `status` RPC                            | in-process `SessionRunner.list` / read `session.md` |

## See also

- [Architecture](./architecture.md) for the components that consume these patterns.
- [Session model](./session-model.md) for the flat subsession layout and settle order.
- [Storage](./storage.md) for file formats and the git-ignore rule.
- [Process and recovery](./process-and-recovery.md) for the in-process model.
- [Index](./index.md) for the page map.
