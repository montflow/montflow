# Doctor apps module

`mf-runs doctor` — install the dispatch skill an agent needs to drive runs.

## Belongs here

- `runDoctor(root)` — checks `<root>/.agents/skills/montflow-dispatch-pi-runs`
  and copies the packaged skill in when missing; idempotent
- `RUN_SKILL_NAME` / `installedSkillDir` — single source for the skill identity
  and install path

## Rules

- Self-contained Effect: provides its own `NodeFileSystem` / `NodePath`, so
  `execute` gains no new layer requirement.
- Install source is the package payload at `<package-root>/skills/`, resolved
  from this module's location.
- Presence check only; never mutate an installed skill.

## Does not belong here

- Command parsing/output — `apps/commands`
- Run lifecycle — `services/runner`
