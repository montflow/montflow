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

const mechanicalGates = [
  '## Stage 0: Static (mechanical)',
  'command: bun run ts:check',
  '',
  '- [ ] `tsc --noEmit` exits 0.',
  '',
].join('\n');

const subjectiveGates = [
  '## Stage 1: Review (subjective)',
  'judge: effect-reviewer',
  '',
  '- [ ] Every failure is a tagged error.',
  '',
].join('\n');

interface MechanicalOverrides {
  readonly stage?: number;
  readonly command?: string;
  readonly exit?: number;
  readonly verdict?: 'pass' | 'fail';
  readonly scope?: ReadonlyArray<string>;
  readonly key?: string;
  readonly fingerprint?: string;
}

const mechanicalResult = (overrides: MechanicalOverrides = {}) =>
  JSON.stringify({
    stage: 0,
    title: 'Static',
    kind: 'mechanical',
    command: 'bun run ts:check',
    exit: 0,
    verdict: 'pass',
    at: '2026-11-03T12:00:00Z',
    output: '',
    ...overrides,
  });

interface SubjectiveOverrides {
  readonly stage?: number;
  readonly judge?: string;
  readonly verdict?: 'pass' | 'fail';
  readonly note?: string;
}

const subjectiveResult = (overrides: SubjectiveOverrides = {}) =>
  JSON.stringify({
    stage: 1,
    title: 'Review',
    kind: 'subjective',
    judge: 'effect-reviewer',
    verdict: 'pass',
    at: '2026-11-03T12:01:00Z',
    note: 'Every failure is a tagged error.',
    ...overrides,
  });

Vitest.describe('Gates.parseGates runtime', () => {
  Vitest.it('parses stages and their items, keeping legacy stages unclassified', () => {
    const stages = Gates.parseGates(goodGates);
    Vitest.expect(stages).toStrictEqual([
      {
        heading: 'Stage 0: Core Validation',
        title: 'Core Validation',
        stage: 0,
        kind: undefined,
        command: undefined,
        judge: undefined,
        metadata: [],
        items: [
          { text: 'format:check', checked: false, line: 3 },
          { text: 'lint:check', checked: false, line: 4 },
        ],
        line: 1,
      },
      {
        heading: 'Stage 1: Verification',
        title: 'Verification',
        stage: 1,
        kind: undefined,
        command: undefined,
        judge: undefined,
        metadata: [],
        items: [
          { text: 'ts:check', checked: false, line: 8 },
          { text: 'test', checked: false, line: 9 },
        ],
        line: 6,
      },
    ]);
  });

  Vitest.it('parses the kind and metadata before the first item', () => {
    const [mechanical] = Gates.parseGates(mechanicalGates);
    Vitest.expect(mechanical).toMatchObject({
      stage: 0,
      title: 'Static',
      kind: 'mechanical',
      command: 'bun run ts:check',
      judge: undefined,
    });
    const [subjective] = Gates.parseGates(subjectiveGates);
    Vitest.expect(subjective).toMatchObject({
      stage: 1,
      kind: 'subjective',
      command: undefined,
      judge: 'effect-reviewer',
    });
  });

  Vitest.it('strips one surrounding backtick pair from a command', () => {
    const [stage] = Gates.parseGates(
      ['## Stage 0: Static (mechanical)', 'command: `bun run test`', '', '- [ ] Pass.', ''].join(
        '\n',
      ),
    );
    Vitest.expect(stage?.command).toBe('bun run test');
  });
});

