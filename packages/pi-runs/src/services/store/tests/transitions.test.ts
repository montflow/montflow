import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideEphemeral,
  provideStore,
} from './helpers.js';

Vitest.describe('Store run extras runtime', () => {
  Vitest.it.live('captures prompt and model at creation', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        const created = yield* store.create({
          id: 'run-1',
          name: 'Fix login',
          prompt: 'Fix the login flow.',
          model: 'anthropic/claude-sonnet-4-5',
        });
        Vitest.expect(created.prompt).toBe('Fix the login flow.');
        Vitest.expect(created.model).toBe('anthropic/claude-sonnet-4-5');
        const started = yield* store.start('run-1');
        Vitest.expect(started.prompt).toBe('Fix the login flow.');
        Vitest.expect(started.model).toBe('anthropic/claude-sonnet-4-5');
      }),
    ),
  );
});

Vitest.describe('Store ask/answer runtime', () => {
  Vitest.it.effect('parks running as awaiting-input and resumes on answer', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1', prompt: 'Do work.' });
        yield* store.start('run-1');
        const parked = yield* store.ask({ runId: 'run-1', question: 'Which env?' });
        Vitest.expect(parked.status).toBe('awaiting-input');
        const event = yield* store.answer({ runId: 'run-1', text: 'Production.' });
        Vitest.expect(event.role).toBe('user');
        Vitest.expect(event.text).toBe('Production.');
        const loaded = yield* store.load('run-1');
        Vitest.expect(loaded.run.status).toBe('running');
        Vitest.expect(loaded.events.length).toBe(1);
      }),
    ),
  );

  Vitest.it.effect('rejects ask from pending and answer from running', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        const askError = yield* store.ask({ runId: 'run-1', question: 'Q?' }).pipe(Effect.flip);
        Vitest.expect(askError).toBeInstanceOf(StoreError);
        yield* store.start('run-1');
        const answerError = yield* store.answer({ runId: 'run-1', text: 'A.' }).pipe(Effect.flip);
        Vitest.expect(answerError).toBeInstanceOf(StoreError);
      }),
    ),
  );
});

Vitest.describe('Store cancel runtime', () => {
  Vitest.it.effect('settles a running run as cancelled with a receipt', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        const receipt = yield* store.cancel('run-1');
        Vitest.expect(receipt.outcome).toBe('cancelled');
        const loaded = yield* store.load('run-1');
        Vitest.expect(loaded.run.status).toBe('cancelled');
        Vitest.expect(loaded.receipt?.outcome).toBe('cancelled');
      }),
    ),
  );

  Vitest.it.effect('rejects cancel from pending', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        const error = yield* store.cancel('run-1').pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
      }),
    ),
  );
});
