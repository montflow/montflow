# Doctor apps module

`mf-specs doctor` — install the spec skills an agent needs to
author and discover specs.

## Belongs here

- `runDoctor(root)` — checks `<root>/.agents/skills/<name>` for each name in
  `SPEC_SKILL_NAMES` (`montflow-create-pi-specs`,
  `montflow-find-pi-specs`) and copies the packaged skill in when missing;
  idempotent
- `runDoctorAt(startDir)` — resolves the nearest repo root, then runs `doctor`
- `resolveRepoRoot(startDir)` — nearest ancestor with a `.git` entry
- `SPEC_SKILL_NAMES` / `CREATE_SPEC_SKILL_NAME` / `FIND_SPECS_SKILL_NAME`
  / `installedSkillDir` — single source for the skill identities and install paths

## Rules

- Self-contained Effect: provides its own `NodeFileSystem` / `NodePath`, so the
  CLI gains no new layer requirement.
- Install source is the package payload at `<package-root>/skills/`, resolved
  from this module's location.
- Presence check only; never mutate an installed skill.

## Does not belong here

- Command parsing/output — `apps/cli`
- Spec verification — `modules/structure` / `modules/lifecycle`
