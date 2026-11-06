# Prompts service

Reads workspace prompts (`.agents/@montflow/prompts/*.json`) for the
dashboard's Prompts panel: rows decoded through the lazily loaded
`@montflow/prompts` runtime into `PromptSummary` rows, plus the CRUD surface the
grid page and workspace report use.

## Lazy extension loading

Static imports from `@montflow/prompts` are type-only (erased at build). The
runtime resolves through `loadPrompts()` — a cached dynamic `import()`, first
called inside `fetchPrompts` / `savePrompt`, never at dashboard boot. A broken
or missing extension cannot crash the TUI: the failing load carries a
displayable message and a retry re-imports (load failures clear the cache;
`resetExtensionCache` drops it in tests).

## Belongs here

- `PromptSummary` rows plus `fromPrompt` / `toPrompt` bridges between dashboard
  rows and `Prompts.Prompt`
- `fetchPrompts` (sorted rows through the loaded module, failing with a
  displayable message) — the list method behind the panel and the report
- `deletePrompt` (prompt file removal, slug-guarded) plus `isValidPromptId`
  (pure, tested) — the delete keybind behind the detail
- `savePrompt` (directory create plus `encode` through the loaded runtime,
  slug-guarded) — the manual save path
- `prompt-editor` (pure): eligible earlier controllers for a condition,
  `chooseCondition`, and `applyCondition`/`applyConditionByName`/
  `validateCondition`, which refuse an unknown or later controller, a
  non-discrete kind, and an unoffered value. The grid page's `c` keybind on an
  open prompt runs the dialog flow through `applyConditionByName`, so its
  refusal is what the user sees.
- `hiddenVariableNames` / `currentHiddenVariableNames`: hidden names through the
  loaded package predicate, so the detail view marks visibility without
  re-deriving a condition or changing a stored value
- `panelInstalled(r, 'prompts')` marks the store installed; the loader stages
  boot as `PromptsPhase` (`extension` | `prompts`)

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `grid-page.tsx` and
  `components/`
- Filtering — the `skill-filter` module owns query matching
- Authoring and execution — `/mf-prompts`, `prompt_execute`, and the
  `montflow-create-prompts` / `montflow-execute-prompts` skills own them
