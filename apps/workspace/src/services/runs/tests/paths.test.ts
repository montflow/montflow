import { join } from 'node:path';
import { Run, Store } from '@montflow/pi-runs';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { isValidRunId, runsDir } from '../runs.services.module.js';

describe('runsDir', () => {
  it('mirrors the extension store segments so the paths cannot drift', () => {
    expect(runsDir('/repo')).toBe(join('/repo', ...Store.RUNS_SEGMENTS));
  });
});

describe('isValidRunId', () => {
  it('agrees with the pi-runs Run.Id schema', () => {
    const decodes = Schema.is(Run.Id);
    const samples = ['run-1', '', '../escape', 'BAD ID!', 'a'.repeat(65), 'a'.repeat(64)];
    for (const id of samples) expect(isValidRunId(id)).toBe(decodes(id));
  });
});
