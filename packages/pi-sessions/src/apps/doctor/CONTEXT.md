# Doctor apps module

`mf-sessions doctor` — install the dispatch skill an agent needs to drive sessions.

## Belongs here

- `doctor(root)` — checks `<root>/.agents/skills/montflow-dispatch-pi-sessions`
  and copies the packaged skill in when missing; idempotent
- `SESSION_SKILL_NAME` / `installedSkillDir` — single source for the skill identity
  and install path

## Rules

- Self-contained Effect: provides its own `NodeFileSystem` / `NodePath`, so
  `execute` gains no new layer requirement.
- Install source is the package payload at `<package-root>/skills/`, resolved
  from this module's location.
- Presence check only; never mutate an installed skill.

## Does not belong here

- Command parsing/output — `apps/commands`
- Session lifecycle — `services/session-runner`
