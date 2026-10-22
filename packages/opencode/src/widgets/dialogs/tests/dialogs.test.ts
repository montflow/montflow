import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { InteractionPort } from '../../../modules/ports/interaction/index.js';
import * as Dialogs from '../index.js';

const makeInteraction = () => {
  const calls: Array<string> = [];
  const interaction: InteractionPort = {
    select: (options) => {
      calls.push(`select:${options.title}`);
      return Effect.succeed(options.options[1]?.value);
    },
    confirm: () => Effect.succeed(undefined),
    prompt: (options) => {
      calls.push(`prompt:${options.title}`);
      return Effect.succeed('typed');
    },
    alert: () => Effect.void,
    notify: (options) => {
      calls.push(`notify:${options.variant ?? 'info'}`);
      return Effect.void;
    },
    attention: () => Effect.succeed({ ok: true, notification: true, sound: true }),
  };
  return { interaction, calls };
};

Vitest.describe('dialog widgets', () => {
  Vitest.it('select and searchSelect return the chosen option', async () => {
    const { interaction, calls } = makeInteraction();
    const dialogs = Dialogs.makeDialogs(interaction);
    Vitest.expect(await dialogs.select('Skills', ['a', 'b'])).toBe('b');
    Vitest.expect(await dialogs.searchSelect('Prompts', ['a', 'b'])).toBe('b');
    Vitest.expect(calls).toStrictEqual(['select:Skills', 'select:Prompts']);
  });

  Vitest.it('confirm degrades a cancelled dialog to false', async () => {
    const { interaction } = makeInteraction();
    const dialogs = Dialogs.makeDialogs(interaction);
    Vitest.expect(await dialogs.confirm('Delete?', 'gone')).toBe(false);
  });

  Vitest.it('input and notify map onto the interaction seam', async () => {
    const { interaction, calls } = makeInteraction();
    const dialogs = Dialogs.makeDialogs(interaction);
    Vitest.expect(await dialogs.input('Name')).toBe('typed');
    dialogs.notify('done', 'success');
    Vitest.expect(calls).toStrictEqual(['prompt:Name', 'notify:success']);
  });
});
