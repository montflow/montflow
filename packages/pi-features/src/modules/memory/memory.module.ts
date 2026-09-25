import { type Issue, type Result, hasSection, issue } from '../verify/index.js';

/** Sections the MEMORY.md template defines, in order. */
export const MEMORY_SECTIONS = [
  'Context',
  'Progress',
  'Open Questions',
  'Handoff',
  'Deviations',
] as const;

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
  return { valid: issues.length === 0, issues };
};
