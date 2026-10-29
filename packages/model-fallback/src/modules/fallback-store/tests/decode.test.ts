import * as Vitest from '@effect/vitest';
import { FallbackTrigger } from '../../fallback-trigger/index.js';
import { ModelChain } from '../../model-chain/index.js';
import { FallbackStore } from '../index.js';

Vitest.describe('FallbackStore.decode runtime', () => {
  Vitest.it('decodes a chain with explicit triggers', () => {
    const decoded = FallbackStore.decode({
      version: 1,
      chain: ['a/one', 'b/two#fast'],
      triggers: ['quota', 'timeout'],
    });

    Vitest.expect(decoded).toStrictEqual({
      config: {
        chain: ModelChain.parse(['a/one', 'b/two#fast']),
        triggers: ['quota', 'timeout'],
      },
      issues: [],
    });
  });

  Vitest.it('defaults the triggers when they are omitted', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one'] });

    Vitest.expect(decoded).toStrictEqual({
      config: { chain: ModelChain.parse(['a/one']), triggers: FallbackTrigger.defaults },
      issues: [],
    });
  });

  Vitest.it('accepts an explicit empty triggers array', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one'], triggers: [] });

    Vitest.expect(decoded).toStrictEqual({
      config: { chain: ModelChain.parse(['a/one']), triggers: [] },
      issues: [],
    });
  });

  Vitest.it('tolerates unknown top-level keys', () => {
    const decoded = FallbackStore.decode({
      chain: ['a/one'],
      future: { nested: true },
    });

    Vitest.expect(decoded.issues).toStrictEqual([]);
    Vitest.expect(decoded.config.chain).toStrictEqual(ModelChain.parse(['a/one']));
  });

  Vitest.it('names version when it is not the supported layout', () => {
    const decoded = FallbackStore.decode({ version: 2, chain: ['a/one'] });

    Vitest.expect(decoded.issues).toStrictEqual([
      { field: 'version', message: 'expected 1', fix: 'set version to 1 or delete the field' },
    ]);
    Vitest.expect(decoded.config.chain).toStrictEqual(ModelChain.parse(['a/one']));
  });

  Vitest.it('names $ when the document is not a JSON object', () => {
    const decoded = FallbackStore.decode([]);

    Vitest.expect(decoded).toStrictEqual({
      config: FallbackStore.idle,
      issues: [
        {
          field: '$',
          message: 'expected a JSON object',
          fix: 'rewrite the file with mf-model-fallback set',
        },
      ],
    });
  });

  Vitest.it('names chain when it is missing or not an array', () => {
    const missing = FallbackStore.decode({});
    const wrongType = FallbackStore.decode({ chain: 'a/one' });

    Vitest.expect(missing.issues).toStrictEqual([
      {
        field: 'chain',
        message: 'expected an array of provider/model labels',
        fix: 'run mf-model-fallback set --chain <provider/model>,...',
      },
    ]);
    Vitest.expect(wrongType.issues).toStrictEqual([
      {
        field: 'chain',
        message: 'expected an array of provider/model labels',
        fix: 'run mf-model-fallback set --chain <provider/model>,...',
      },
    ]);
  });

  Vitest.it('names chain when it is empty', () => {
    const decoded = FallbackStore.decode({ chain: [] });

    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'chain',
        message: 'chain must not be empty; delete the file to disable',
        fix: 'run mf-model-fallback set --chain <provider/model>,...',
      },
    ]);
    Vitest.expect(decoded.config).toStrictEqual(FallbackStore.idle);
  });

  Vitest.it('names chain[i] for an entry that is not a string', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one', 42] });

    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'chain[1]',
        message: 'expected a provider/model label',
        fix: 'use provider/model or provider/model#variant',
      },
    ]);
    Vitest.expect(decoded.config).toStrictEqual({
      chain: ModelChain.parse(['a/one']),
      triggers: FallbackTrigger.defaults,
    });
  });

  Vitest.it('names chain[i] for a label that is not a model reference', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one', 'no-slash'] });

    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'chain[1]',
        message: "invalid model reference 'no-slash'",
        fix: 'use provider/model or provider/model#variant',
      },
    ]);
    Vitest.expect(decoded.config.chain).toStrictEqual(ModelChain.parse(['a/one']));
  });

  Vitest.it('reports a duplicate model by index and keeps the first', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one', 'a/one#fast', 'b/two'] });

    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'chain[1]',
        message: "duplicate model 'a/one' in chain",
        fix: 'remove the repeat',
      },
    ]);
    Vitest.expect(decoded.config.chain).toStrictEqual(ModelChain.parse(['a/one', 'b/two']));
  });

  Vitest.it('falls back to idle when no chain entry decodes', () => {
    const decoded = FallbackStore.decode({ chain: ['no-slash'] });

    Vitest.expect(decoded.config).toStrictEqual(FallbackStore.idle);
    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'chain[0]',
        message: "invalid model reference 'no-slash'",
        fix: 'use provider/model or provider/model#variant',
      },
    ]);
  });

  Vitest.it('names triggers when it is not an array', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one'], triggers: 'quota' });

    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'triggers',
        message: 'expected an array of trigger names',
        fix: `use ${FallbackTrigger.all.join(', ')}`,
      },
    ]);
  });

  Vitest.it('names triggers[i] for an entry that is not a string', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one'], triggers: ['quota', 42] });

    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'triggers[1]',
        message: 'expected a trigger name',
        fix: `use ${FallbackTrigger.all.join(', ')}`,
      },
    ]);
  });

  Vitest.it('names triggers[i] for an unknown trigger', () => {
    const decoded = FallbackStore.decode({ chain: ['a/one'], triggers: ['nope'] });

    Vitest.expect(decoded.issues).toStrictEqual([
      {
        field: 'triggers[0]',
        message: "unknown trigger 'nope'",
        fix: `use one of ${FallbackTrigger.all.join(', ')}`,
      },
    ]);
    Vitest.expect(decoded.config.triggers).toStrictEqual([]);
  });

  Vitest.it('deduplicates repeated triggers', () => {
    const decoded = FallbackStore.decode({
      chain: ['a/one'],
      triggers: ['auth', 'auth', 'quota'],
    });

    Vitest.expect(decoded.issues).toStrictEqual([]);
    Vitest.expect(decoded.config.triggers).toStrictEqual(['auth', 'quota']);
  });
});

Vitest.describe('FallbackStore.plain runtime', () => {
  Vitest.it('replaces control characters so content cannot forge a line', () => {
    Vitest.expect(FallbackStore.plain('a\nb\tc')).toBe('a b c');
  });

  Vitest.it('leaves printable text alone', () => {
    Vitest.expect(FallbackStore.plain('provider/model#fast')).toBe('provider/model#fast');
  });
});
