# Interactive app

Slash-command flows for `/mf-profiles`: browse, create (manually or
with an agent), show, modify (manually or with an agent), and delete
workspace profiles. Mirrors the `pi-prompts` interactive interface —
same menu loop, same model picker, same requirements gate, same
loading modal and TUI menu ports. Creation runs inject the
`authoring-profiles` workspace skill, modification runs inject
`modifying-profiles`, and format-fix runs inject both (installable from this repository
via the existing `skills` CLI); the gate injects them into agentic runs
so authors follow the profile standards.

## Belongs here

- Arg parsing (`parseAction`, `tokenize`) and usage text
- Manual flows (name + description dialogs)
- Agentic flows (description / instruction + model pick + injected skills)
- Requirements gate (`ensureRequirements`) over the injected skill store
- Browse / detail / main-menu loops (`run`)

## Does not belong here

- Profile shapes and `PROFILE.md` parsing — `modules/pi-profiles`
- File persistence — injected `ProfileStore` port (wired in `extension.ts`)
- Child-agent runs — injected `ProfileGenerator` / `ProfileModifier` ports
- Skill installation — injected `SkillInstaller` port
- TUI widgets — `@montflow/pi-interactive` (injected ports)
