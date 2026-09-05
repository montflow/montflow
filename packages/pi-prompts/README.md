# @montflow/pi-prompts

Effect-first prompt template primitives for Pi extensions — the `Prompt`
Schema Class (schema and type in one) plus variable rendering
(`renderToString`, `usesVariable`, `renderPrompt`), an interactive
`/pi-prompts` command, and a headless `/pi-prompts-cli` command.

```typescript
import { Prompts } from '@montflow/pi-prompts';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const prompt = Prompts.make('audit', 'Audit {{files}} for {{focus}}');
  return yield* Prompts.renderPrompt(prompt, { files: 'src/', focus: 'bugs' });
});
```

## Status

Boilerplate (`0.0.1`, private). Source-only — no build step: Pi loads the
`.ts` files directly, same as `pi/zi`. Run `bun install` from the repo
root for dependencies, then `turbo` `test` / `ts:check` cover this package
like the rest.
