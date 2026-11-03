# Phase module

Owns the v2 **phase record**: `<spec>/<PHASE>/PHASE.md`.

- The phase id is the directory name; `PHASE.md` mirrors it.
- `status` is a conformity mirror of the phase's task statuses; the derived
  status is the only source of truth.
- `review: required|waived` records the appraiser's decision. A waived phase
  carries `review-reason` and `review-evidence`; a required phase carries
  neither.
- `gate: none|mechanical|subjective` declares the phase-level gate kind; the
  phase `GATES.md`, when present, must classify every stage with that kind.
- `phaseEvidence(snapshot)` derives the effective waiver set and the proven-gate
  set from `PHASE.md`, phase/task `GATES.md`, and `GATE-RESULTS.jsonl`. The
  lifecycle module consumes the two sets to derive locks; `PHASE.md` never
  stores a lock list.

`modules/structure` owns file presence and the directory allowlists; this module
owns the record fields and the evidence grammar.
