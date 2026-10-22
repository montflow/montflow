# Skills service

Reads workspace skills (`.agents/skills/<name>/SKILL.md`) for the dashboard's
Skills panel: directory presence plus `SKILL.md` frontmatter parsing into
`SkillSummary` rows, and the row CRUD the grid page and workspace report use.

## Lazy extension loading

Static imports from `@montflow/skills` are type-only (erased at build). The
runtime resolves through `loadPiSkills()` — an Effect over a cached dynamic
`import()`, first called inside `fetchSkills` / `getSkills` / `toSkill`, never
at dashboard boot. Rejections classify into `ExtensionLoadError` (`network` vs
`missing` vs `unknown`) via `classifyLoadError`, so the toast tells the user
whether to retry, reinstall, or just retry.

## Belongs here

- `SkillSummary` rows plus `decodeSummary` and `parseFile` (pure, tested)
- `getSkills` (directory flag plus sorted rows, never fails) — the local list
  fallback; `fetchSkills` (load, then `SkillStore.list` through the loaded
  runtime) is the staged list behind the panel
- `deleteSkill` (store directory removal, id-guarded) plus `isValidSkillId`
  (pure, tested) — the delete keybind behind the detail
- `encodeSummary` plus `saveSkill` (pure/tested, id-guarded) — the manual save
  path
- `toSkill` / `fromSkill` bridges between dashboard rows and `@montflow/skills`
  `Skill` (validated one way, total the other)
- `panelInstalled` checks and `installHint` copy per panel
- `parseModelsStore` / `parseDefaultModel` — pure decoders for the retired
  Pi model files (`~/.pi/agent/models-store.json`,
  `~/.pi/agent/settings.json`); malformed input reads as empty, never as a
  failure. No production code calls them: only their file-reading wrappers
  `listModelLabels` / `listDefaultModel` and the unit tests in
  `tests/skill-write.test.ts` do. Those two wrappers read
  `~/.pi/agent/models-store.json` and `~/.pi/agent/settings.json` on each call,
  have no caller anywhere, and are marked `@deprecated` (kept for the tests).
  The live model label comes from `ModelPort.default()` in `grid-page.tsx`,
  not from this module.

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `grid-page.tsx` and
  `components/`
- Filtering — the `skill-filter` module owns query matching
- Verification, authoring, and dispatch — `/mf-skills` and the `skill_*` tools
  own them in `@montflow/skills`'s plugin faces; their sessions run through the
  native `SessionDispatchPort`, and the workspace only lists and renders what
  the store ends up with
