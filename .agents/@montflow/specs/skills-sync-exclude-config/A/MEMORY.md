# Memory

## Context

This phase lets `mf-skills sync` consumers opt public skills out via a
target-workspace config file. `sync` reads `.agents/@montflow/skills/config.json`
from the target workspace, skips excluded public skills (`skipped` / `excluded`),
and `sync --check`, `verify`, and `doctor --check` never treat them as drift or
missing. See `SPEC.md ## Description` for the problem, proposal, and acceptance
criteria; see `SPEC.md ## Creation` for the decided config-location and rigor
decisions.

## Progress

- pending (A001 → A002 → A003, serial)

## Open Questions

- None.

## Handoff

- See PHASE.md.

## Deviations

- None.

## Execution Brief

- Read: this phase `MEMORY.md`, the task `TASK.md`/`GATES.md`, and only the scoped source under `packages/skills/src/` the task names — the `sync` engine (`packages/skills/src/apps/sync/`), its CLI surface (`packages/skills/src/apps/cli/`), and the matching tests. No broad grep over generated payloads, lockfiles, or other tasks.
- Write scope: the task directory plus only the files its `TASK.md` names; record writes go to the task `MEMORY.md`.
- Gate: the task `GATES.md` owns the task's commands; run scoped checks, and the orchestrator runs each gate once.
- Record: keep each worker `MEMORY.md` at or under 80 lines; full logs go to `/tmp/<task-id>.log`.
- Review: review is waived at `light` rigor; batch any open finding into one fixer attempt and re-check rather than a review round.