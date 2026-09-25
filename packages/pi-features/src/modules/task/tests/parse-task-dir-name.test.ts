import * as Vitest from '@effect/vitest';
import * as Task from '../index.js';

Vitest.describe('Task.parseTaskDirName runtime', () => {
  Vitest.it('parses a single-letter phase directory', () => {
    Vitest.expect(Task.parseTaskDirName('A001-explore-auth')).toStrictEqual({
      id: 'A001',
      phase: 'A',
      name: 'explore-auth',
    });
  });

  Vitest.it('parses a double-letter phase directory', () => {
    Vitest.expect(Task.parseTaskDirName('AA012-migrate-data')).toStrictEqual({
      id: 'AA012',
      phase: 'AA',
      name: 'migrate-data',
    });
  });

  Vitest.it('rejects malformed directory names', () => {
    Vitest.expect(Task.parseTaskDirName('explore-auth')).toBeUndefined();
    Vitest.expect(Task.parseTaskDirName('a001-explore')).toBeUndefined();
    Vitest.expect(Task.parseTaskDirName('A1-explore')).toBeUndefined();
    Vitest.expect(Task.parseTaskDirName('A001-Explore')).toBeUndefined();
    Vitest.expect(Task.parseTaskDirName('A001')).toBeUndefined();
  });
});