Vitest.describe('Gates.verifyGatesFile runtime', () => {
  Vitest.it('accepts a standard checklist unchanged', () => {
    Vitest.expect(Gates.verifyGatesFile(goodGates)).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('accepts classified stages with the metadata their kind needs', () => {
    Vitest.expect(Gates.verifyGatesFile(mechanicalGates).valid).toBe(true);
    Vitest.expect(Gates.verifyGatesFile(subjectiveGates).valid).toBe(true);
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

  Vitest.it('flags metadata on an unclassified stage and a bad mechanical command', () => {
    const unclassified = Gates.verifyGatesFile(
      ['## Stage 0: Static', 'command: bun run test', '', '- [ ] Pass.', ''].join('\n'),
    );
    Vitest.expect(unclassified.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.kind-missing', field: 'Stage 0: Static' }),
    );
    const placeholder = Gates.verifyGatesFile(
      ['## Stage 0: Static (mechanical)', 'command: <run the suite>', '', '- [ ] Pass.', ''].join(
        '\n',
      ),
    );
    Vitest.expect(placeholder.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.placeholder-command' }),
    );
  });

  Vitest.it('requires a classified stage only when the owner is an unfinished v2 task', () => {
    const markdown = ['## Stage 0: Static', '', '- [ ] Pass.', ''].join('\n');
    const legacy = Gates.verifyGatesFile(markdown);
    Vitest.expect(legacy.valid).toBe(true);
    const required = Gates.verifyGatesFile(markdown, { requireClassified: true });
    Vitest.expect(required.valid).toBe(false);
    Vitest.expect(required.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.no-mechanical-stages' }),
    );
  });

  Vitest.it('requires exactly one command or judge and rejects duplicates', () => {
    const noCommand = Gates.verifyGatesFile(
      ['## Stage 0: Static (mechanical)', '', '- [ ] Pass.', ''].join('\n'),
    );
    Vitest.expect(noCommand.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.malformed-metadata' }),
    );
    const duplicate = Gates.verifyGatesFile(
      [
        '## Stage 0: Static (mechanical)',
        'command: bun run test',
        'command: bun run lint',
        '',
        '- [ ] Pass.',
        '',
      ].join('\n'),
    );
    Vitest.expect(duplicate.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.malformed-metadata' }),
    );
    const badJudge = Gates.verifyGatesFile(
      ['## Stage 0: Review (subjective)', 'judge: Effect Reviewer', '', '- [ ] Fine.', ''].join(
        '\n',
      ),
    );
    Vitest.expect(badJudge.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.malformed-metadata' }),
    );
  });

  Vitest.it('rejects a duplicate stage number', () => {
    const result = Gates.verifyGatesFile(
      ['## Stage 0: One', '', '- [ ] A.', '', '## Stage 0: Two', '', '- [ ] B.', ''].join('\n'),
    );
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.duplicate-stage' }),
    );
  });
});

Vitest.describe('Gates.verifyGateProgress runtime', () => {
  Vitest.it('errors when a complete task has no checked gate item', () => {
    Vitest.expect(Gates.verifyGateProgress(goodGates, true)).toStrictEqual({
      valid: false,
      issues: [
        {
          code: 'gate.unchecked',
          field: 'gate',
          message:
            'Completed task has 4 gate items and none checked; the gate records no verification result.',
          expected: 'at least one checked gate item (`- [x]`) or a recorded passing result',
          actual: '4 unchecked',
          fix: 'Run the gate and check each item that passed, or set `status: in-progress`.',
        },
      ],
    });
  });

  Vitest.it('stays quiet for an unfinished task, a checked gate, and an itemless gate', () => {
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

  Vitest.it('accepts a recorded passing result in place of a ticked box', () => {
    Vitest.expect(
      Gates.verifyGateProgress(mechanicalGates, true, `${mechanicalResult()}\n`),
    ).toStrictEqual({ valid: true, issues: [] });
  });
});

Vitest.describe('Gates.parseGateResults runtime', () => {
  Vitest.it('parses mechanical and subjective records', () => {
    const parsed = Gates.parseGateResults(`${mechanicalResult()}\n${subjectiveResult()}\n`);
    Vitest.expect(parsed.issues).toStrictEqual([]);
    Vitest.expect(parsed.records).toStrictEqual([
      {
        stage: 0,
        title: 'Static',
        kind: 'mechanical',
        command: 'bun run ts:check',
        exit: 0,
        verdict: 'pass',
        at: '2026-11-03T12:00:00Z',
        output: '',
      },
      {
        stage: 1,
        title: 'Review',
        kind: 'subjective',
        judge: 'effect-reviewer',
        verdict: 'pass',
        at: '2026-11-03T12:01:00Z',
        note: 'Every failure is a tagged error.',
      },
    ]);
  });

  Vitest.it('names the malformed line and drops it', () => {
    const parsed = Gates.parseGateResults(
      `${mechanicalResult()}\nnot json\n${mechanicalResult({ stage: 2 })}\n`,
    );
    Vitest.expect(parsed.records.map((record) => record.stage)).toStrictEqual([0, 2]);
    Vitest.expect(parsed.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.results-malformed', line: 2 }),
    );
  });

  Vitest.it('flags a verdict that disagrees with its exit status', () => {
    const parsed = Gates.parseGateResults(`${mechanicalResult({ verdict: 'pass', exit: 1 })}\n`);
    Vitest.expect(parsed.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.result-inconsistent' }),
    );
  });
});

Vitest.describe('Gates.verifyGateResults runtime', () => {
  const input = (overrides: Partial<Gates.GateResultsInput> = {}): Gates.GateResultsInput => ({
    gates: mechanicalGates,
    complete: true,
    owner: "Task 'A001'",
    ...overrides,
  });

  Vitest.it('names an unproven mechanical gate on a complete owner', () => {
    const result = Gates.verifyGateResults(input());
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'gate.unproven',
        field: 'GATES.md',
        message: Vitest.expect.stringContaining("mechanical stage 0 'Static'"),
      }),
    );
  });

  Vitest.it('passes a matching recorded pass and unproves a changed command', () => {
    Vitest.expect(
      Gates.verifyGateResults(input({ results: `${mechanicalResult()}\n` })).issues,
    ).toStrictEqual([]);
    const changed = Gates.verifyGateResults(
      input({ results: `${mechanicalResult({ command: 'bun run old' })}\n` }),
    );
    Vitest.expect(changed.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.unproven' }),
    );
  });

  Vitest.it('warns, but never passes, an unjudged subjective stage', () => {
    const unjudged = Gates.verifyGateResults(input({ gates: subjectiveGates, results: '' }));
    Vitest.expect(unjudged.valid).toBe(true);
    Vitest.expect(unjudged.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.unjudged', severity: 'warning' }),
    );
    Vitest.expect(
      Gates.verifyGateResults(input({ gates: subjectiveGates, results: `${subjectiveResult()}\n` }))
        .issues,
    ).toStrictEqual([]);
  });

  Vitest.it('stays quiet for an unfinished owner', () => {
    Vitest.expect(Gates.verifyGateResults(input({ complete: false })).issues).toStrictEqual([]);
  });

  Vitest.it('rejects a result for a stage the owner does not declare', () => {
    const result = Gates.verifyGateResults(
      input({ results: `${mechanicalResult({ stage: 9 })}\n` }),
    );
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.result-owner-mismatch' }),
    );
  });

  Vitest.it('leaves a legacy unclassified gate entirely alone', () => {
    Vitest.expect(
      Gates.verifyGateResults(input({ gates: goodGates, complete: true })).issues,
    ).toStrictEqual([]);
  });

  const scopedGates = [
    '## Stage 0: Static (mechanical)',
    'command: bun run ts:check',
    'scope: packages/specs',
    '',
    '- [ ] `tsc --noEmit` exits 0.',
    '',
  ].join('\n');

  Vitest.it('rejects a mechanical result with no scope on a scoped stage', () => {
    const result = Gates.verifyGateResults(
      input({ gates: scopedGates, results: `${mechanicalResult()}\n` }),
    );
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.results-malformed' }),
    );
    Vitest.expect(result.valid).toBe(false);
  });

  Vitest.it('accepts a result whose scope covers the declared scope', () => {
    Vitest.expect(
      Gates.verifyGateResults(
        input({
          gates: scopedGates,
          results: `${mechanicalResult({ scope: ['packages/specs', 'packages/core'] })}\n`,
        }),
      ).issues,
    ).toStrictEqual([]);
  });
});

