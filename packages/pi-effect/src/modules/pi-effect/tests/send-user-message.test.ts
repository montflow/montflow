import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import * as PiEffect from '../index.js';

Vitest.describe('PiEffect.sendUserMessage runtime', () => {
  Vitest.it.effect('queues the content through the Pi API', () =>
    Effect.gen(function* () {
      const seen: Array<Parameters<ExtensionAPI['sendUserMessage']>> = [];
      const api: Pick<ExtensionAPI, 'sendUserMessage'> = {
        sendUserMessage: (...args) => {
          seen.push(args);
        },
      };
      yield* PiEffect.sendUserMessage(api, 'hello');
      Vitest.expect(seen).toStrictEqual([['hello']]);
    }),
  );
});
