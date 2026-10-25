# Specs service

Reads and verifies montflow specs (`.agents/@montflow/specs/`) for the
dashboard's Specs panel. Lazily loads the `@montflow/specs` runtime and reuses
its pure parse/verify/analyze functions — the service owns the file reading and
the row/detail shaping.

## Belongs here

- `specsDir`, `specsInstalled`, `loadSpecs`
- `fetchSpecs` → list rows (name, lifecycle state, counts, issues)
- `loadSpec` → detail (metadata, per-phase tasks, issues)
- `readReviewSeries` — the review rounds linked to a spec, read from
  `.agents/@montflow/reviews/<name>/`
- Row/detail shapes: `SpecSummary`, `SpecDetail`, `SpecMeta`, `SpecPhaseRow`,
  `SpecTaskRow`, `SpecIssue`

## Does not belong here

- Verification rules — `@montflow/specs` owns them
- Authoring and execution — `mf-specs` plus `subagent` sessions own them; the
  plugin faces no longer dispatch specs
- Panel/detail rendering — `components/specs-panel.tsx` and
  `components/spec-detail.tsx`
- Query caching — `services/query/`
