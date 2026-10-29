import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Specs from '../index.js';

/** Frontmatter + body of a well-formed spec, one pending execution task and one review task. */
const spec = (name: string, reviewStatus: 'pending' | 'complete'): string =>
  [
    '---',
    `name: ${name}`,
    'status: in-progress',
    'workspace-type: in-place',
    'author: Mock',
    'created: 2026-01-01',
    'locked-phases:',
    '---',
    '',
    `# ${name}`,
    '',
    '## Description',
    '',
    'A well-formed spec used to prove the specs service.',
    '',
    '## Requirements',
    '',
    '- Everything verifies.',
    '',
    '## Tasks',
    '',
    '| ID   | Name            | Type        | Status  | Gates |',
    '| ---- | --------------- | ----------- | ------- | ----- |',
    '| A001 | implement-thing | execution   | pending | No    |',
    `| A099 | review-phase    | review      | ${reviewStatus} | No    |`,
    '',
  ].join('\n');

const task = (
  id: string,
  name: string,
  type: string,
  status = 'pending',
  extra: ReadonlyArray<string> = [],
): string =>
  [
    '---',
    `id: ${id}`,
    `name: ${name}`,
    `type: ${type}`,
    'originator: user',
    'depends-on:',
    'related-tasks:',
    ...extra,
    `status: ${status}`,
    '---',
    '',
    `# Task ${id}: ${name}`,
    '',
    `## Type: ${type}`,
    '',
    '## Description',
    '',
    'Fixture task.',
    '',
    '## Requirements',
    '',
    '- Fixture.',
    '',
    '## Completion',
    '',
    '- [ ] Fixture',
    '',
  ].join('\n');

const MEMORY = [
  '# Memory',
  '',
  '## Context',
  '',
  'Fixture.',
  '',
  '## Progress',
  '',
  '- pending',
  '',
  '## Findings',
  '',
  '- None.',
  '',
  '## Open Questions',
  '',
  '- None.',
  '',
  '## Handoff',
  '',
  '- None.',
  '',
  '## Deviations',
  '',
  '- None.',
  '',
].join('\n');

/** Write one review round carrying a phase attribution, in the review store's format. */
const writeRound = (root: string, series: string, phase: string): void => {
  const dir = join(root, '.agents', '@montflow', 'reviews', series, '001');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'REVIEW.md'),
    [
      `# Review: ${series} / 001`,
      '',
      '## Metadata',
      '',
      '- Target: fixture',
      '- Round: 001',
      `- Phase: ${phase}`,
      '- Type: standalone',
      '- Isolation: isolated',
      '- Max Attempts: 3',
      '- Status: closed',
      '- Created: 2026-01-01',
      '',
      '## Findings',
      '',
      'No defects found.',
      '',
      '## Summary',
      '',
      '- Critical: 0',
      '- Major: 0',
      '- Minor: 0',
      '- Nit: 0',
      '- Open: 0',
      '- In Review: 0',
      '- Resolved: 0',
      "- Won't Fix: 0",
      '- Escalated: 0',
      '',
    ].join('\n'),
  );
};

/**
 * Build a throwaway workspace root holding one well-formed spec.
 * @param reviewed - when true, the review task is complete with an
 * `effect-reviewer` profile and both linked series exist
 * @returns the workspace root
 */
const makeRoot = (reviewed = false): string => {
  const root = mkdtempSync(join(tmpdir(), 'mf-workspace-specs-'));
  const name = reviewed ? 'mock-reviewed' : 'mock-ok';
  const dir = join(root, '.agents', '@montflow', 'specs', name);
  mkdirSync(join(dir, 'A', 'A001-implement-thing'), { recursive: true });
  mkdirSync(join(dir, 'A', 'A099-review-phase'), { recursive: true });
  writeFileSync(join(dir, 'SPEC.md'), spec(name, reviewed ? 'complete' : 'pending'));
  writeFileSync(
    join(dir, 'A', 'A001-implement-thing', 'TASK.md'),
    task('A001', 'implement-thing', 'execution'),
  );
  writeFileSync(join(dir, 'A', 'A001-implement-thing', 'MEMORY.md'), MEMORY);
  writeFileSync(
    join(dir, 'A', 'A099-review-phase', 'TASK.md'),
    task(
      'A099',
      'review-phase',
      'review',
      reviewed ? 'complete' : 'pending',
      reviewed ? ['reviewer-profiles: effect-reviewer'] : [],
    ),
  );
  writeFileSync(join(dir, 'A', 'A099-review-phase', 'MEMORY.md'), MEMORY);
  if (reviewed) {
    writeRound(root, name, 'A');
    writeRound(root, `${name}-effect-reviewer`, 'A');
  }
  return root;
};

