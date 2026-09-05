# @montflow/pi-skills

Effect-first skill primitives for Pi extensions — the `Skill` Schema Class
(schema and type in one) plus slug helpers (`isValidName`, `slugify`) and an
interactive `/mf-skills` command.

Skills live in the regular `.agents/skills/<slug>/SKILL.md` location shared
with the `zi` extension — this package only inspects and modifies them.

```typescript
import { Skill } from '@montflow/pi-skills';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const skill = Skill.Skill.make({
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

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly, same as `pi/zi`. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
