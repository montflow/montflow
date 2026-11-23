import * as Vitest from '@effect/vitest';
import * as Extension from '../index.js';

const PLAYBOOK: Extension.Kind = { noun: 'playbook', lists: ['skills', 'principles', 'playbooks'] };
const PRINCIPLE: Extension.Kind = { noun: 'principle', lists: [] };

const FEATURE = [
  '---',
  'name: feature',
  'description: "Ship it."',
  'skills:',
  '  - a',
  'principles:',
  '  - p',
  '---',
  '',
  '# Feature',
  '',
  '1. Step.',
  '',
].join('\n');

const BUG_FIX = '---\nname: bug-fix\ndescription: "Fix it."\n---\n\n# Bug fix\n\n1. Step.\n';

const shipped: ReadonlyArray<Extension.RawEntry> = [
  { name: 'bug-fix', raw: BUG_FIX },
  { name: 'feature', raw: FEATURE },
];

Vitest.describe('Extension.provenance', () => {
  Vitest.it('names the source in one line', () => {
    Vitest.expect(Extension.provenance({ kind: 'shipped' }, 'feature')).toBe('source=shipped');
    Vitest.expect(Extension.provenance({ kind: 'extension', mode: 'adds' }, 'mine')).toBe(
      'source=extension',
    );
    Vitest.expect(Extension.provenance({ kind: 'extension', mode: 'replaces' }, 'bug-fix')).toBe(
      'source=extension replaces=bug-fix',
    );
    Vitest.expect(
      Extension.provenance({ kind: 'extension', mode: 'extends', target: 'feature' }, 'mine'),
    ).toBe('source=extension extends=feature');
  });
});

Vitest.describe('Extension.resolve', () => {
  Vitest.it('passes the shipped store through unchanged when there are no extensions', () => {
    Vitest.expect(Extension.resolve(shipped, [], PLAYBOOK)).toStrictEqual({
      entries: [
        { name: 'bug-fix', source: { kind: 'shipped' }, text: BUG_FIX },
        { name: 'feature', source: { kind: 'shipped' }, text: FEATURE },
      ],
      issues: [],
    });
  });

  Vitest.it('replaces a shipped entry of the same name and adds a new one, bytes unchanged', () => {
    const mine = '---\nname: bug-fix\ndescription: "Ours."\n---\n\n# Ours\n\n1. Do.\n';
    const added = '---\nname: zeta\ndescription: "New."\n---\n\n# Zeta\n\n1. Do.\n';
    const { entries, issues } = Extension.resolve(
      shipped,
      [
        { name: 'bug-fix', raw: mine },
        { name: 'zeta', raw: added },
      ],
      PLAYBOOK,
    );
    Vitest.expect(issues).toStrictEqual([]);
    Vitest.expect(entries).toStrictEqual([
      { name: 'bug-fix', source: { kind: 'extension', mode: 'replaces' }, text: mine },
      { name: 'feature', source: { kind: 'shipped' }, text: FEATURE },
      { name: 'zeta', source: { kind: 'extension', mode: 'adds' }, text: added },
    ]);
  });

  Vitest.it('extends: unions the lists and appends the body under Local additions', () => {
    const extension = [
      '---',
      'name: my-feature',
      'extends: feature',
      'skills:',
      '  - a',
      '  - b',
      'playbooks:',
      '  - local',
      '---',
      '',
      '- Also run the local check.',
      '',
    ].join('\n');
    const { entries } = Extension.resolve(
      shipped,
      [{ name: 'my-feature', raw: extension }],
      PLAYBOOK,
    );
    Vitest.expect(entries.find((entry) => entry.name === 'my-feature')).toStrictEqual({
      name: 'my-feature',
      source: { kind: 'extension', mode: 'extends', target: 'feature' },
      text: [
        '---',
        'name: my-feature',
        'description: "Ship it."',
        'skills:',
        '  - a',
        '  - b',
        'principles:',
        '  - p',
        'playbooks:',
        '  - local',
        '---',
        '',
        '# Feature',
        '',
        '1. Step.',
        '',
        '## Local additions',
        '',
        '- Also run the local check.',
        '',
      ].join('\n'),
    });
  });

  Vitest.it(
    'extends under the same name keeps the shipped one out and takes its own description',
    () => {
      const extension = '---\nname: feature\nextends: feature\ndescription: Ours.\n---\n';
      const { entries } = Extension.resolve(
        shipped,
        [{ name: 'feature', raw: extension }],
        PLAYBOOK,
      );
      Vitest.expect(entries.map((entry) => entry.name)).toStrictEqual(['bug-fix', 'feature']);
      Vitest.expect(entries[1]?.source).toStrictEqual({
        kind: 'extension',
        mode: 'extends',
        target: 'feature',
      });
      // No body of its own: no Local additions heading.
      Vitest.expect(entries[1]?.text).toBe(
        '---\nname: feature\ndescription: "Ours."\nskills:\n  - a\nprinciples:\n  - p\n---\n\n# Feature\n\n1. Step.\n',
      );
    },
  );

  Vitest.it('a principle has no lists to union; extra extension keys are dropped', () => {
    const principle = '---\nname: rule\ndescription: "Apply when x."\n---\n\n# Rule\n\nBody.\n';
    const extension = '---\nname: rule\nextends: rule\nskills:\n  - a\n---\n\nMore.\n';
    const { entries } = Extension.resolve(
      [{ name: 'rule', raw: principle }],
      [{ name: 'rule', raw: extension }],
      PRINCIPLE,
    );
    Vitest.expect(entries[0]?.text).toBe(
      '---\nname: rule\ndescription: "Apply when x."\n---\n\n# Rule\n\nBody.\n\n## Local additions\n\nMore.\n',
    );
  });

  Vitest.it('reports an extends that names no shipped entry and leaves it out', () => {
    const { entries, issues } = Extension.resolve(
      shipped,
      [
        { name: 'feature', raw: '---\nname: feature\nextends: ghost\n---\n\nMore.\n' },
        { name: 'listed', raw: '---\nname: listed\nextends:\n  - feature\n---\n' },
      ],
      PLAYBOOK,
    );
    Vitest.expect(entries.map((entry) => [entry.name, entry.source.kind])).toStrictEqual([
      ['bug-fix', 'shipped'],
      ['feature', 'shipped'],
    ]);
    Vitest.expect(issues).toStrictEqual([
      {
        name: 'feature',
        field: 'extends',
        message: "Must name a shipped playbook; 'ghost' is not one.",
      },
      { name: 'listed', field: 'extends', message: 'Must name one shipped playbook.' },
    ]);
  });

  Vitest.it('an extension with no readable frontmatter replaces, so verify sees its bytes', () => {
    const { entries } = Extension.resolve(
      shipped,
      [{ name: 'feature', raw: '# no frontmatter\n' }],
      PLAYBOOK,
    );
    Vitest.expect(entries[1]).toStrictEqual({
      name: 'feature',
      source: { kind: 'extension', mode: 'replaces' },
      text: '# no frontmatter\n',
    });
  });
});
