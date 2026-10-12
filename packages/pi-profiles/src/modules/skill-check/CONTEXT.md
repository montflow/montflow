# SkillCheck module

Verify the skills a profile declares. Delegates to the pi-skills `verify`
engine — the same engine the `mf-skills` CLI runs — so a profile and the
skills CLI cannot disagree. Montflow skills (`montflow-*`) are held to the
full standard; generic and vendored skills only have to exist.

## Belongs here

- Declared-skill verification (`checkSkills`, `SkillVerdict`, `SkillCheck`)
- Lazy `@montflow/pi-skills` loading, with a fallback warning
  (`SKILLS_ENGINE_WARNING`) when the skills runtime is unavailable, so
  verifying a profile never fails on a missing skills engine

## Does not belong here

- Profile shape verification and parsing — those live in
  [`../pi-profiles/`](../pi-profiles/CONTEXT.md)
- The skills engine itself — that lives in `@montflow/pi-skills`
- Filesystem reads for skill files — the skills engine owns them
