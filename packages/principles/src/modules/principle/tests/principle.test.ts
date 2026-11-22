import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Principle from '../index.js';

/** The sample this package ships; it must always verify clean. */
const SAMPLE = Fs.readFileSync(
  NodePath.resolve(import.meta.dirname, '../../../../principles/fix-root-causes', Principle.FILE),
  'utf8',
);

const file = (frontmatter: string, body: string): string => `---\n${frontmatter}\n---\n\n${body}`;

const GOOD_BODY = '# Demo\n\nStatement.\n\n- Rule one.\n';
const GOOD_FM = 'name: demo\ndescription: "Apply when testing. Do the thing."';

const messages = (result: Principle.VerifyResult): ReadonlyArray<string> =>
  result.issues.map((issue) => `${issue.severity ?? 'error'} ${issue.field}: ${issue.message}`);

Vitest.describe('Principle.verifyFile', () => {
  Vitest.it('passes the shipped sample with no findings', () => {
    Vitest.expect(Principle.verifyFile('fix-root-causes', SAMPLE)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it('passes a minimal well-formed principle', () => {
    Vitest.expect(Principle.verifyFile('demo', file(GOOD_FM, GOOD_BODY)).valid).toBe(true);
  });

  Vitest.it('fails a missing or unterminated frontmatter block', () => {
    const result = Principle.verifyFile('demo', GOOD_BODY);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.field).toBe('frontmatter');
  });

  Vitest.it('fails an unreadable frontmatter line', () => {
    const result = Principle.verifyFile('demo', file(`${GOOD_FM}\nnot a pair`, GOOD_BODY));
    Vitest.expect(messages(result)).toStrictEqual([
      'error frontmatter: Line 4 is not a `key: value` pair or list item.',
    ]);
  });

  Vitest.it('fails a name that is not a slug or not the directory', () => {
    const notSlug = Principle.verifyFile(
      'Demo_X',
      file('name: Demo_X\ndescription: Apply when x.', GOOD_BODY),
    );
    Vitest.expect(notSlug.issues.map((issue) => issue.field)).toStrictEqual(['name']);
    const mismatch = Principle.verifyFile('other', file(GOOD_FM, GOOD_BODY));
    Vitest.expect(messages(mismatch)).toStrictEqual([
      "error name: Must match the directory name 'other'.",
    ]);
    const missing = Principle.verifyFile('demo', file('description: Apply when x.', GOOD_BODY));
    Vitest.expect(messages(missing)).toStrictEqual([
      'error name: Required frontmatter field is missing or empty.',
    ]);
  });

  Vitest.it('fails an empty description or one that does not open with the condition', () => {
    const empty = Principle.verifyFile('demo', file('name: demo\ndescription: ""', GOOD_BODY));
    Vitest.expect(messages(empty)).toStrictEqual([
      'error description: Required frontmatter field is missing or empty.',
    ]);
    const unconditioned = Principle.verifyFile(
      'demo',
      file('name: demo\ndescription: Fix the fault.', GOOD_BODY),
    );
    Vitest.expect(messages(unconditioned)).toStrictEqual([
      "error description: Must start with 'Apply when'.",
    ]);
  });

  Vitest.it('requires exactly one H1, ignoring headings inside code fences', () => {
    Vitest.expect(
      messages(Principle.verifyFile('demo', file(GOOD_FM, 'Statement only.\n'))),
    ).toStrictEqual(['error body: Missing `# Title` heading.']);
    Vitest.expect(
      messages(Principle.verifyFile('demo', file(GOOD_FM, '# One\n\nText.\n\n# Two\n'))),
    ).toStrictEqual(['error body: Expected one `# Title` heading, found 2.']);
    Vitest.expect(
      Principle.verifyFile('demo', file(GOOD_FM, '# One\n\n```sh\n# a comment\n```\n')).valid,
    ).toBe(true);
  });

  Vitest.it('fails an empty body after the H1', () => {
    Vitest.expect(
      messages(Principle.verifyFile('demo', file(GOOD_FM, '# Demo\n\n'))),
    ).toStrictEqual(['error body: Empty body after the `# Title` heading.']);
  });

  Vitest.it('warns, without failing, when the body runs past the line budget', () => {
    const long = `# Demo\n\n${Array.from({ length: Principle.MAX_BODY_LINES }, (_, index) => `- Rule ${index}.`).join('\n')}\n`;
    const result = Principle.verifyFile('demo', file(GOOD_FM, long));
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues.map((issue) => issue.severity)).toStrictEqual(['warning']);
  });
});

Vitest.describe('Principle.decodeFile', () => {
  Vitest.it.effect('decodes name, description, and title', () =>
    Effect.gen(function* () {
      const principle = yield* Principle.decodeFile('fix-root-causes', SAMPLE);
      Vitest.expect(principle.name).toBe('fix-root-causes');
      Vitest.expect(principle.description.startsWith('Apply when debugging.')).toBe(true);
      Vitest.expect(principle.title).toBe('Fix Root Causes');
    }),
  );

  Vitest.it.effect('fails a file with no frontmatter', () =>
    Effect.gen(function* () {
      const failure = yield* Principle.decodeFile('demo', '# Demo\n').pipe(Effect.flip);
      Vitest.expect(failure).toBe(`Malformed ${Principle.FILE} in 'demo'.`);
    }),
  );
});
