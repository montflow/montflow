# @montflow/format

ANSI terminal text formatting with an Effect `Pipeable` API.

## Usage

```typescript
import { Format } from '@montflow/format';

const out = Format.make('start').pipe(Format.bold, Format.color('black'), Format.compile);
```

## API

- `Format.make(text)` — create a `Format`.
- `Format.bold`, `Format.color(input)` — pipeable transforms. `color` accepts a `Color` or plain label (`black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`).
- `Format.compile(format)` — render to string.
- `Format.stripAnsi(text)` — remove ANSI escapes.
