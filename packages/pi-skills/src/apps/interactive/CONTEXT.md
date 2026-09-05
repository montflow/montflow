# Interactive app

Interactive `/mf-skills` command for the skills extension. App layer:
dialog-driven flows (browse, create manually or with an agent, show,
modify, delete). Pure shapes, codecs, and slug helpers stay in `modules/`.

## Belongs here

- Slash-command arg parsing (`parseAction`, `USAGE`)
- Interactive Effect flows over injected ports (`browse`, `createManual`,
  `createAgentic`, `modifySkill`, `showSkill`, `deleteSkill`, `run`)
- Model picker (`resolveModelOptions`, `pickModel`, `matchesFilter`):
  scoped models first, live catalogue fallback; menu opens on the current
  model with a bottom `Pick another model…` entry driving the live search
  dialog when provided (`searchSelect` port), else input-then-select
- Command registration (`register`, `COMMAND_NAME`) on a structural Pi API

## Does not belong here

- Skill descriptor shapes and codecs — those live in `skill`
  (`../../modules/skill/`); this module constructs via decode
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`; this module defines a structural `InteractiveUi`
  port so any real `ctx.ui` is assignable without a hard dependency
- Persistence — the consuming extension injects a `SkillStore`
  (`list`/`save`/`delete` Effects); this package holds no filesystem code
- Agentic execution — the consuming extension injects a `SkillGenerator`;
  this module only collects the description and model choice
- Full body editing — `modify` edits the description only; bodies stay in
  the editor or agentic flows until a consumer needs more
