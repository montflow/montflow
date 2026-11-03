import * as Vitest from '@effect/vitest';
import * as Phase from '../index.js';
import * as Lifecycle from '../../lifecycle/index.js';
import { entry, memory, snapshot } from '../../structure/tests/helpers.js';
import { taskMarkdown } from '../../task/tests/helpers.js';
import { mechanicalPhaseGate, passingResult, phaseMarkdown } from './helpers.js';

const context = (overrides: Partial<Phase.PhaseContext> = {}): Phase.PhaseContext => ({
  taskStatuses: ['pending'],
  taskTypes: ['execution', 'review'],
  ...overrides,
});

Vitest.describe('Phase.derivePhaseStatus', () => {
  Vitest.it('derives every status from the task statuses', () => {
    Vitest.expect(Phase.derivePhaseStatus(['pending', 'pending'])).toBe('pending');
    Vitest.expect(Phase.derivePhaseStatus(['pending', 'in-progress'])).toBe('in-progress');
    Vitest.expect(Phase.derivePhaseStatus(['complete', 'in-progress'])).toBe('in-progress');
    Vitest.expect(Phase.derivePhaseStatus(['blocked', 'pending'])).toBe('blocked');
    Vitest.expect(Phase.derivePhaseStatus(['complete', 'complete'])).toBe('complete');
  });
});

Vitest.describe('Phase.verifyPhaseFile', () => {
  Vitest.it('accepts a required phase with a review task', () => {
    const result = Phase.verifyPhaseFile('A', phaseMarkdown(), context());
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('accepts a waived phase with a reason and evidence grammar', () => {
    const result = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown({
        status: 'complete',
        review: 'waived',
        reviewReason: 'One reversible flag rename, fully proven by the package suite.',
        reviewEvidence: 'A001:0',
      }),
      context({ taskTypes: ['execution'], taskStatuses: ['complete'] }),
    );
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('flags an id that differs from the directory', () => {
    const result = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown({ id: 'B', title: '# Phase A' }),
      context(),
    );
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.idMismatch, field: 'id' }),
    );
  });

  Vitest.it('flags a missing or placeholder objective', () => {
    for (const objective of ['', 'TODO: <what>']) {
      const result = Phase.verifyPhaseFile('A', phaseMarkdown({ objective }), context());
      Vitest.expect(result.issues).toContainEqual(
        Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.objectiveMissing }),
      );
    }
  });

  Vitest.it('flags a status mirror that disagrees with the tasks', () => {
    const result = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown(),
      context({ taskStatuses: ['complete'] }),
    );
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({
        code: Phase.PHASE_CODES.statusStale,
        field: 'status',
        expected: 'complete',
        actual: 'pending',
      }),
    );
  });

  Vitest.it('flags an unknown review decision', () => {
    const result = Phase.verifyPhaseFile('A', phaseMarkdown({ review: 'maybe' }), context());
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.reviewInvalid }),
    );
  });

  Vitest.it('requires a real reason on a waived phase', () => {
    for (const reason of ['TODO', 'n/a', '<why>', '']) {
      const result = Phase.verifyPhaseFile(
        'A',
        phaseMarkdown({ review: 'waived', reviewReason: reason }),
        context({ taskTypes: ['execution'] }),
      );
      Vitest.expect(result.issues).toContainEqual(
        Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.reasonMissing }),
      );
    }
  });

  Vitest.it('forbids reason and evidence on a required phase', () => {
    const markdown = phaseMarkdown().replace(
      'review: required',
      'review: required\nreview-reason: nope\nreview-evidence: A001:0',
    );
    const result = Phase.verifyPhaseFile('A', markdown, context());
    const codes = result.issues.map((found) => found.code);
    Vitest.expect(codes).toContain(Phase.PHASE_CODES.reasonUnexpected);
    Vitest.expect(codes).toContain(Phase.PHASE_CODES.evidenceUnexpected);
  });

  Vitest.it('rejects malformed, duplicated, and foreign evidence refs', () => {
    const result = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown({
        review: 'waived',
        reviewEvidence: 'A001:0, A001:0, B001:0, broken',
      }),
      context({ taskTypes: ['execution'], taskStatuses: ['complete'] }),
    );
    const invalid = result.issues.filter(
      (found) => found.code === Phase.PHASE_CODES.evidenceInvalid,
    );
    Vitest.expect(invalid).toHaveLength(3);
  });

  Vitest.it('warns, but does not error, when a required phase has no review task', () => {
    const result = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown(),
      context({ taskTypes: ['execution'] }),
    );
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({
        code: Phase.PHASE_CODES.reviewTaskMissing,
        severity: 'warning',
      }),
    );
  });

  Vitest.it('errors when a waived phase still holds a review task', () => {
    const result = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown({ review: 'waived' }),
      context({ taskTypes: ['execution', 'review'] }),
    );
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.waiverWithReviewTask }),
    );
  });

  Vitest.it('checks the gate kind against the phase gate file', () => {
    const missing = Phase.verifyPhaseFile('A', phaseMarkdown({ gate: 'mechanical' }), context());
    Vitest.expect(missing.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.gateFileMissing }),
    );

    const unexpected = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown(),
      context({ gateText: mechanicalPhaseGate() }),
    );
    Vitest.expect(unexpected.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.gateUnexpected }),
    );

    const mismatch = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown({ gate: 'mechanical' }),
      context({ gateText: '## Stage 0: Unclassified\n\n- [ ] x\n' }),
    );
    Vitest.expect(mismatch.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.gateMismatch }),
    );

    const valid = Phase.verifyPhaseFile(
      'A',
      phaseMarkdown({ gate: 'mechanical' }),
      context({ gateText: mechanicalPhaseGate() }),
    );
    Vitest.expect(valid.issues).toStrictEqual([]);
  });

  Vitest.it('requires the body title to match the id', () => {
    const result = Phase.verifyPhaseFile('A', phaseMarkdown({ title: '# Phase B' }), context());
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.titleMismatch }),
    );
  });
});

