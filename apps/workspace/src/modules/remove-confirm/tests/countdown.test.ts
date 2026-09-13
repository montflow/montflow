import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as RemoveConfirm from '../index.js';

Vitest.describe('RemoveConfirm pure helpers', () => {
  Vitest.it('ticks down floored at zero', () => {
    Vitest.expect(RemoveConfirm.tickCountdown(3)).toStrictEqual(2);
    Vitest.expect(RemoveConfirm.tickCountdown(1)).toStrictEqual(0);
    Vitest.expect(RemoveConfirm.tickCountdown(0)).toStrictEqual(0);
  });

  Vitest.it('gates confirm on zero remaining', () => {
    Vitest.expect(RemoveConfirm.canConfirmRemove(3)).toStrictEqual(false);
    Vitest.expect(RemoveConfirm.canConfirmRemove(1)).toStrictEqual(false);
    Vitest.expect(RemoveConfirm.canConfirmRemove(0)).toStrictEqual(true);
  });
});

Vitest.describe('RemoveConfirm focus', () => {
  Vitest.it('flips between cancel and delete', () => {
    Vitest.expect(RemoveConfirm.toggleRemoveFocus('cancel')).toStrictEqual('delete');
    Vitest.expect(RemoveConfirm.toggleRemoveFocus('delete')).toStrictEqual('cancel');
  });
});

Vitest.describe('RemoveConfirm.countdown', () => {
  Vitest.it('reports each ticked remaining down to zero', async () => {
    const seen: Array<number> = [];
    await RemoveConfirm.countdown(
      3,
      (ticked) => {
        seen.push(ticked);
      },
      Effect.void,
    ).pipe(Effect.runPromise);
    Vitest.expect(seen).toStrictEqual([2, 1, 0]);
  });

  Vitest.it('completes without ticking when already elapsed', async () => {
    const seen: Array<number> = [];
    await RemoveConfirm.countdown(
      0,
      (ticked) => {
        seen.push(ticked);
      },
      Effect.void,
    ).pipe(Effect.runPromise);
    Vitest.expect(seen).toStrictEqual([]);
  });
});
