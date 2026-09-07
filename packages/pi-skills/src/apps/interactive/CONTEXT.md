# Interactive app

Interactive `/mf-skills` command for the skills extension. App layer:
dialog-driven flows (browse, create manually or with an agent, show,
modify manually or with an agent, delete). Pure shapes, codecs, and slug helpers stay in `modules/`.

## Belongs here

- Slash-command arg parsing (`parseAction`, `USAGE`)
- Interactive Effect flows over injected ports (`browse`, `createManual`,
  `createAgentic`, `modifyManual`, `modifyAgentic`, `modifySkill`, `showSkill`, `deleteSkill`, `run`)
- Agentic runs execute behind the loading modal when injected (`LoadingFn` →
  `Loading.run`: spinner locks input, message names the runtime);
  without it the Effect runs directly after a pre-run notify
- Main menu renders through the injected `MenuFn` widget when available
  (`Menu.menuDialog`: plain `Skills` heading, `Batch.box` info panel with one
  generic dependency line — `✓ dependencies installed` or
  `✗ dependencies missing` — then options); without it a Pi-native
  `select` on the plain heading
- Requirements gate (`ensureRequirements`): before an agentic run, checklist
  the `Skill.*_REQUIREMENTS` (checked = will inject, toggle by picking;
  missing installs via the injected `SkillInstaller`). The check itself is
  the pure modules API — this flow only presents it and returns the skills
  to inject into `GenerateInput`/`ModifyInput`
- Create completion (`completeCreate`): notify names the saved file
  (`.agents/skills/<id>/SKILL.md`), then land on the new skill's detail
  menu (Show / Modify / Re-verify / Delete / Back, plus Transform)
- Detail menu (`detailFrom`, `detailOptions`): heading carries a `Batch.box`
  info panel with the mechanical verify status (`✓ verified` /
  `✗ not verified — N issues`, same verdict-first standard as the main
  menu) between the title and the options; `Re-verify` re-reads the file
  and notifies the issue list; `Transform to standard` appears near the
  bottom only while unverified and runs `transformAgentic` with the fixed
  `TRANSFORM_INSTRUCTION` (no free-text prompt)
- Model picker (`resolveModelOptions`, `pickModel`, `matchesFilter`):
  scoped models first, live catalogue fallback; the TUI uses the injected
  `ModelPickerFn` widget (`ModelPicker.modelPickerDialog` — search bar,
  current pinned first, `ctrl+g` keeps it), else the `pickModel` menu with
  a bottom `Pick another model…` entry driving the live search dialog when
  provided (`searchSelect` port), else input-then-select
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
- Full body editing — manual `modify` edits the description only; bodies stay in
  the editor or the agentic modify flow until a consumer needs more
