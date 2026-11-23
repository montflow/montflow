import * as Vitest from '@effect/vitest';
import { check, MAX_LINES, render, SECTIONS, template, type Report } from '../index.js';

const FENCE = '```';

const HEADINGS = [
  'Summary',
  'What changed',
  'Decisions',
  'Proof',
  'Blast Radius',
  'Verification',
  'Follow-ups',
];

const CONTENT: ReadonlyMap<string, string> = new Map([
  [
    'Summary',
    'Give agent-written PR bodies one standard a reviewer reads at a glance. A pure checker names what is missing before the worker publishes.',
  ],
  [
    'What changed',
    '- `pr.module.ts`: the section standard, `check`, `template` and `render`.\n- `scripts/pr-check.ts`: reads a body on stdin and exits 1 on errors.',
  ],
  ['Decisions', '- A dependency-free module over an Effect service, so CI runs it with bare bun.'],
  ['Proof', '![pr-check output](https://example.com/pr-check.png)'],
  ['Blast Radius', 'New files only; nothing imports them yet. Revert the commit to back it out.'],
  ['Verification', `${FENCE}sh\nbun run --cwd packages/mf-mode test -- src/modules/pr\n${FENCE}`],
  ['Follow-ups', '- Wire the checker into the publish step, in the next PR.'],
]);

const compose = (sections: ReadonlyArray<readonly [string, string]>): string =>
  `${sections.map(([heading, content]) => `## ${heading}\n${content}`).join('\n\n')}\n`;

const pick = (headings: ReadonlyArray<string>): string =>
  compose(headings.map((heading) => [heading, CONTENT.get(heading) ?? '']));

const CLEAN = pick(HEADINGS);

const replacing = (target: string, content: string): string =>
  compose(
    HEADINGS.map((heading) => [
      heading,
      heading === target ? content : (CONTENT.get(heading) ?? ''),
    ]),
  );

const without = (target: string): string => pick(HEADINGS.filter((heading) => heading !== target));

const headingsOf = (body: string): ReadonlyArray<string> =>
  [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1] ?? '');

const rulesOf = (report: Report, severity: 'error' | 'hint'): ReadonlyArray<string> =>
  report.findings
    .filter((entry) => entry.severity === severity)
    .map((entry) => `${entry.rule}:${entry.section ?? '-'}`)
    .toSorted();

