# @montflow/pi-skills

Effect-first skill primitives for Pi extensions — the `Skill` Schema Class
(schema and type in one) plus slug helpers (`isValidName`, `slugify`) and the
`/mf-skills-tui` interactive menu.

Skills live in the regular `.agents/skills/<slug>/SKILL.md` location —
this package only inspects and modifies them.

## Surfaces

Three ways in, over the same engines:

```bash
mf-skills <subcommand> …      # the binary — scriptable, real exit codes
/mf-skills <subcommand> …     # the same command inside a Pi session
/mf-skills-tui                # the interactive menu, for humans
```

Subcommands: `doctor`, `list`, `show`, `verify [name]`, `create`, `modify`,
`delete`. `list` accepts `--status valid|invalid` to keep only skills whose
`SKILL.md` passes or fails verification. `verify` checks the mechanical
`SKILL.md` shape (`Skill.verifySkillFile`)
and exits non-zero when a skill fails. Store commands accept `--dir` to target a
workspace root other than the working directory.

The interactive menu browses, shows, manually or agentically creates/modifies,
deletes, and re-verifies skills.

Agentic create, modify, and transform dispatch a `@montflow/pi-runs` run
instead of running a child agent inline: the command names the run id and
unwinds, the run writes the `SKILL.md`, and its completion hook re-encodes the
result and reports the outcome. Follow or steer a live run with `/mf-runs`.

## Packaged skills

`doctor` installs two skills into the repo's `.agents/skills/` so an agent can
author skills without shelling out:

- `montflow-create-pi-skills`
- `montflow-modify-pi-skills`

Agentic runs inject these (`Skill.GENERATION_REQUIREMENTS` /
`MODIFICATION_REQUIREMENTS`). The package ships them under `skills/` and embeds
them for the compiled binary; regenerate the embed after editing them with
`bun run --cwd packages/pi-skills generate:payload`.

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

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
