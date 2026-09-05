Find any skill on disk in 30 seconds.

All skills live under one root in your project. Learn the [skill concept](./skills.md) first if instruction packs vs storage is unclear.

## Root

```text
.agents/skills/
```

Created on first use. This is the same directory the `zi` extension reads — `/mf-skills` edits here, so both surfaces stay in sync.

## Layout

```text
.agents/skills/
  <slug>/SKILL.md                      <- one dir per skill
```

Example: `.agents/skills/adversarial-review/SKILL.md`.

Rules:

1. One directory per [skill](./skills.md), named by its slug.
2. Directory contains exactly one `SKILL.md`.
3. Only directories containing `SKILL.md` count — empty dirs are ignored.
4. Names sort alphabetically when listed.

File shape inside each `SKILL.md` is fixed — see [format](./format.md).

## Slug rules

1. Lowercase alphanumeric groups joined by single hyphens: `adversarial-review`, `effect-testing`.
2. Validate with `isValidName`; convert display names with `slugify` — both live in [package](./package.md).
3. Directory name is the skill id — frontmatter `name` is the display name and may differ.

## Create one manually

1. Create `.agents/skills/<slug>/SKILL.md`.
2. Write frontmatter (`name`, `description`) plus body instructions.
3. Save — it appears in `/mf-skills list` and the `zi` skills tab immediately.

## See also

- [Skills](./skills.md)
- [Format](./format.md)
- [Package](./package.md)
