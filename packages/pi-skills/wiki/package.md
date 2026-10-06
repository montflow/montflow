Import skill primitives into a Pi extension in 1 minute.

`@montflow/pi-skills` is the Effect-first home for [skill](./skills.md) descriptors, the `mf-skills` CLI (also `/mf-skills` inside Pi), the `/mf-skills-tui` interactive menu, and the `doctor` that installs the authoring skills.

## Use it

```typescript
import { Skill } from '@montflow/pi-skills';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const skill = yield* Skill.decodeUnknown({
    id: 'adversarial-review',
    name: 'adversarial-review',
    description: 'Hostile, bug-hunting code review.',
    skillId: 'a1b2c3d4e5f6a7b8',
    author: 'montflow',
    version: '1.0.0',
    license: 'MIT',
    groups: ['testing'],
    dependencies: [],
    body: 'Assume the code is broken. Prove otherwise.',
  });
  return Skill.encode(skill);
});
```

1. `Skill` — the Class: `id` (directory slug), `skillId` (16-hex frontmatter id),
   `name`, `description`, `author`, `version`, `license`, `groups`,
   `dependencies`, `body`.
2. `decodeUnknown` / `encode` — class codecs; `decodeSkillFile` /
   `encodeSkillFile` handle the whole `SKILL.md` file.
3. `isValidName(name)` — slug check. `slugify(raw)` — display name → slug.
4. `verifySkillFile(dirName, markdown)` — mechanical shape check (`mf-skills verify`).
5. `mf-skills` (binary) / `/mf-skills` (Pi) — `doctor`, `list`, `show`,
   `verify`, `create`, `modify`, `delete` over `.agents/skills/`.
6. `/mf-skills-tui` — the interactive menu: browse, list, manual or agentic
   create, show, modify, delete, re-verify.
   Agentic runs dispatch through `@montflow/pi-runs`; `doctor` installs the
   `montflow-create-pi-skills` / `montflow-modify-pi-skills` authoring skills.

Storage paths and file shape are documented separately — see [storage](./storage.md) and [format](./format.md).

## Status

Private `0.0.1`, source-only — Pi loads `.ts` directly. `bun install` from root, then `turbo test` / `ts:check` cover it.

## See also

- [Skills](./skills.md)
- [Storage](./storage.md)
- [Format](./format.md)
