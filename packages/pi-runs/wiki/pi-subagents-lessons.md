# Pi-subagents lessons

Copy 4 proven patterns from `pi-subagents` instead of inventing new ones.

## What to reuse

1. Settlement receipts — `workflow-settlement.ts` + `workflow-receipt.ts` prove `done` / `failed` with child evidence. Copy the shape into `receipt.md`.
2. Session lease — `session-lease.ts` enforces one writer per session. Copy it for one writer per run directory.
3. Structured output — `structured-output.ts` keeps child results as plain JSON. Require `(runId, index)` keys on subrun results.
4. Event-bus RPC — `subagents:rpc:v1:request` / `reply:<id>` lets other extensions spawn and steer runs. Expose `spawn`, `status`, `stop` first.

## What to skip

1. Skip worktree isolation for v1 — runs share the repo cwd.
2. Skip watchdog, fleet view, external CLI adapters — add after file persistence works.
3. Skip `workflowScript` sandbox — subruns are plain Effect calls with `parent` frontmatter.

Reference source lives at `.pi/git/github.com/nicobailon/pi-subagents/src/` — start with `runs/shared/`, `workflows/workflow-settlement.ts`, `runs/shared/session-lease.ts`.

## Mapping

| pi-subagents                            | pi-runs                                   |
| --------------------------------------- | ----------------------------------------- |
| async run + `runId`                     | `runs/<run-id>/` directory                |
| `details.results[]` with stable `index` | `subruns/<id>/` with `parent` frontmatter |
| file lifecycle artifacts                | `run.md` + `session.jsonl`                |
| settlement receipt                      | `receipt.md`                              |
| `status` RPC                            | read `run.md` frontmatter                 |

## See also

- [Architecture](./architecture.md) for components that consume these patterns.
- [Session model](./session-model.md) for subrun depth cap and settle order.
- [Storage](./storage.md) for artifact commit rules.
- [Index](./index.md) for page map.
