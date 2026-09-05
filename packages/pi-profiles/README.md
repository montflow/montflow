# @montflow/pi-profiles

Effect-first agent profile primitives for Pi extensions — profile
descriptors (`make`, `rename`) and slug helpers (`isValidName`,
`slugify`).

```typescript
import { PiProfiles } from '@montflow/pi-profiles';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const profile = PiProfiles.make('code-reviewer', 'Reviews code for bugs');
  return yield* PiProfiles.rename(profile, 'security-auditor');
});
```

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly, same as `pi/zi`. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