const evidenceTree = (withResults: boolean) =>
  snapshot([
    entry(
      'SPEC.md',
      [
        '---',
        'name: ship-spec',
        'status: in-progress',
        'workspace-type: in-place',
        'author: Tester',
        'created: 2026-01-01',
        'spec-version: 2',
        '---',
        '',
        '# Ship Spec',
        '',
        '## Description',
        '',
        'Ship it.',
        '',
        '## Requirements',
        '',
        '- Works.',
        '',
        '## Tasks',
        '',
        '| ID | Name | Type | Status | Gates |',
        '| --- | --- | --- | --- | --- |',
        '| A001 | implement | execution | complete | Yes |',
        '',
      ].join('\n'),
    ),
    entry(
      'A/PHASE.md',
      phaseMarkdown({
        status: 'complete',
        review: 'waived',
        reviewReason: 'The one gate is the review evidence.',
        reviewEvidence: 'A001:0',
      }),
    ),
    entry('A/MEMORY.md', memory),
    entry(
      'A/A001-implement/TASK.md',
      taskMarkdown({ id: 'A001', name: 'implement', status: 'complete' }),
    ),
    entry('A/A001-implement/MEMORY.md', memory),
    entry('A/A001-implement/GATES.md', '## Stage 0: Verify (mechanical)\n\n- [x] Suite passes.\n'),
    ...(withResults ? [entry('A/A001-implement/GATE-RESULTS.jsonl', `${passingResult()}\n`)] : []),
  ]);

Vitest.describe('Phase.phaseEvidence', () => {
  Vitest.it('derives a proven, waived phase from passing results', () => {
    const evidence = Phase.phaseEvidence(evidenceTree(true));
    Vitest.expect(evidence.waived).toStrictEqual(['A']);
    Vitest.expect(evidence.proven).toStrictEqual(['A']);
    Vitest.expect(evidence.issues).toStrictEqual([]);
  });

  Vitest.it('refuses to waive a phase whose gates have no passing result', () => {
    const evidence = Phase.phaseEvidence(evidenceTree(false));
    Vitest.expect(evidence.waived).toStrictEqual([]);
    Vitest.expect(evidence.proven).toStrictEqual([]);
    Vitest.expect(evidence.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Phase.PHASE_CODES.waiverUnproven }),
    );
  });

  Vitest.it('derives the same locks an explicit lock list would name', () => {
    const tree = evidenceTree(true);
    const evidence = Phase.phaseEvidence(tree);
    const locked = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: evidence.waived,
      provenPhases: evidence.proven,
      tasks: [{ id: 'A001', status: 'complete' }],
    });
    Vitest.expect(
      locked.phases.filter((phase) => phase.locked).map((phase) => phase.phase),
    ).toStrictEqual(['A']);
    const unlocked = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: evidence.proven,
      tasks: [{ id: 'A001', status: 'complete' }],
    });
    Vitest.expect(
      unlocked.phases.filter((phase) => phase.locked).map((phase) => phase.phase),
    ).toStrictEqual([]);
  });
});
