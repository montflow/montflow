# Skill-store module

Node-fs-backed skill IO for every host. One `Skill` instance equals one
`SKILL.md` file under `<root>/.agents/skills/` — decoded with the shared
`Skill.decodeSkillFile` grammar, so every host reads identically.

Singular name per the TypeScript modules skill (`skill-store` →
`SkillStore`).

## Belongs here

- `skillsDir(root)` — the `<root>/.agents/skills` directory
- `names(root)` / `list(root)` — Effect-wrapped async reads, sorted by name,
  never failing (missing directory reads as empty, malformed files skip)
- `readRaw(root, id)` — one raw `SKILL.md`, slug-guarded, failing on unknown ids
- `save(root, skill)` / `remove(root, id)` — writes and deletes, slug-guarded
  so a name can never escape `.agents/skills/`

## Does not belong here

- The `Skill` schema, slug helpers, codecs, and verification — those live in
  the `skill` module
- CLI rendering — `../../apps/cli/renderers.apps.module.ts`
- Interactive flows (`create`, `modify`, `show`) — those live in the
  `interactive` app
