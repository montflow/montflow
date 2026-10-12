# Specs service

Read, verify, and author montflow specs
(`.agents/@montflow/specs/`) for the dashboard's Specs panel. Lazily
loads the `@montflow/pi-specs` runtime and reuses its pure
parse/verify/analyze functions — the service owns the file reading, the
row/detail shaping, and the author-session dispatch via `@montflow/pi-sessions`.

## Belongs here

- `specsDir`, `specsInstalled`, `loadPiSpecs`
- `fetchSpecs` → list rows (name, lifecycle state, counts, issues)
- `loadSpec` → detail (metadata, per-phase tasks, issues)
- `rawSpecIds` (store snapshot) + `pickAuthoredSpec` /
  `finalAssistantText` (pure, tested)
- `activeSpecIds` — live session ids (`Sessions.liveSessionIds`) ∩ persisted
  sessions with a `spec` set, feeding `Lifecycle.analyze({ active })` so a spec
  reads `in-progress` while a session works it and `pending` when idle
- `beginSpec` → gate on the sessions extension, dispatch an author session with
  the authoring preprompt, return its session id; `SPEC_SESSION_TOOLS` adds
  `bash` so the agent can run the mechanical checker
- `BeginFlowHooks` + `specAuthorCompletion` — reply-correlated
  fresh-spec pick, re-attachable via `Sessions.resumeSession` after a restart
- Row/detail shapes: `SpecSummary`, `SpecDetail`, `SpecMeta`,
  `SpecPhaseRow`, `SpecTaskRow`, `SpecIssue`

## Does not belong here

- Verification rules — `@montflow/pi-specs` owns them
- The authoring preprompt — `@montflow/pi-specs` `Prompt` owns it
- Session engine lifecycle — `@montflow/pi-sessions` owns it; this service only
  dispatches
- Panel/detail rendering — `components/specs-panel.tsx` and
  `components/spec-detail.tsx`
- Query caching — `services/query/`