/** Remove a fixture root once the body finishes, even when it fails. */
const cleaned = <A, E>(root: string, self: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  self.pipe(Effect.ensuring(Effect.sync(() => rmSync(root, { recursive: true, force: true }))));

Vitest.describe('Specs service', () => {
  Vitest.it.effect('reports an installed store', () =>
    Effect.gen(function* () {
      const root = makeRoot();
      const installed = yield* cleaned(root, Specs.specsInstalled(root));
      Vitest.expect(installed).toBe(true);
      Vitest.expect(yield* Specs.specsInstalled(join(root, 'missing'))).toBe(false);
    }),
  );

  Vitest.it.effect('lists a spec through the @montflow/specs runtime', () =>
    Effect.gen(function* () {
      const root = makeRoot();
      const rows = yield* cleaned(root, Specs.fetchSpecs(root));
      Vitest.expect(rows).toHaveLength(1);
      const [row] = rows;
      Vitest.expect(row?.id).toBe('mock-ok');
      Vitest.expect(row?.name).toBe('mock-ok');
      Vitest.expect(row?.description).toBe('A well-formed spec used to prove the specs service.');
      Vitest.expect(row?.total).toBe(2);
      Vitest.expect(row?.complete).toBe(0);
      Vitest.expect(row?.issues).toBe(0);
      Vitest.expect(row?.valid).toBe(true);
      Vitest.expect(row?.state).toBe('pending');
    }),
  );

  Vitest.it.effect('loads one spec detail with phases, counts, and clean issues', () =>
    Effect.gen(function* () {
      const root = makeRoot();
      const detail = yield* cleaned(root, Specs.loadSpec(root, 'mock-ok'));
      Vitest.expect(detail.summary.valid).toBe(true);
      Vitest.expect(detail.meta?.author).toBe('Mock');
      Vitest.expect(detail.meta?.status).toBe('in-progress');
      Vitest.expect(detail.issues).toEqual([]);
      Vitest.expect(detail.counts.pending).toBe(2);
      Vitest.expect(detail.phases).toHaveLength(1);
      Vitest.expect(detail.phases[0]?.phase).toBe('A');
      Vitest.expect(detail.phases[0]?.tasks.map((entry) => entry.id).toSorted()).toEqual([
        'A001',
        'A099',
      ]);
    }),
  );

  Vitest.it.effect('links a complete review task to its phase rounds across both series', () =>
    Effect.gen(function* () {
      const root = makeRoot(true);
      const detail = yield* cleaned(root, Specs.loadSpec(root, 'mock-reviewed'));
      Vitest.expect(detail.summary.valid).toBe(true);
      Vitest.expect(detail.issues).toEqual([]);
      Vitest.expect(detail.state).toBe('pending');
    }),
  );

  Vitest.it.effect('reports a missing profile series round as a review-series issue', () =>
    Effect.gen(function* () {
      const root = makeRoot(true);
      rmSync(join(root, '.agents', '@montflow', 'reviews', 'mock-reviewed-effect-reviewer'), {
        recursive: true,
        force: true,
      });
      const detail = yield* cleaned(root, Specs.loadSpec(root, 'mock-reviewed'));
      Vitest.expect(detail.summary.valid).toBe(false);
      Vitest.expect(detail.issues).toContainEqual(
        Vitest.expect.objectContaining({
          field: 'review-series',
          message: Vitest.expect.stringContaining('mock-reviewed-effect-reviewer'),
        }),
      );
    }),
  );

  Vitest.it.effect('reads a missing store as an empty list', () =>
    Effect.gen(function* () {
      const rows = yield* Specs.fetchSpecs('/definitely-not-a-workspace');
      Vitest.expect(rows).toEqual([]);
    }),
  );
});
