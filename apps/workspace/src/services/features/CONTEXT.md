# Features service

Read + verify montflow feature specs (`.agents/@montflow/features/`) for
the dashboard's read-only Features panel. Lazily loads the
`@montflow/pi-features` runtime and reuses its pure parse/verify/analyze
functions — the service owns only the file reading and the row/detail
shaping.

## Belongs here

- `featuresDir`, `featuresInstalled`, `loadPiFeatures`
- `fetchFeatures` → list rows (name, lifecycle state, counts, issues)
- `loadFeature` → detail (metadata, per-phase tasks, issues)
- Row/detail shapes: `FeatureSummary`, `FeatureDetail`, `FeatureMeta`,
  `FeaturePhaseRow`, `FeatureTaskRow`, `FeatureIssue`

## Does not belong here

- Verification rules — `@montflow/pi-features` owns them
- Panel/detail rendering — `components/features-panel.tsx` and
  `components/feature-detail.tsx`
- Query caching — `services/query/`
