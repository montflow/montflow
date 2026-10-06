# Interactive app

Interactive `/mf-prompts` command for the prompts extension. Bare invocation
opens a persistent menu loop (browse → per-prompt actions → back); direct
args run once and exit. App layer: dialog-driven command flows. Pure shapes,
codecs, and the store service stay out (`modules/`, `services/`).

## Belongs here

- Slash-command arg parsing (`parseAction`, `USAGE`)
- Interactive Effect flows over an injected UI port (`menu`, `createPrompt`,
  `modifyPrompt`, `showPrompt`, `renderValues`, `executeFlow`, `run`)
- Per-prompt submenu: Show / Inspect / Fill & render / Execute / Modify /
  Delete. The re-entry effect is `Effect.suspend`ed so it waits for the
  current action instead of running ahead of it
- `fillInputs` — three rules straight from the variable schema: a defaulted
  variable is never asked for, a required one must be answered, an optional
  one may be blank (which is what makes an `{{#if}}` guard take `{{else}}`)
- `executeFlow` — doctor gate, then `fillInputs`, then the model, then the
  injected executor. A prompt that pins its own `model` never prompts for one
- Verify notification for the mechanical result (`notifyVerifyResult`)
- `doctor` install hook and execute gate via the shared `../doctor` module
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
- Inspect / execute planning and the table — `../../modules/prompt-execute/`
  owns the rules; this module only chooses the model and fills the dialogs
- Running an agent — the `PromptExecutor` port is injected by the extension
- Dialog ports and arg tokenizing (`InteractiveUi`, `FilterUi`,
  `ModelPickerFn`, `CANCELLED`, `tokenize`) — those live in
  `@montflow/pi-interactive` (`Dialogs`); this module re-exports them as
  aliases so the `/mf-*` commands stay structurally identical
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
- Persistence — the consuming extension injects a `PromptStore`
  (`list`/`save` Effects); this package holds no filesystem code
- Future store-backed search/filter — add it here only when a consumer
  needs it; keep the submenu's six options as the ceiling
