# @montflow/stlx 🎨

The fastest way to conditionally merge Tailwind CSS classes.

## Install

```bash
npm i @montflow/stlx
```

```bash
pnpm add @montflow/stlx
```

## Usage

```typescript
import { stlx } from "@montflow/stlx";

const classes = stlx("text-sm", "text-red-500", true && "font-bold", false && "hidden");
// Result: "text-sm text-red-500 font-bold"
```

Refer to [clxs](https://github.com/lukeed/clsx#readme) or [tailwind-merge](https://github.com/dcastil/tailwind-merge#readme) documentation for more.

## License

MIT © [montflow](https://montflow.dev)