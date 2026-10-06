# Features service

Read, verify, and author montflow feature specs
(`.agents/@montflow/features/`) for the dashboard's Features panel. Lazily
loads the `@montflow/pi-features` runtime and reuses its pure
parse/verify/analyze functions — the service owns the file reading, the
row/detail shaping, and the author-run dispatch via `@montflow/pi-runs`.

## Belongs here

- `featuresDir`, `featuresInstalled`, `loadPiFeatures`
- `fetchFeatures` → list rows (name, lifecycle state, counts, issues)
- `loadFeature` → detail (metadata, per-phase tasks, issues)
- `rawFeatureIds` (store snapshot) + `pickAuthoredFeature` /
  `finalAssistantText` (pure, tested)
- `activeFeatureIds` — live run ids (`Runs.liveRunIds`) ∩ persisted
  `Run.feature`, feeding `Lifecycle.analyze({ active })` so a feature reads
  `in-progress` while a run works it and `pending` when idle
- `beginFeature` → gate on the runs extension, dispatch an author run with
  the authoring preprompt, return its run id; `FEATURE_RUN_TOOLS` adds
  `bash` so the agent can run the mechanical checker
- `BeginFlowHooks` + `featureAuthorCompletion` — reply-correlated
  fresh-feature pick, re-attachable via `Runs.resumeRun` after a restart
- Row/detail shapes: `FeatureSummary`, `FeatureDetail`, `FeatureMeta`,
  `FeaturePhaseRow`, `FeatureTaskRow`, `FeatureIssue`

## Does not belong here

- Verification rules — `@montflow/pi-features` owns them
- The authoring preprompt — `@montflow/pi-features` `Prompt` owns it
- Run engine lifecycle — `@montflow/pi-runs` owns it; this service only
  dispatches
- Panel/detail rendering — `components/features-panel.tsx` and
  `components/feature-detail.tsx`
- Query caching — `services/query/`
