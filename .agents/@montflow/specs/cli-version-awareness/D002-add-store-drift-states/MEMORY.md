# Memory

## Context

D002 distinguishes "behind the checkout" from "locally edited" so a sync never
clobbers a hand-tuned skill.

Design:

- Each `SyncSkillStatus` carries `drift` (`current`/`stale`/`diverged`/
  `unmanaged`), `manifestCommit`, and `differingFiles`.
- `current`: target hash equals the manifest entry, source hash matches, and
  the manifest commit (when known) matches the source commit.
- `stale`: source hash or commit moved since the manifest.
- `diverged`: target hash differs from the manifest entry; `differingFiles`
  compares per-file hashes and the report names the manifest commit.
- A store without a manifest keeps the previous byte-comparison behaviour and
  is `unmanaged`, never `diverged`.
- A normal sync refuses (`outcome: 'refused'`, no writes, exit 1 via the CLI)
  when a skill is diverged and `--force` is absent. `--check` reports every
  outcome and exits 1 for stale/diverged, 0 for current.
- CLI gained `--force`; slash sync parses it too. The report adds a `Refused`
  group and a `— <drift>` note on check lines; a diverged note names the files
  and manifest commit.

## Progress

- complete: drift computation, refusal, renderer notes, `--force` on both front
  ends, and tests for all four outcomes plus refusal/force/unmanaged.
- Verified: skills suite 433 passing; lint/typecheck/format green.

## Open Questions

- None.

## Handoff

- D003 documents `sync --check`, `--force`, and the four outcomes in the guide.

## Deviations

- The drifted verdict counts stale/diverged skills even when no bytes would
  change (a moved source commit), which is the point of separating the two.
