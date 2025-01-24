# @montflow/loop 🔁

A precise, lightweight, and high-performance utility library for managing loops and timing in the browser.

## Install

`npm install @montflow/loop`

## Features

- 🎯 **Precise** . We use [`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) by default as the update engine.
- 🎈 **Lightweight**. About ~2.2 KB if you use entire module.
- 🌳 **Treeshakable**. Ship only what you use.
- ⏳ **Interval**. Interval timer creation.
- ⏲ **Timeout**. Timeout timer creation.

## Usage

```typescript
import { Loop } from "@montflow/loop";

const loop = Loop();

const physics = loop.add(
  dt => { /** physics related processes */ },
  { priority: 0 } // Runs 1st
);

const animation = loop.add(
  dt => { /** animation related processes */ },
  { priority: 1 } // Runs 2nd
);

const logic = loop.add(
  dt => { /** logic related processes */ },
  { priority: 2 } // runs 3rd
);

/** Loopable can be dismissed */
animation.stop();

/** Program ends */
loop.clear();
```

## Performance

Built with `requestAnimationFrame`, `@montflow/loop` is optimized for modern browsers to ensure precise and efficient timing. By only running active callbacks, it avoids unnecessary computation, making it faster than many polling-based libraries.


## Examples

### Simple game loop

```typescript
import { Loop } from "@montflow/loop";

const loop = Loop();

const player = {
  position: { x: 0, y: 0 },
  velocity: { i: 0, j: 0 },
  isDead: false,
};

loop.add((dt, self) => {
  if (player.isDead) {
    self.stop();
    return;
  }

  player.position.x += player.velocity.i * dt;
  player.position.y += player.velocity.j * dt;
});
```
## License

MIT © [montflow](https://montflow.dev)