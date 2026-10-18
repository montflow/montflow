# @montflow/workflows

Effect-first workflow primitives — workflow descriptors
(`make`) holding an ordered pipeline of free-form steps (`makeStep`).

```typescript
import { Workflow } from '@montflow/workflows';

const workflow = Workflow.make('ship-feature', 'Plan, implement, and verify a feature.');
```

## Status

Unfinished (`0.0.1`, private). Boilerplate only — the purpose of this
package is still open-ended (multi-step agentic workflows composed of
ordered steps). The `wiki/` folder holds an empty `index.md` until the
shape settles.

Source-only — no build step. Run `bun install` from the repo root for
dependencies, then `turbo` `test` / `ts:check` cover this package like the
rest.
