---
id: A
objective: Let consumers opt public skills out of sync via a target-workspace config file
status: pending
review: waived
review-reason: Fully gated single-package behavior change with tests; light rigor waives review
review-evidence: A001:0, A002:0, A003:0
gate: none
serial-reason: Each task consumes the prior task's output — config reading (A001) is the input to the sync/verify/doctor skip behavior (A002), which is what the tests (A003) exercise — so the phase is a stated serial chain, not fanned out.
---

# Phase A

## Notes

The phase lands `mf-skills sync` consumer-side exclusions in three sequential
steps. A001 reads and parses the optional
`.agents/@montflow/skills/config.json` from the target workspace and returns the
`exclude` set; unknown names in `exclude` warn, never error, and a missing config
file changes no behavior. A002 consumes that set: `sync` reports an excluded
skill as `skipped` / `excluded`, never writes it, leaves any existing local copy
byte-identical, and `sync --check`, `verify`, and `doctor --check` never treat it
as drift or missing. A003 adds tests covering an excluded skill, an unknown name
in `exclude`, and a missing config file.

The config is read from the **target workspace** root (the `--target`/`--dir`
value), never the montflow source checkout, so each consumer repo decides its
own exclusions without editing montflow. A montflow-side default file is a
recorded fallback alternative in `SPEC.md ## Creation`, not part of this phase.

Review is waived at `light` rigor: the phase is fully gated by task gates with
tests, so it ends at its gates without a review round.