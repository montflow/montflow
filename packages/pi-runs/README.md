# @montflow/pi-runs

Effect-first agentic run primitives for Pi extensions — run descriptors
(`make`) and status transitions (`start`, `settle`).

```typescript
import { PiRuns } from '@montflow/pi-runs';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const started = yield* PiRuns.start(PiRuns.make('run-1'));
  return PiRuns.settle(started, 'done');
});
```

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly, same as `pi/zi`. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
