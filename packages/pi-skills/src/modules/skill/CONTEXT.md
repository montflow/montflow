# Skill module

Schema-class data model for pi-skills. One `Skill` instance equals one
`SKILL.md` file under `.agents/skills/`.

Singular name per the TypeScript modules skill (`skill` → `Skill`).

Note: namespace + class share the name, so call-site reads `Skill.Skill`.
This stutter is the cost of matching the skill's folder convention and the
Effect `Schema.Class` identifier. Prefer a plural-folder rename if the
stutter becomes painful — that rename is one `mv` plus index edits.

## Belongs here

- `Id`, `Skill` class plus boundary helpers
- `decodeUnknown`, `encode` for `SKILL.md` frontmatter
- Slug helpers for skill names (`isValidName`, `slugify`)

## Does not belong here

- Interactive flows (`create`, `modify`, `show`) — those live in the
  `interactive` app (`../../apps/interactive/`)
- File IO and frontmatter parsing — the `extension.ts` store owns that
