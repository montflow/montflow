import * as Vitest from '@effect/vitest';
import * as Gates from '../index.js';

const goodGates = [
  '## Stage 0: Core Validation',
  '',
  '- [ ] format:check',
  '- [ ] lint:check',
  '',
  '## Stage 1: Verification',
  '',
  '- [ ] ts:check',
  '- [ ] test',
  '',
].join('\n');

Vitest.describe('Gates.parseGates runtime', () => {
  Vitest.it('parses stages and their items', () => {
    Vitest.expect(Gates.parseGates(goodGates)).toStrictEqual([
      { heading: 'Stage 0: Core Validation', items: ['format:check', 'lint:check'] },
      { heading: 'Stage 1: Verification', items: ['ts:check', 'test'] },
    ]);
  });
});

Vitest.describe('Gates.verifyGatesFile runtime', () => {
  Vitest.it('accepts a standard checklist', () => {
    Vitest.expect(Gates.verifyGatesFile(goodGates)).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('flags an empty file', () => {
    Vitest.expect(Gates.verifyGatesFile('\n')).toStrictEqual({
      valid: false,
      issues: [{ field: 'body', message: 'GATES.md is empty.' }],
    });
  });

  Vitest.it('flags a body with no stage heading', () => {
    Vitest.expect(Gates.verifyGatesFile('Validate everything manually.\n')).toStrictEqual({
      valid: false,
      issues: [{ field: 'body', message: 'Missing a `## <Stage>` heading.' }],
    });
  });

  Vitest.it('flags an empty stage and a placeholder item', () => {
    const result = Gates.verifyGatesFile(
      ['## Stage 0', '', '## Stage 1', '', '- [ ] <custom validation>', ''].join('\n'),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'Stage 0', message: 'Stage has no checklist items (`- [ ] <check>`).' },
      {
        field: 'Stage 1',
        message: "Checklist item is still a placeholder: '<custom validation>'.",
      },
    ]);
  });
});
