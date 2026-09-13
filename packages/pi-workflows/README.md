# @montflow/pi-workflows

Effect-first workflow primitives for Pi extensions — workflow descriptors
(`make`) holding an ordered pipeline of free-form steps (`makeStep`).

```typescript
import { PiWorkflows } from '@montflow/pi-workflows';

const workflow = PiWorkflows.make('ship-feature', 'Plan, implement, and verify a feature.');
```

## Status

Unfinished (`0.0.1`, private). Boilerplate only — the purpose of this
package is still open-ended (multi-step agentic workflows composed of
ordered steps, run from Pi extensions). The `wiki/` folder holds an
empty `index.md` until the shape settles.

Source-only — no build step: Pi loads the `.ts` files directly, same as
`pi/zi`. Run `bun install` from the repo root for dependencies, then
`turbo` `test` / `ts:check` cover this package like the rest.