Vitest.describe('check', () => {
  Vitest.it('passes a clean, realistic body with no findings', () => {
    const report = check({ body: CLEAN, title: 'feat(mf-mode): add a pr body checker' });
    Vitest.expect(report.findings).toStrictEqual([]);
    Vitest.expect(report.errors).toBe(0);
    Vitest.expect(report.hints).toBe(0);
  });

  Vitest.it('counts non-blank lines outside HTML comments', () => {
    const report = check({ body: '## Summary\n\nOne line.\n<!-- hidden\nstill hidden -->\n' });
    Vitest.expect(report.lines).toBe(2);
  });

  Vitest.describe('template', () => {
    Vitest.it('lists every standard section in order and marks the optional ones', () => {
      const body = template();
      Vitest.expect(headingsOf(body)).toStrictEqual(HEADINGS);
      for (const section of SECTIONS) {
        const comment = body.split(`## ${section.heading}\n`)[1]?.split('\n')[0] ?? '';
        Vitest.expect(comment).toContain(section.purpose);
        Vitest.expect(comment.includes('(optional, drop if empty)')).toBe(!section.required);
      }
      Vitest.expect(body.endsWith('-->\n')).toBe(true);
    });

    Vitest.it(
      'blocks the unfilled template on its placeholders and empty required sections',
      () => {
        const errors = rulesOf(check({ body: template() }), 'error');
        Vitest.expect(errors).toEqual(
          Vitest.expect.arrayContaining([
            'empty-section:Summary',
            'empty-section:Verification',
            'placeholder:Summary',
            'placeholder:Follow-ups',
          ]),
        );
        Vitest.expect(errors.filter((rule) => rule.startsWith('missing-section'))).toStrictEqual(
          [],
        );
      },
    );

    Vitest.it('passes once its comments are replaced by real content', () => {
      const filled = template().replace(
        /## (.+)\n<!--[^]*?-->/g,
        (_match, heading: string) => `## ${heading}\n${CONTENT.get(heading) ?? ''}`,
      );
      Vitest.expect(check({ body: filled }).findings).toStrictEqual([]);
    });
  });

  Vitest.describe('errors', () => {
    const cases: ReadonlyArray<readonly [name: string, body: string, expected: string]> = [
      ['a missing required section', without('Verification'), 'missing-section:Verification'],
      [
        'a standard heading twice',
        compose([
          ...HEADINGS.map((heading): readonly [string, string] => [
            heading,
            CONTENT.get(heading) ?? '',
          ]),
          ['Proof', '![again](https://example.com/again.png)'],
        ]),
        'duplicate-section:Proof',
      ],
      [
        'a heading with nothing under it',
        replacing('Blast Radius', ''),
        'empty-section:Blast Radius',
      ],
      [
        'an HTML comment left in',
        replacing('Summary', 'Ship the checker before publishing. <!-- say why -->'),
        'placeholder:Summary',
      ],
      [
        'a TODO token left in',
        replacing('Blast Radius', 'TODO: name the rollback.'),
        'placeholder:Blast Radius',
      ],
      [
        'a generated-with footer',
        replacing(
          'Verification',
          (CONTENT.get('Verification') ?? '') +
            '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
        ),
        'attribution:Verification',
      ],
      [
        'a co-author trailer',
        replacing(
          'Follow-ups',
          (CONTENT.get('Follow-ups') ?? '') + '\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
        ),
        'attribution:Follow-ups',
      ],
      [
        'more than the line limit',
        replacing(
          'Verification',
          [FENCE, ...Array.from({ length: MAX_LINES }, (_, index) => `step ${index}`), FENCE].join(
            '\n',
          ),
        ),
        'too-long:-',
      ],
      [
        'a Verification that only promises',
        replacing('Verification', 'Ran the tests and they pass.'),
        'verification-evidence:Verification',
      ],
    ];

    for (const [name, body, expected] of cases) {
      Vitest.it(`fires ${expected} on ${name}`, () => {
        Vitest.expect(rulesOf(check({ body }), 'error')).toStrictEqual([expected]);
      });
    }

    Vitest.it('fires title-format on a title that is not type(scope): subject', () => {
      Vitest.expect(
        rulesOf(check({ body: CLEAN, title: 'Added a PR checker' }), 'error'),
      ).toStrictEqual(['title-format:-']);
      Vitest.expect(rulesOf(check({ body: CLEAN, title: 'feat: short' }), 'error')).toStrictEqual([
        'title-format:-',
      ]);
    });
  });

  Vitest.describe('hints never fail', () => {
    const cases: ReadonlyArray<
      readonly [name: string, body: string, expected: ReadonlyArray<string>]
    > = [
      [
        'sections out of order',
        pick(['What changed', 'Summary', ...HEADINGS.slice(2)]),
        ['order:Summary'],
      ],
      [
        'a standard heading at the wrong level',
        CLEAN.replace('## Decisions', '### Decisions'),
        ['no-decisions:Decisions', 'wrong-level:Decisions'],
      ],
      [
        'a four-sentence Summary',
        replacing('Summary', 'Add a checker. It reads bodies. It flags gaps. It exits non-zero.'),
        ['summary-length:Summary'],
      ],
      [
        'a Summary over 400 characters',
        replacing('Summary', `${'checks the body '.repeat(26)}end.`),
        ['summary-length:Summary'],
      ],
      [
        'What changed without bullets',
        replacing('What changed', 'Added the module and the script.'),
        ['bullets:What changed'],
      ],
      [
        'What changed with seven bullets',
        replacing(
          'What changed',
          Array.from({ length: 7 }, (_, index) => `- change ${index + 1}`).join('\n'),
        ),
        ['bullets:What changed'],
      ],
      [
        'a paragraph over 300 characters',
        replacing('Blast Radius', 'This touches the release flow. '.repeat(11)),
        ['wall-of-text:Blast Radius'],
      ],
      ['no Decisions section', without('Decisions'), ['no-decisions:Decisions']],
      ['no Proof section and no image', without('Proof'), ['no-proof:Proof']],
      [
        'a Proof with nothing to see',
        replacing('Proof', 'It works on my machine.'),
        ['proof-without-evidence:Proof'],
      ],
    ];

    for (const [name, body, expected] of cases) {
      Vitest.it(`hints ${expected.join(', ')} on ${name}`, () => {
        const report = check({ body });
        Vitest.expect(report.errors).toBe(0);
        Vitest.expect(rulesOf(report, 'hint')).toStrictEqual(expected);
      });
    }

    Vitest.it('splits bullets, link-only lines and images out of the wall-of-text count', () => {
      const sixBullets = Array.from(
        { length: 6 },
        (_, index) => `- Change ${index + 1} updates one part of the checker and its tests.`,
      ).join('\n');
      const longLink = `- [the run](https://example.com/${'x'.repeat(320)})`;
      const body = replacing('What changed', sixBullets).replace(
        CONTENT.get('Follow-ups') ?? '',
        longLink,
      );
      Vitest.expect(check({ body }).findings).toStrictEqual([]);
    });

    Vitest.it('accepts an image anywhere as proof', () => {
      const body = without('Proof').replace(
        '## Blast Radius\n',
        '## Blast Radius\n![before and after](https://example.com/diff.png)\n',
      );
      Vitest.expect(check({ body }).findings).toStrictEqual([]);
    });
  });

  Vitest.it('names the standard section each old-style heading folds into', () => {
    const oldStyle = compose([
      ['Why', 'Workers need one standard.'],
      ['What changed', CONTENT.get('What changed') ?? ''],
      ['Scope', 'Only the mf-mode package.'],
      ['Tradeoffs', 'A pure module over an Effect service.'],
      ['Testing', '`bun run test` passes.'],
      ['Screenshots', '![output](https://example.com/out.png)'],
      ['Blast Radius', CONTENT.get('Blast Radius') ?? ''],
      ['Verification', CONTENT.get('Verification') ?? ''],
    ]);
    const report = check({ body: oldStyle });
    const folds = report.findings
      .filter((entry) => entry.rule === 'unknown-section')
      .map((entry) => [entry.section, entry.fix]);
    Vitest.expect(folds).toStrictEqual([
      ['Why', Vitest.expect.stringContaining('## Summary')],
      ['Scope', Vitest.expect.stringContaining('## Blast Radius')],
      ['Tradeoffs', Vitest.expect.stringContaining('## Decisions')],
      ['Testing', Vitest.expect.stringContaining('## Verification')],
      ['Screenshots', Vitest.expect.stringContaining('## Proof')],
    ]);
    Vitest.expect(rulesOf(report, 'error')).toStrictEqual(['missing-section:Summary']);
  });

  Vitest.it('folds a heading with no alias into the section whose purpose it matches', () => {
    const report = check({ body: `${CLEAN}\n## Commands\n\`bun test\`\n` });
    const fold = report.findings.find((entry) => entry.rule === 'unknown-section');
    Vitest.expect(fold?.fix).toContain('## Verification');
  });

  Vitest.it('reads nothing inside a fenced code block as a heading, comment or token', () => {
    const verification = [
      `${FENCE}md`,
      '## Fake',
      'TODO: not a placeholder',
      '<!-- not a comment -->',
      FENCE,
    ].join('\n');
    const report = check({ body: replacing('Verification', verification) });
    Vitest.expect(report.findings).toStrictEqual([]);
  });

  Vitest.it('ignores a token inside inline code', () => {
    const body = replacing('What changed', '- Remove the stale `TODO` markers from the docs.');
    Vitest.expect(check({ body }).findings).toStrictEqual([]);
  });

  Vitest.it('gives every finding one sentence of fix that names its section', () => {
    const messy = [
      '# Title',
      'Intro with a TODO.',
      '<!-- leftover -->',
      '## Why',
      'This change matters. '.repeat(16),
      '## What changed',
      'Prose only.',
      '## What changed',
      '',
      '## Proof',
      'Works.',
      '## Verification',
      'All good.',
      '### Decisions',
      '## Notes',
      '',
    ].join('\n');
    const report = check({ body: messy, title: 'bad title' });
    Vitest.expect(report.errors).toBeGreaterThan(0);
    Vitest.expect(report.hints).toBeGreaterThan(0);
    for (const entry of report.findings) {
      Vitest.expect(entry.fix.endsWith('.')).toBe(true);
      Vitest.expect(entry.fix.slice(0, -1)).not.toMatch(/[.!?]\s/);
      if (entry.section !== undefined) Vitest.expect(entry.fix).toContain(`## ${entry.section}`);
    }
  });
});

