# Skill module

Schema-class data model for pi-skills. One `Skill` instance equals one
`SKILL.md` file under `.agents/skills/`.

Singular name per the TypeScript modules skill (`skill` → `Skill`).

Note: namespace + class share the name, so call-site reads `Skill.Skill`.
This stutter is the cost of matching the skill's folder convention and the
Effect `Schema.Class` identifier.

## Belongs here

- `Id`, `Skill` class plus boundary helpers. `id` is the directory slug;
  `skillId` is the immutable 16-hex frontmatter `id` — two different things.
- `decodeUnknown`, `encode` for the class, plus `decodeSkillFile` /
  `encodeSkillFile` for the `SKILL.md` file (frontmatter + body)
- Frontmatter parser (`parseSkillFile`, `fieldString`, `fieldStrings`) — one
  grammar shared by the store and the verifier
- Mechanical verification (`verifySkillFile`, `verifyInfoLine`): required
  frontmatter (`name`, `description`, `id`, `author`, `version`) plus the
  `# When To Use` / `# Pipeline` / `# Reference` body shape; style stays a
  review concern
- Slug helpers for skill names (`isValidName`, `slugify`)
- New-skill defaults (`generateSkillId`, `DEFAULT_AUTHOR`, `DEFAULT_VERSION`,
  `DEFAULT_LICENSE`) — the manual/CLI create paths fill what the caller omits
- Requirement verification for agentic runs (`GENERATION_REQUIREMENTS`,
  `MODIFICATION_REQUIREMENTS`, `TRANSFORM_REQUIREMENTS`, `checkRequirements`,
  `missingRequirements`, `findInstalled`, `resolveInjection`,
  `formatInjectedSkills`) — pure, adapter-agnostic. They name the shipped
  skills: `montflow-create-pi-skills` / `montflow-modify-pi-skills`.

## Does not belong here

- Interactive flows (`create`, `modify`, `show`) — those live in the
  `interactive` app (`../../apps/interactive/`)
- The CLI engines and renderers — those live in `../../apps/cli/`
- File IO — that lives in `../../modules/skill-store/`
