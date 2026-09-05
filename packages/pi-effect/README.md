# @montflow/pi-effect

Effect wrappers around Pi extension primitives — `ctx.ui` dialogs
(`notify`, `confirm`, `select`, `input`), `sendUserMessage`, and
Effect-based slash-command registration (`registerCommand`,
`runAndNotify`), and isolated child-agent runs (`AgentRun.runAgent` —
preprompt, prompt, postprompt in, reply text out, `AgentModelRuntime`
provided by the consumer).

```typescript
import { PiEffect } from '@montflow/pi-effect';

export default function (pi) {
  PiEffect.registerCommand(pi, 'hello', 'Say hello', (_args, ctx) =>
    PiEffect.notify(ctx.ui, 'Hello from an Effect!'),
  );
}
```

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly, same as `pi/zi`. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
