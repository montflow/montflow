import * as Vitest from '@effect/vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DELTA_TYPES, TYPES } from '../index.js';

/** The installed host event manifest: every event type is a `type:` literal. */
const manifest = (): string => {
  const entry = fileURLToPath(import.meta.resolve('@opencode/client'));
  return readFileSync(join(dirname(entry), 'generated', 'types.d.ts'), 'utf8');
};

Vitest.describe('Event drift runtime', () => {
  Vitest.it('keeps every allowlisted type present in the host event manifest', () => {
    const source = manifest();
    const missing = [...TYPES, ...DELTA_TYPES].filter(
      (type) => !source.includes(`type: "${type}"`),
    );
    Vitest.expect(missing).toStrictEqual([]);
  });
});
