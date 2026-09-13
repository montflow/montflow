# Interactive app

Interactive `/mf-prompts` command for the prompts extension. Bare invocation
opens a persistent menu loop (browse → per-prompt actions → back); direct
args run once and exit. App layer: dialog-driven command flows. Pure shapes,
codecs, and the store service stay out (`modules/`, `services/`).

## Belongs here

- Slash-command arg parsing (`parseAction`, `USAGE`)
- Interactive Effect flows over an injected UI port (`menu`, `createPrompt`,
  `modifyPrompt`, `showPrompt`, `renderValues`, `run`)
- Command registration as an Effect (`register`, `COMMAND_NAME`) via
  `PiEffect.registerCommandEffect`; cancellation maps to info severity
- Store access through the `PromptStore` service (`../../services/`),
  provided as `live` at invocation — no injected port object
- Manual vs agentic create/modify (`createAgentic`, `modifyAgentic`) over
  injected generator/modifier ports, with the shared model picker
  (`ModelOptions.resolveModelOptions/pickModel/pickAgenticModel` from
  `@montflow/pi-interactive`, re-exported here so tests keep passing)
- TUI ports (`FilterUi`, `ModelPickerFn` widget with the current session
  model pinned and single-keystroke keep, `CommandEnv`) wired in
  `register` via `searchFor`/`modelPickerFor` factories — same shape as
  `pi-skills`; the port types themselves are aliases of `Dialogs.*`

## Does not belong here

- Prompt descriptor shapes and rendering — those live in `prompts`
  (`../../modules/prompts/`); this module imports them as a namespace
- Dialog ports and arg tokenizing (`InteractiveUi`, `FilterUi`,
  `ModelPickerFn`, `CANCELLED`, `tokenize`) — those live in
  `@montflow/pi-interactive` (`Dialogs`); this module re-exports them as
  aliases so the `/mf-*` commands stay structurally identical
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
- Persistence — the consuming extension injects a `PromptStore`
  (`list`/`save` Effects); this package holds no filesystem code
- Future store-backed search/filter — add it here only when a consumer
  needs it; keep the menu's five options as the ceiling
