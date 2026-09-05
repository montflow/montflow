Import skill primitives into a Pi extension in 1 minute.

`@montflow/pi-skills` is the Effect-first home for [skill](./skills.md) descriptors and the interactive `/mf-skills` command. Pi business logic (router, web UI) stays in `@montflow/zi`.

## What lives here vs in zi

| Here (`pi-skills`)            | In zi (`pi/zi/`)                     |
| ----------------------------- | ------------------------------------ |
| `Skill` Schema Class + codecs | `skill-run.ts` agentic authoring     |
| `isValidName`, `slugify`      | `router.ts` skills listing endpoints |
| `/mf-skills` command flows    | `useSkills.ts` web UI hooks          |

## Use it

```typescript
import { Skill } from '@montflow/pi-skills';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const skill = yield* Skill.decodeUnknown({
    id: 'adversarial-review',
    name: 'adversarial-review',
    description: 'Hostile, bug-hunting code review.',
    groups: ['testing'],
    dependencies: [],
    body: 'Assume the code is broken. Prove otherwise.',
  });
  return Skill.encode(skill);
});
```

1. `Skill` — the Class: `id`, `name`, `description`, `groups`, `dependencies`, `body`.
2. `decodeUnknown` / `encode` — boundary codecs for `SKILL.md` frontmatter.
3. `isValidName(name)` — slug check.
4. `slugify(raw)` — display name → slug.
5. `/mf-skills` — `browse`, `list`, manual or agentic `create`, `show`, `modify`, `delete` over `.agents/skills/`.
   Agentic runs go through the generic `AgentRun` runner in `@montflow/pi-effect` — preprompt, description, postprompt in, reply text out.

Storage paths and file shape are documented separately — see [storage](./storage.md) and [format](./format.md).

## Status

Private `0.0.1`, source-only — Pi loads `.ts` directly, same as `pi/zi`. `bun install` from root, then `turbo test` / `ts:check` cover it.

## See also

- [Skills](./skills.md)
- [Storage](./storage.md)
- [Format](./format.md)
