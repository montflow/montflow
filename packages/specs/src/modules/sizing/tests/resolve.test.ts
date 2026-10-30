import * as Vitest from '@effect/vitest';
import * as Sizing from '../index.js';

const repo: Sizing.SizingConfig = {
  sizes: {
    tiny: { model: 'fixture/repo-model', effort: 'low' },
    small: { model: 'fixture/repo-model', effort: 'low' },
  },
};

const spec: Sizing.SizingConfig = {
  sizes: {
    tiny: { model: 'fixture/spec-model', effort: 'medium' },
    small: { model: 'fixture/spec-model' },
  },
  phases: {
    A: { sizes: { tiny: { model: 'fixture/phase-model', effort: 'high' } } },
  },
};

Vitest.describe('Sizing.targetOf runtime', () => {
  Vitest.it('appends the effort only when one is defined', () => {
    Vitest.expect(Sizing.targetOf({ model: 'provider/model' })).toBe('provider/model');
    Vitest.expect(Sizing.targetOf({ model: 'provider/model', effort: 'high' })).toBe(
      'provider/model#high',
    );
  });
});

Vitest.describe('Sizing.merge runtime', () => {
  Vitest.it('merges repo, spec, and phase by size', () => {
    Vitest.expect(Sizing.merge({ repo, spec, phase: 'A' })).toStrictEqual({
      tiny: { entry: { model: 'fixture/phase-model', effort: 'high' }, layer: 'phase' },
      small: { entry: { model: 'fixture/spec-model' }, layer: 'spec' },
    });
  });

  Vitest.it('reports the layer that supplied the repo entry', () => {
    Vitest.expect(Sizing.merge({ repo })).toStrictEqual({
      tiny: { entry: { model: 'fixture/repo-model', effort: 'low' }, layer: 'repo' },
      small: { entry: { model: 'fixture/repo-model', effort: 'low' }, layer: 'repo' },
    });
  });
});

Vitest.describe('Sizing.resolve runtime', () => {
  Vitest.it('repo < spec < phase: the most specific layer wins', () => {
    Vitest.expect(Sizing.resolve({ repo, spec, phase: 'A' }, 'tiny')).toStrictEqual({
      size: 'tiny',
      target: 'fixture/phase-model#high',
      source: 'phase',
      entry: { model: 'fixture/phase-model', effort: 'high' },
    });
    Vitest.expect(Sizing.resolve({ repo, spec }, 'tiny')).toStrictEqual({
      size: 'tiny',
      target: 'fixture/spec-model#medium',
      source: 'spec',
      entry: { model: 'fixture/spec-model', effort: 'medium' },
    });
    Vitest.expect(Sizing.resolve({ repo }, 'tiny')).toStrictEqual({
      size: 'tiny',
      target: 'fixture/repo-model#low',
      source: 'repo',
      entry: { model: 'fixture/repo-model', effort: 'low' },
    });
  });

  Vitest.it('replaces the whole entry instead of inheriting fields', () => {
    Vitest.expect(Sizing.resolve({ repo, spec }, 'small')).toStrictEqual({
      size: 'small',
      target: 'fixture/spec-model',
      source: 'spec',
      entry: { model: 'fixture/spec-model' },
    });
  });

  Vitest.it('returns inherit when no layer defines the size', () => {
    Vitest.expect(Sizing.resolve({ repo, spec, phase: 'A' }, 'large')).toStrictEqual({
      size: 'large',
      target: 'inherit',
    });
  });

  Vitest.it('ignores a phase override when no phase is supplied', () => {
    Vitest.expect(Sizing.resolve({ repo, spec }, 'tiny').source).toBe('spec');
  });
});
