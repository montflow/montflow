import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Playbook from '../index.js';

/** The sample this package ships; it must always verify with no error. */
const SAMPLE = Fs.readFileSync(
  NodePath.resolve(import.meta.dirname, '../../../../playbooks/opening-a-pr', Playbook.FILE),
  'utf8',
);

const file = (frontmatter: string, body: string): string => `---\n${frontmatter}\n---\n\n${body}`;

const GOOD_FM = 'name: demo\ndescription: Do the demo.';
const GOOD_BODY = '# Demo\n\nFraming.\n\n1. Step one.\n2. Step two.\n\n## Reply\n\nWhat changed.\n';

const REFERENCES: Playbook.References = {
  root: '/ws',
  skills: new Set(['mf-feature-why']),
  principles: new Set(['fix-root-causes']),
  playbooks: new Set(['demo', 'opening-a-pr']),
};

const messages = (result: Playbook.VerifyResult): ReadonlyArray<string> =>
  result.issues.map((issue) => `${issue.severity ?? 'error'} ${issue.field}: ${issue.message}`);

Vitest.describe('Playbook.verifyFile', () => {
  Vitest.it('passes the shipped sample, warning only that it has no list', () => {
    const result = Playbook.verifyFile('opening-a-pr', SAMPLE, REFERENCES);
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(messages(result)).toStrictEqual([
      'warning body: No list item: number the steps (`1.`) or list the rules (`-`).',
    ]);
  });

  Vitest.it('passes a well-formed playbook with numbered steps or a rule list', () => {
    Vitest.expect(Playbook.verifyFile('demo', file(GOOD_FM, GOOD_BODY))).toStrictEqual({
      valid: true,
      issues: [],
    });
    Vitest.expect(
      Playbook.verifyFile('demo', file(GOOD_FM, '# Demo\n\nFraming.\n\n- Rule.\n')).issues,
    ).toStrictEqual([]);
  });

  Vitest.it('fails a missing frontmatter block or an unreadable line', () => {
    Vitest.expect(Playbook.verifyFile('demo', GOOD_BODY).issues[0]?.field).toBe('frontmatter');
    Vitest.expect(
      messages(Playbook.verifyFile('demo', file(`${GOOD_FM}\n???`, GOOD_BODY))),
    ).toStrictEqual(['error frontmatter: Line 4 is not a `key: value` pair or list item.']);
  });

  Vitest.it('fails a bad or mismatched name and an empty description', () => {
    Vitest.expect(messages(Playbook.verifyFile('other', file(GOOD_FM, GOOD_BODY)))).toStrictEqual([
      "error name: Must match the directory name 'other'.",
    ]);
    Vitest.expect(
      Playbook.verifyFile('Bad_Name', file('name: Bad_Name\ndescription: x', GOOD_BODY)).valid,
    ).toBe(false);
    Vitest.expect(
      messages(Playbook.verifyFile('demo', file('name: demo\ndescription: ""', GOOD_BODY))),
    ).toStrictEqual(['error description: Required frontmatter field is missing or empty.']);
  });

  Vitest.it('does not require the principle `Apply when` prefix', () => {
    Vitest.expect(Playbook.verifyFile('demo', file(GOOD_FM, GOOD_BODY)).valid).toBe(true);
  });

  Vitest.it('requires exactly one H1 and a body after it', () => {
    Vitest.expect(messages(Playbook.verifyFile('demo', file(GOOD_FM, '1. Step.\n')))).toStrictEqual(
      ['error body: Missing `# Title` heading.'],
    );
    Vitest.expect(
      messages(Playbook.verifyFile('demo', file(GOOD_FM, '# A\n\n1. Step.\n\n# B\n'))),
    ).toStrictEqual(['error body: Expected one `# Title` heading, found 2.']);
    Vitest.expect(messages(Playbook.verifyFile('demo', file(GOOD_FM, '# A\n')))).toStrictEqual([
      'error body: Empty body after the `# Title` heading.',
    ]);
  });

  Vitest.it('treats `## Reply` as optional but never empty', () => {
    const noReply = file(GOOD_FM, '# Demo\n\n1. Step.\n');
    Vitest.expect(Playbook.verifyFile('demo', noReply).issues).toStrictEqual([]);
    const emptyReply = file(GOOD_FM, '# Demo\n\n1. Step.\n\n## Reply\n\n## Notes\n\nx\n');
    Vitest.expect(messages(Playbook.verifyFile('demo', emptyReply))).toStrictEqual([
      'error body: Empty `## Reply` section.',
    ]);
  });

  Vitest.it('ignores list items and headings inside code fences', () => {
    const fenced = file(
      GOOD_FM,
      '# Demo\n\nFraming.\n\n```md\n# Not a title\n1. not a step\n```\n',
    );
    Vitest.expect(messages(Playbook.verifyFile('demo', fenced))).toStrictEqual([
      'warning body: No list item: number the steps (`1.`) or list the rules (`-`).',
    ]);
  });

  Vitest.it('resolves every reference list and names each missing entry', () => {
    const refs = file(
      `${GOOD_FM}\nskills:\n  - mf-feature-why\n  - ghost-skill\nprinciples:\n  - fix-root-causes\n  - ghost-principle\nplaybooks:\n  - opening-a-pr\n  - ghost-playbook`,
      GOOD_BODY,
    );
    Vitest.expect(messages(Playbook.verifyFile('demo', refs, REFERENCES))).toStrictEqual([
      "error skills: Skill 'ghost-skill' does not exist at /ws/.agents/skills/ghost-skill/SKILL.md.",
      "error principles: Principle 'ghost-principle' does not exist at /ws/.agents/@montflow/principles/ghost-principle/PRINCIPLE.md.",
      "error playbooks: Playbook 'ghost-playbook' does not exist at /ws/.agents/@montflow/playbooks/ghost-playbook/PLAYBOOK.md.",
    ]);
    Vitest.expect(Playbook.verifyFile('demo', refs).valid).toBe(true);
  });

  Vitest.it('fails a reference field written as a scalar', () => {
    Vitest.expect(
      messages(Playbook.verifyFile('demo', file(`${GOOD_FM}\nskills: one`, GOOD_BODY), REFERENCES)),
    ).toStrictEqual(['error skills: Must be a YAML list of names.']);
  });
});

Vitest.describe('Playbook.decodeFile', () => {
  Vitest.it.effect('decodes name, description, title, and reference lists', () =>
    Effect.gen(function* () {
      const playbook = yield* Playbook.decodeFile(
        'demo',
        file(`${GOOD_FM}\nprinciples:\n  - fix-root-causes`, GOOD_BODY),
      );
      Vitest.expect(playbook.title).toBe('Demo');
      Vitest.expect(playbook.principles).toStrictEqual(['fix-root-causes']);
      Vitest.expect(playbook.skills).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('fails a file with no frontmatter', () =>
    Effect.gen(function* () {
      const failure = yield* Playbook.decodeFile('demo', '# Demo\n').pipe(Effect.flip);
      Vitest.expect(failure).toBe(`Malformed ${Playbook.FILE} in 'demo'.`);
    }),
  );
});
