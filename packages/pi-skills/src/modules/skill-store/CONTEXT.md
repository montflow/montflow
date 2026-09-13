# Skill-store module

Async file-backed skill listing for hosts that lazy-load pi-skills.
One `Skill` instance equals one `SKILL.md` file under
`<root>/.agents/skills/` — decoded with the shared `Skill`
frontmatter grammar, so every host lists identically.

Singular name per the TypeScript modules skill (`skill-store` →
`SkillStore`).

## Belongs here

- `skillsDir(root)` plus `list(root)`: Effect-wrapped async reads,
  sorted by name, never failing (missing directory reads as empty,
  malformed files skip)
- File decoding over `Skill.parseSkillFile` / `Skill.decodeUnknown`
  (directory name is the id, frontmatter `name` falls back to it)

## Does not belong here

- The `Skill` schema, slug helpers, and verification — those live in
  the `skill` module
- The pi extension entry (`storeFor`, prompts, agent ports) — that
  lives in `extension.ts`, which keeps its FileSystem-service store
- Interactive flows (`create`, `modify`, `show`) — those live in the
  `interactive` app
