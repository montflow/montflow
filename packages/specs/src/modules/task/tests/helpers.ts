/** TASK.md / MEMORY.md fixture builders for the task module tests. */

export interface TaskFixture {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
  readonly originator?: string;
  readonly dependsOn?: string;
  readonly relatedTasks?: string;
  readonly reviewerProfiles?: string;
  readonly findingRef?: string;
  readonly size?: string;
  /** Omit the `size` line entirely, to exercise the missing-size rules. */
  readonly withoutSize?: boolean;
  readonly status?: string;
  /** Replaces the `## Completion` checklist body (default: one box, checked when complete). */
  readonly completion?: string;
}

/** Build a TASK.md body with valid defaults and optional overrides. */
export const taskMarkdown = (fixture: TaskFixture): string => {
  const type = fixture.type ?? 'execution';
  const status = fixture.status ?? 'pending';
  const front = [
    '---',
    `id: ${fixture.id}`,
    `name: ${fixture.name}`,
    `type: ${type}`,
    `originator: ${fixture.originator ?? 'user'}`,
    ...(fixture.withoutSize === true ? [] : [`size: ${fixture.size ?? 'medium'}`]),
    `depends-on: ${fixture.dependsOn ?? ''}`,
    `related-tasks: ${fixture.relatedTasks ?? ''}`,
  ];
  if (fixture.reviewerProfiles !== undefined) {
    front.push(`reviewer-profiles: ${fixture.reviewerProfiles}`);
  }
  if (fixture.findingRef !== undefined) front.push(`finding-ref: ${fixture.findingRef}`);
  front.push(`status: ${status}`, '---');
  return [
    ...front,
    '',
    `# Task ${fixture.id}: ${fixture.name}`,
    '',
    `## Type: ${type}`,
    '',
    '## Description',
    '',
    'Do the work.',
    '',
    '## Requirements',
    '',
    '- Works.',
    '',
    '## Completion',
    '',
    fixture.completion ?? (status === 'complete' ? '- [x] Done' : '- [ ] Done'),
    '',
  ].join('\n');
};

/** Build a MEMORY.md body with the template's sections. */
export const memoryMarkdown = (): string =>
  [
    '# Memory',
    '',
    '## Context',
    '',
    'Stuff.',
    '',
    '## Progress',
    '',
    '- 2026-01-01: pending',
    '',
    '## Open Questions',
    '',
    '- None.',
    '',
    '## Handoff',
    '',
    '- See TASK.md.',
    '',
    '## Deviations',
    '',
    '- None.',
    '',
  ].join('\n');
