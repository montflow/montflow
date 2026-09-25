import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { WorkspaceBridge } from '../../../services/index.js';
import { ConsoleBridge } from '../index.js';

Vitest.describe('ConsoleBridge runtime', () => {
  Vitest.it.effect('strips ANSI escapes and control characters from run-controlled text', () =>
    Effect.gen(function* () {
      const lines: Array<string> = [];
      const spy = Vitest.vi
        .spyOn(console, 'error')
        .mockImplementation((...args: Array<unknown>) => {
          lines.push(args.map(String).join(' '));
        });
      try {
        const bridge = yield* WorkspaceBridge;
        yield* bridge.toast('bad\u001b[31mred\u001b[0m\nforged', 'error');
        yield* bridge.notify('title\ninjected', 'body\u0007');
      } finally {
        spy.mockRestore();
      }
      Vitest.expect(lines).toStrictEqual([
        '[error] badred forged',
        '[notify] title injected: body',
      ]);
    }).pipe(Effect.provide(ConsoleBridge)),
  );
});
