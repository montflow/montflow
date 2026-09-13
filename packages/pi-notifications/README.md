# @montflow/pi-notifications

Effect-first notification primitives for Pi extensions — notification
descriptors (`make`) and channel names (`isValidChannel`).

```typescript
import { PiNotifications } from '@montflow/pi-notifications';

const notification = PiNotifications.make({
  title: 'Build done',
  body: 'All checks passed.',
  channel: 'desktop',
});
```

## Status

Unfinished (`0.0.1`, private). Boilerplate only — the purpose of this
package is still open-ended (Pi communicating through notification
adapters: phone, push, computer notifications). The `wiki/` folder holds
an empty `index.md` until the shape settles.

Source-only — no build step: Pi loads the `.ts` files directly, same as
`pi/zi`. Run `bun install` from the repo root for dependencies, then
`turbo` `test` / `ts:check` cover this package like the rest.