Vitest.describe('render', () => {
  Vitest.it('agent form: a clean body says publish', () => {
    const report = check({ body: CLEAN });
    Vitest.expect(render(report, { human: false }).split('\n')).toStrictEqual([
      `pr-check errors=0 hints=0 lines=${report.lines}/${MAX_LINES}`,
      'next="publish"',
    ]);
  });

  Vitest.it(
    'agent form: one key=value line per finding, errors first, then the next action',
    () => {
      const report = check({ body: without('Verification'), title: 'bad title' });
      const lines = render(report, { human: false }).split('\n');
      Vitest.expect(lines[0]).toBe(`pr-check errors=2 hints=0 lines=${report.lines}/${MAX_LINES}`);
      Vitest.expect(lines[1]).toMatch(/^error rule=title-format fix="[^"]+"$/);
      Vitest.expect(lines[2]).toMatch(
        /^error rule=missing-section section="Verification" fix="[^"]+"$/,
      );
      Vitest.expect(lines[3]).toBe('next="fix the errors, then check again"');
      Vitest.expect(lines).toHaveLength(4);
    },
  );

  Vitest.it('agent form: hints alone still say publish', () => {
    const lines = render(check({ body: without('Decisions') }), { human: false }).split('\n');
    Vitest.expect(lines[1]).toMatch(/^hint rule=no-decisions section="Decisions" fix="[^"]+"$/);
    Vitest.expect(lines.at(-1)).toBe('next="fix the hints that apply, then publish"');
  });

  Vitest.it('human form: a header, then ✗ per error and → per hint', () => {
    const report = check({
      body: without('Verification').replace('## Decisions', '## Choices'),
      title: 'bad',
    });
    const [header, ...rest] = render(report, { human: true }).split('\n');
    Vitest.expect(header).toContain(`errors ${report.errors}`);
    Vitest.expect(rest.filter((line) => line.startsWith('✗ '))).toHaveLength(report.errors);
    Vitest.expect(rest.filter((line) => line.startsWith('→ '))).toHaveLength(report.hints);
    Vitest.expect(rest).toHaveLength(report.findings.length);
  });
});
