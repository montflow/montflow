# SkillCheck module

Resolve the skills installed under a workspace's `.agents/skills/`, for the
pure prompt verifier to resolve a prompt's `skills:` names against. Existence
only — this package ships no skills engine, so it cannot judge a skill against
the montflow standard.

## Belongs here

- Store resolution (`resolveSkills`, `Prompts.SkillResolution`), returning
  undefined when no store exists so the verifier stays silent on a fresh clone

## Does not belong here

- Prompt shape verification and parsing — those live in
  [`../prompts/`](../prompts/CONTEXT.md)
- Skill-contract verification — that lives in `@montflow/pi-skills`
