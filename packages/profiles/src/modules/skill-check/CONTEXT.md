# SkillCheck module

Verify the skills a profile declares. Delegates to the skills `verify`
engine — the same engine the `mf-skills` CLI runs — so a profile and the
skills CLI cannot disagree. Montflow skills (`montflow-*`) are held to the
full standard; generic and vendored skills only have to exist.

## Belongs here

- Declared-skill verification (`checkSkills`, `SkillVerdict`, `SkillCheck`)
- Store resolution for the pure verifier (`resolveSkills`, `Profiles.SkillResolution`)
- Engine-availability probing (`engineAvailable`) so a caller can tell a
  missing store (silent skip) from a missing engine (a surfaced warning)
- Lazy `@montflow/skills` loading, with a fallback warning
  (`SKILLS_ENGINE_WARNING`) when the skills runtime is unavailable, so
  verifying a profile never fails on a missing skills engine

## Does not belong here

- Profile shape verification and parsing — those live in
  [`../profile/`](../profile/CONTEXT.md)
- The skills engine itself — that lives in `@montflow/skills`
- Reading skill file contents — the skills engine owns them; this module only
  asks whether the store exists and lists its directory names
