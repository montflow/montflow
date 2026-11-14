/** Stable code for a v2 in-progress phase whose memory lacks the execution brief. */
export const EXECUTION_BRIEF_MISSING_CODE = 'phase.execution-brief-missing';

/** The phase-memory section that carries the lean execution contract. */
export const EXECUTION_BRIEF_SECTION = 'Execution Brief';

/** The five elements every execution brief must name. */
export const EXECUTION_BRIEF_ELEMENTS = [
  'Read',
  'Write scope',
  'Gate',
  'Record',
  'Review',
] as const;

/** One execution brief's readability: present, which elements are missing, valid. */
export interface ExecutionBriefStatus {
  /** True when the `## Execution Brief` heading exists. */
  readonly present: boolean;
  /** Named elements the section does not carry, in contract order. */
  readonly missing: ReadonlyArray<string>;
  /** True only when the section exists and names every element. */
  readonly valid: boolean;
}

/** The body of a level-2 section, up to the next level-2 heading. */
const sectionBody = (markdown: string, heading: string): string | undefined => {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const found = new RegExp(`^##\\s+${heading}\\s*$`, 'm').exec(normalized);
  if (found === null) return undefined;
  const rest = normalized.slice(found.index + found[0].length);
  const next = /^##\s+/m.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
};

/** A bullet whose label is `label`, bolded or plain: `- Read:` or `- **Read**:`. */
const briefElement = (label: string): RegExp =>
  new RegExp(
    `^\\s*[-*]\\s*(?:\\*\\*)?${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\*\\*)?\\s*:`,
    'im',
  );

/**
 * Read one phase memory's execution brief: present, missing named elements, and
 * whether it carries all five. A bare heading or a stub with no labelled
 * bullets is not a valid brief.
 * @param memory - raw phase `MEMORY.md` contents
 * @returns the brief's status
 */
export const executionBriefStatus = (memory: string): ExecutionBriefStatus => {
  const body = sectionBody(memory, EXECUTION_BRIEF_SECTION);
  if (body === undefined) {
    return { present: false, missing: [...EXECUTION_BRIEF_ELEMENTS], valid: false };
  }
  const missing = EXECUTION_BRIEF_ELEMENTS.filter((label) => !briefElement(label).test(body));
  return { present: true, missing, valid: missing.length === 0 };
};
