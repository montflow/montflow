import { type Issue, type Result, hasSection, issue, noErrors } from '../verify/index.js';

/**
 * Sections every MEMORY.md must carry, in order. A task memory adds `Findings`
 * and `Gates`; a phase memory adds `Execution Brief` instead.
 */
export const MEMORY_SECTIONS = [
  'Context',
  'Progress',
  'Open Questions',
  'Handoff',
  'Deviations',
] as const;

/** Render the fixed `MEMORY.md` template every task directory carries. */
export const renderTaskMemory = (): string =>
  [
    '# Memory',
    '',
    '## Context',
    '',
    'None yet.',
    '',
    '## Progress',
    '',
    '- pending',
    '',
    '## Findings',
    '',
    '- None yet.',
    '',
    '## Gates',
    '',
    '- None yet.',
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

/**
 * Mechanically verify a MEMORY.md file: non-empty, a `# Memory` title,
 * and the template's sections (`Context`, `Progress`, `Open Questions`,
 * `Handoff`, `Deviations`). `## Review Loop Counter` and other extra
 * sections are allowed. Pure — no IO.
 * @param markdown - raw MEMORY.md contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyMemoryFile = (markdown: string): Result => {
  if (markdown.trim() === '') {
    return { valid: false, issues: [issue('body', 'MEMORY.md is empty.')] };
  }
  const issues: Array<Issue> = [];
  if (!/^#\s+Memory\s*$/m.test(markdown)) {
    issues.push(issue('title', 'Missing `# Memory` title.'));
  }
  for (const section of MEMORY_SECTIONS) {
    if (!hasSection(markdown, section)) {
      issues.push(issue('body', `Missing \`## ${section}\` section.`));
    }
  }
  return { valid: noErrors(issues), issues };
};
