import * as Vitest from '@effect/vitest';
import { ModelChain } from '../../model-chain/index.js';
import { FallbackStore } from '../index.js';

const current: FallbackStore.Config = {
  chain: ModelChain.parse(['a/one']),
  triggers: ['auth'],
};

/** A store snapshot at the shape `resolve` produces. */
const snapshot = (overrides: Partial<FallbackStore.Snapshot>): FallbackStore.Snapshot => ({
  path: FallbackStore.file('/workspace'),
  present: true,
  source: 'store',
  config: FallbackStore.idle,
  issues: [],
  legacy: false,
  ...overrides,
});

Vitest.describe('FallbackStore.adopt runtime', () => {
  Vitest.it('keeps the current chain when the snapshot has issues', () => {
    const adopted = FallbackStore.adopt(
      current,
      snapshot({
        config: { chain: ModelChain.parse(['b/two']), triggers: ['quota'] },
        issues: [
          {
            field: 'chain',
            message: 'chain must not be empty; delete the file to disable',
            fix: 'run mf-model-fallback set --chain <provider/model>,...',
          },
        ],
      }),
    );

    Vitest.expect(adopted).toStrictEqual(current);
  });

  Vitest.it('replaces the current chain with a valid snapshot', () => {
    const config: FallbackStore.Config = {
      chain: ModelChain.parse(['b/two', 'c/three']),
      triggers: ['quota'],
    };

    const adopted = FallbackStore.adopt(current, snapshot({ config }));

    Vitest.expect(adopted).toStrictEqual(config);
  });

  Vitest.it('replaces the current chain when a clean snapshot resolves idle', () => {
    const adopted = FallbackStore.adopt(
      current,
      snapshot({ present: false, source: 'none', config: FallbackStore.idle }),
    );

    Vitest.expect(adopted).toStrictEqual(FallbackStore.idle);
  });
});
