# @montflow/pi-sessions

Effect-first agentic session primitives for Pi extensions — session descriptors
(`make`) and status transitions (`start`, `settle`).

```typescript
import { PiSessions } from '@montflow/pi-sessions';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const started = yield* PiSessions.start(PiSessions.make('session-1'));
  return PiSessions.settle(started, 'done');
});
```

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
