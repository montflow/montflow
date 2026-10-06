# Doctor apps module

`mf-features doctor` — install the feature-creation skill an agent needs to
author feature specs.

## Belongs here

- `runDoctor(root)` — checks `<root>/.agents/skills/montflow-create-pi-features`
  and copies the packaged skill in when missing; idempotent
- `runDoctorAt(startDir)` — resolves the nearest repo root, then runs `doctor`
- `resolveRepoRoot(startDir)` — nearest ancestor with a `.git` entry
- `CREATE_FEATURE_SKILL_NAME` / `installedSkillDir` — single source for the skill
  identity and install path

## Rules

- Self-contained Effect: provides its own `NodeFileSystem` / `NodePath`, so the
  CLI gains no new layer requirement.
- Install source is the package payload at `<package-root>/skills/`, resolved
  from this module's location.
- Presence check only; never mutate an installed skill.

## Does not belong here

- Command parsing/output — `apps/cli`
- Feature verification — `modules/structure` / `modules/lifecycle`
