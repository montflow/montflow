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
      {
        heading: 'Stage 0: Core Validation',
        items: [
          { text: 'format:check', checked: false },
          { text: 'lint:check', checked: false },
        ],
      },
      {
        heading: 'Stage 1: Verification',
        items: [
          { text: 'ts:check', checked: false },
          { text: 'test', checked: false },
        ],
      },
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

Vitest.describe('Gates.verifyGateProgress runtime', () => {
  Vitest.it('warns when a complete task has no checked gate item', () => {
    Vitest.expect(Gates.verifyGateProgress(goodGates, true)).toStrictEqual({
      valid: true,
      issues: [
        {
          code: 'gate.unchecked',
          field: 'gate',
          severity: 'warning',
          message:
            'Completed task has 4 gate items and none checked; the gate records no verification result.',
          expected: 'at least one checked gate item (`- [x]`)',
          actual: '4 unchecked',
          fix: 'Run the gate and check each item that passed, or set `status: in-progress`.',
        },
      ],
    });
  });

  Vitest.it('stays quiet for a pending task, a checked gate, and an itemless gate', () => {
    Vitest.expect(Gates.verifyGateProgress(goodGates, false)).toStrictEqual({
      valid: true,
      issues: [],
    });
    const partlyChecked = goodGates.replace('- [ ] test', '- [x] test');
    Vitest.expect(Gates.verifyGateProgress(partlyChecked, true)).toStrictEqual({
      valid: true,
      issues: [],
    });
    Vitest.expect(Gates.verifyGateProgress('## Stage 0\n', true)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });
});
