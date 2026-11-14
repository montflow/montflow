# @montflow/profiles

Effect-first agent profile primitives for OpenCode — profile descriptors
(`make`, `rename`) and slug helpers (`isValidName`, `slugify`), the profile
store, the `mf-profiles` CLI, native agent registration, and the
`profile_execute` tool.

```typescript
import { Profiles } from '@montflow/profiles';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const profile = Profiles.make('code-reviewer', 'Reviews code for bugs');
  return yield* Profiles.rename(profile, 'security-auditor');
});
```

## Surfaces

- `/mf-profiles <subcommand> …` — the slash command in the OpenCode host.
- `mf-profiles <subcommand> …` — the same command as a binary.
- `profile_execute` — run a stored profile on a task in a native session.

## Payload

`packages/profiles/payload.json` declares the six spec-role profiles as
`profile` payload. `mf-profiles doctor` installs or repairs them under
`.agents/@montflow/profiles/`; `mf-profiles doctor --check` is report-only and
is what `mf-profiles:check` runs. A manifest-owned profile edited locally is
`stale` and repair overwrites it; an unlisted profile in the same store is user
data and is never deleted.

## Status

Private (`0.0.2`), source-only — no build step: a local-path OpenCode install
loads the `.ts` files directly. Run `bun install` from the repo root for
dependencies, then `turbo` `test` / `ts:check` cover this package like the rest.
