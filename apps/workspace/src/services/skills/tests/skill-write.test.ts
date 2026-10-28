import * as Vitest from '@effect/vitest';
import * as Skills from '../index.js';

const row: Skills.SkillSummary = {
  id: 'code-reviewer',
  name: 'code-reviewer',
  description: 'Reviews code for bugs.',
  groups: ['testing'],
  dependencies: ['executing-skills'],
  body: 'Assume the code is broken.',
};

Vitest.describe('Skills.encodeSummary runtime', () => {
  Vitest.it('round-trips through decodeSummary', () => {
    Vitest.expect(Skills.decodeSummary(row.id, Skills.encodeSummary(row))).toStrictEqual(row);
  });

  Vitest.it('drops empty groups and dependencies keys', () => {
    const encoded = Skills.encodeSummary({ ...row, groups: [], dependencies: [], body: '' });
    Vitest.expect(encoded).toBe(
      '---\nname: code-reviewer\ndescription: Reviews code for bugs.\n---\n',
    );
    Vitest.expect(Skills.decodeSummary(row.id, encoded)).toStrictEqual({
      ...row,
      groups: [],
      dependencies: [],
      body: '',
    });
  });
});
