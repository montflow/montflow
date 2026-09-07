import * as Vitest from '@effect/vitest';
import type { Component } from '@earendil-works/pi-tui';
import { Effect } from 'effect';
import * as Batch from '../index.js';
import * as Widget from '../../widget/index.js';

const stubTheme: Batch.Theme = {
  bg: (color, text) => `[${color}:${text}]`,
};

const stubChild = (lines: ReadonlyArray<string>): Component => ({
  render: () => [...lines],
  invalidate: () => {},
});

Vitest.describe('Batch.box', () => {
  Vitest.it.effect('wraps children in the gray default with padding', () =>
    Effect.gen(function* () {
      const batch = Batch.box(stubTheme, stubChild(['hi']));
      const lines = yield* Effect.sync(() => batch.pipe(Widget.compile).render(10));
      Vitest.expect(lines).toStrictEqual([
        '[selectedBg:          ]',
        '[selectedBg:  hi      ]',
        '[selectedBg:          ]',
      ]);
    }),
  );

  Vitest.it.effect('honors padding and background overrides', () =>
    Effect.gen(function* () {
      const batch = Batch.box(stubTheme, stubChild(['hi']), {
        paddingX: 1,
        paddingY: 0,
        background: (line) => `<${line}>`,
      });
      const lines = yield* Effect.sync(() => batch.pipe(Widget.compile).render(8));
      Vitest.expect(lines).toStrictEqual(['< hi     >']);
    }),
  );

  Vitest.it.effect('wraps a row of children', () =>
    Effect.gen(function* () {
      const batch = Batch.box(stubTheme, [stubChild(['a']), stubChild(['b'])]);
      const lines = yield* Effect.sync(() => batch.pipe(Widget.compile).render(10));
      Vitest.expect(lines?.[1]).toBe('[selectedBg:  a       ]');
      Vitest.expect(lines?.[2]).toBe('[selectedBg:  b       ]');
    }),
  );
});
