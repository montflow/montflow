# @montflow/skills

Effect-first skill primitives for OpenCode — the `Skill` Schema Class (schema
and type in one), the skill store, slug helpers (`isValidName`, `slugify`), the
`mf-skills` CLI, native skill registration, and the `skill_create` /
`skill_modify` dispatch tools.

Skills live in the regular `.agents/skills/<slug>/SKILL.md` location —
this package only inspects and modifies them.

## Surfaces

```bash
mf-skills <subcommand> …      # the binary — scriptable, real exit codes
/mf-skills <subcommand> …     # the same command in the OpenCode host
```

Subcommands: `doctor`, `list`, `show`, `verify [name]`, `create`, `modify`,
`delete`. `list` accepts `--status valid|invalid` to keep only skills whose
`SKILL.md` passes or fails verification. `verify` checks each `SKILL.md`
against its ownership class (`Skill.verifySkillFile`): montflow skills
(`montflow-*`) must satisfy the full standard, while generic and vendored
skills only have to exist. It exits non-zero when a skill fails. Store commands
accept `--dir` to target a workspace root other than the working directory.

Agentic create, modify, and transform dispatch a native OpenCode session
instead of running a child agent inline: the command names the session id and
unwinds, the session writes the `SKILL.md`, and a settle watcher re-encodes the
result and reports the outcome. Agents call them through `skill_create` /
`skill_modify`.

## Packaged skills

`doctor` installs two skills into the repo's `.agents/skills/` so an agent can
author skills without shelling out:

- `montflow-create-pi-skills`
- `montflow-modify-pi-skills`

Agentic sessions inject these (`Skill.GENERATION_REQUIREMENTS` /
`MODIFICATION_REQUIREMENTS`). The package ships them under `skills/` and embeds
them for the compiled binary; regenerate the embed after editing them with
`bun run --cwd packages/skills generate:payload`.

```typescript
import { Skill } from '@montflow/skills';
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

Boilerplate (`0.0.1`, private). Source-only — no build step: a local-path
OpenCode install loads the `.ts` files directly. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package like
the rest.
