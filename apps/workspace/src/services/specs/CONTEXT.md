# Specs service

Read, verify, and author montflow specs
(`.agents/@montflow/specs/`) for the dashboard's Specs panel. Lazily
loads the `@montflow/pi-specs` runtime and reuses its pure
parse/verify/analyze functions — the service owns the file reading, the
row/detail shaping, and the author-run dispatch via `@montflow/pi-runs`.

## Belongs here

- `specsDir`, `specsInstalled`, `loadPiSpecs`
- `fetchSpecs` → list rows (name, lifecycle state, counts, issues)
- `loadSpec` → detail (metadata, per-phase tasks, issues)
- `rawSpecIds` (store snapshot) + `pickAuthoredSpec` /
  `finalAssistantText` (pure, tested)
- `activeSpecIds` — live run ids (`Runs.liveRunIds`) ∩ persisted
  `Run.spec`, feeding `Lifecycle.analyze({ active })` so a spec reads
  `in-progress` while a run works it and `pending` when idle
- `beginSpec` → gate on the runs extension, dispatch an author run with
  the authoring preprompt, return its run id; `SPEC_RUN_TOOLS` adds
  `bash` so the agent can run the mechanical checker
- `BeginFlowHooks` + `specAuthorCompletion` — reply-correlated
  fresh-spec pick, re-attachable via `Runs.resumeRun` after a restart
- Row/detail shapes: `SpecSummary`, `SpecDetail`, `SpecMeta`,
  `SpecPhaseRow`, `SpecTaskRow`, `SpecIssue`

## Does not belong here

- Verification rules — `@montflow/pi-specs` owns them
- The authoring preprompt — `@montflow/pi-specs` `Prompt` owns it
- Run engine lifecycle — `@montflow/pi-runs` owns it; this service only
  dispatches
- Panel/detail rendering — `components/specs-panel.tsx` and
  `components/spec-detail.tsx`
- Query caching — `services/query/`
