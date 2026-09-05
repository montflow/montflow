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
  injected generator/modifier ports, with a model picker
  (`resolveModelOptions`, `pickModel`) mirroring `pi-skills`

## Does not belong here

- Prompt descriptor shapes and rendering — those live in `prompts`
  (`../../modules/prompts/`); this module imports them as a namespace
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`; this module defines a structural `InteractiveUi`
  port so any real `ctx.ui` is assignable without a hard dependency
- Persistence — the consuming extension injects a `PromptStore`
  (`list`/`save` Effects); this package holds no filesystem code
- Future store-backed search/filter — add it here only when a consumer
  needs it; keep the menu's five options as the ceiling
