/** TASK.md / MEMORY.md fixture builders for the task module tests. */

export interface TaskFixture {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
  readonly originator?: string;
  readonly dependsOn?: string;
  readonly relatedTasks?: string;
  readonly findingRef?: string;
  readonly status?: string;
}

/** Build a TASK.md body with valid defaults and optional overrides. */
export const taskMarkdown = (fixture: TaskFixture): string => {
  const type = fixture.type ?? 'execution';
  const front = [
    '---',
    `id: ${fixture.id}`,
    `name: ${fixture.name}`,
    `type: ${type}`,
    `originator: ${fixture.originator ?? 'user'}`,
    `depends-on: ${fixture.dependsOn ?? ''}`,
    `related-tasks: ${fixture.relatedTasks ?? ''}`,
  ];
  if (fixture.findingRef !== undefined) front.push(`finding-ref: ${fixture.findingRef}`);
  front.push(`status: ${fixture.status ?? 'pending'}`, '---');
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
    '- [ ] Done',
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