Vitest.describe('Gates.instant runtime', () => {
  Vitest.it('formats a UTC instant to seconds with a Z suffix', () => {
    Vitest.expect(Gates.instant(Date.UTC(2026, 10, 3, 12, 0, 0))).toBe('2026-11-03T12:00:00Z');
  });
});

/** Parse one mechanical record line into a result record. */
const records = (line: string) => Gates.parseGateResults(`${line}\n`).records;

Vitest.describe('Gates.verifyResultFreshness runtime', () => {
  Vitest.it('rejects a pass recorded under a scope the stage no longer declares', () => {
    const result = Gates.verifyResultFreshness({
      records: records(
        mechanicalResult({ scope: ['packages/core'], key: 'gate-v1:core', fingerprint: 'fp' }),
      ),
      owner: "Task 'A001'",
      complete: true,
      declaredScope: () => ['packages/specs'],
      recompute: () => 'gate-v1:core',
    });
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.stale-result' }),
    );
    Vitest.expect(result.valid).toBe(false);
  });

  Vitest.it('reports a pass whose scope disappeared instead of accepting it', () => {
    const result = Gates.verifyResultFreshness({
      records: records(
        mechanicalResult({ scope: ['gone'], key: 'gate-v1:gone', fingerprint: 'fp' }),
      ),
      owner: "Task 'A001'",
      complete: true,
      declaredScope: () => ['gone'],
      missingScope: () => true,
      recompute: () => undefined,
    });
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.scope-missing' }),
    );
  });

  Vitest.it('requires a key on a complete owner whose stage declares a scope', () => {
    const unkeyed = records(mechanicalResult({ scope: ['packages/specs'] }));
    const required = Gates.verifyResultFreshness({
      records: unkeyed,
      owner: "Task 'A001'",
      complete: true,
      declaredScope: () => ['packages/specs'],
      recompute: () => undefined,
    });
    Vitest.expect(required.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.result-unkeyed' }),
    );
    Vitest.expect(required.valid).toBe(false);

    const legacy = Gates.verifyResultFreshness({
      records: unkeyed,
      owner: "Task 'A001'",
      complete: true,
      recompute: () => undefined,
    });
    Vitest.expect(legacy.issues).toStrictEqual([]);
  });

  Vitest.it('rejects a keyed pass with no scope instead of skipping freshness', () => {
    const result = Gates.verifyResultFreshness({
      records: records(mechanicalResult({ key: 'gate-v1:deadbeef' })),
      owner: "Task 'A001'",
      complete: true,
      declaredScope: () => ['packages/specs'],
      recompute: () => 'gate-v1:deadbeef',
    });
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.results-malformed' }),
    );
    Vitest.expect(result.valid).toBe(false);
  });

  Vitest.it('accepts a pass whose scope covers the declared scope', () => {
    const result = Gates.verifyResultFreshness({
      records: records(
        mechanicalResult({
          scope: ['packages/specs', 'packages/core'],
          key: 'gate-v1:wide',
          fingerprint: 'fp',
        }),
      ),
      owner: "Task 'A001'",
      complete: true,
      declaredScope: () => ['packages/specs'],
      recompute: () => 'gate-v1:wide',
    });
    Vitest.expect(result.issues).toStrictEqual([]);
  });
});
