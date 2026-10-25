/** SPEC.md fixture builder for the spec module tests. */

export interface TaskRowFixture {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly gates: string;
}

export interface SpecFixture {
  readonly name?: string;
  readonly status?: string;
  readonly workspaceType?: string;
  readonly author?: string;
  readonly created?: string;
  readonly lockedPhases?: string;
  readonly rows?: ReadonlyArray<TaskRowFixture>;
}

const DEFAULT_ROWS: ReadonlyArray<TaskRowFixture> = [
  { id: 'A001', name: 'implement-login', type: 'execution', status: 'pending', gates: 'No' },
  { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
];

/** Build a SPEC.md body with valid defaults and optional overrides. */
export const specMarkdown = (fixture: SpecFixture = {}): string => {
  const rows = fixture.rows ?? DEFAULT_ROWS;
  return [
    '---',
    `name: ${fixture.name ?? 'ship-spec'}`,
    `status: ${fixture.status ?? 'in-progress'}`,
    `workspace-type: ${fixture.workspaceType ?? 'in-place'}`,
    `author: ${fixture.author ?? 'Tester'}`,
    `created: ${fixture.created ?? '2026-01-01'}`,
    `locked-phases: ${fixture.lockedPhases ?? ''}`,
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
    '|---|---|---|---|---|',
    ...rows.map(
      (row) => `| ${row.id} | ${row.name} | ${row.type} | ${row.status} | ${row.gates} |`,
    ),
    '',
  ].join('\n');
};
