import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiProfiles from '../index.js';

Vitest.describe('PiProfiles PROFILE.md roundtrip', () => {
  Vitest.it.effect('encodes then decodes a full profile', () =>
    Effect.gen(function* () {
      const profile = PiProfiles.Profile.make({
        name: 'code-reviewer',
        description: 'Reviews code for bugs',
        model: 'anthropic/claude-sonnet-4-5',
        skills: ['authoring-skills'],
        instructions: 'Be strict. Cite files.',
        checklist: ['Security issues flagged', 'Tests cover changes'],
      });
      const raw = PiProfiles.encodeProfileFile(profile);
      Vitest.expect(raw).toContain('name: code-reviewer');
      Vitest.expect(raw).toContain('## Instructions');
      Vitest.expect(raw).toContain('## Review Checklist');
      const decoded = yield* PiProfiles.decodeProfileFile('code-reviewer', raw);
      Vitest.expect(PiProfiles.encode(decoded)).toStrictEqual(PiProfiles.encode(profile));
    }),
  );

  Vitest.it.effect('falls back to the directory name and legacy Purpose section', () =>
    Effect.gen(function* () {
      const raw = [
        '---',
        'description: Legacy job',
        '---',
        '',
        '# Old Title',
        '',
        '## Purpose',
        '',
        'Does legacy work.',
        '',
        '## Instructions',
        '',
        'Follow the checklist.',
        '',
        '## Review Checklist',
        '',
        '- [ ] First item',
        '',
      ].join('\n');
      const decoded = yield* PiProfiles.decodeProfileFile('legacy-agent', raw);
      Vitest.expect(PiProfiles.encode(decoded)).toStrictEqual({
        name: 'legacy-agent',
        description: 'Legacy job',
        model: '',
        skills: [],
        instructions: 'Follow the checklist.',
        checklist: ['First item'],
      });
    }),
  );

  Vitest.it('derives display titles from slugs', () => {
    Vitest.expect(PiProfiles.titleFromName('code-reviewer')).toBe('Code Reviewer');
    Vitest.expect(PiProfiles.titleFromName('a')).toBe('A');
  });
});
