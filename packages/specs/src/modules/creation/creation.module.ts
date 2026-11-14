import { parseMarkdown } from '../frontmatter/index.js';
import { RIGOR_CONTRACT, type Rigor, rigorOrUndefined } from '../rigor/index.js';

/** Heading of the creation record `init` writes into SPEC.md. */
export const CREATION_HEADING = 'Creation';

/** One creation record read from a SPEC.md body. */
export interface Creation {
  /** The rigor the record names, when it names a known one. */
  readonly rigor: Rigor | undefined;
  /** The raw value the record names, even when it is not a known rigor. */
  readonly declaredRigor: string | undefined;
  /** The level the user raised the rigor from, when the record carries one. */
  readonly raisedFrom: Rigor | undefined;
  /** The raw `raised-from` value, even when it is not a known rigor. */
  readonly declaredRaisedFrom: string | undefined;
  /** The creation run's self-reported question count and its budget. */
  readonly questions: { readonly count: number; readonly budget: number } | undefined;
  /** Any user-owned decision the run stopped on, or `none`. */
  readonly unresolved: string | undefined;
}

/** Extract the lines of one `## <heading>` section from a markdown body. */
const sectionLines = (body: string, heading: string): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  let inside = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^##\s+\S/.test(line)) {
      inside = line.trim() === `## ${heading}`;
      continue;
    }
    if (inside) lines.push(line);
  }
  return lines;
};

/**
 * Parse the `## Creation` record. A missing section yields every field absent;
 * an unknown rigor reads as no rigor so a generator refuses rather than guesses.
 * A legacy `tier:` line is inert and never read.
 * @param markdown - raw SPEC.md contents
 * @returns the parsed creation record
 */
export const creationOf = (markdown: string): Creation => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) {
    return {
      rigor: undefined,
      declaredRigor: undefined,
      raisedFrom: undefined,
      declaredRaisedFrom: undefined,
      questions: undefined,
      unresolved: undefined,
    };
  }
  let rigor: Rigor | undefined;
  let declaredRigor: string | undefined;
  let raisedFrom: Rigor | undefined;
  let declaredRaisedFrom: string | undefined;
  let questions: Creation['questions'];
  let unresolved: string | undefined;
  for (const raw of sectionLines(parsed.body, CREATION_HEADING)) {
    const line = raw.replace(/^\s*-\s*/, '').trim();
    const rigorMatch = /^rigor:\s*(.*)$/.exec(line);
    if (rigorMatch !== null) {
      const value = (rigorMatch[1] ?? '').trim();
      const parsedRigor = /^(\S+)(?:\s+\(raised-from\s+(\S+)\))?$/.exec(value);
      if (parsedRigor === null) {
        // A malformed record is unknown, never absent: the verifier reports it.
        declaredRigor = value;
        rigor = undefined;
        raisedFrom = undefined;
        declaredRaisedFrom = undefined;
        continue;
      }
      const level = parsedRigor[1] ?? '';
      const raised = parsedRigor[2];
      declaredRigor = level;
      rigor = rigorOrUndefined(level);
      if (raised !== undefined) {
        declaredRaisedFrom = raised;
        raisedFrom = rigorOrUndefined(raised);
        if (raisedFrom === undefined) {
          // An unknown `raised-from` value makes the whole record unparseable.
          declaredRigor = value;
          rigor = undefined;
        }
      }
      continue;
    }
    const questionsMatch = /^questions\s+(\d+)\s*\/\s*(\d+)$/.exec(line);
    if (questionsMatch !== null) {
      questions = {
        count: Number(questionsMatch[1]),
        budget: Number(questionsMatch[2]),
      };
      continue;
    }
    const unresolvedMatch = /^unresolved:\s*(.+)$/.exec(line);
    if (unresolvedMatch !== null) unresolved = (unresolvedMatch[1] ?? '').trim();
  }
  return { rigor, declaredRigor, raisedFrom, declaredRaisedFrom, questions, unresolved };
};

/**
 * The rigor a SPEC.md `## Creation` record declares.
 * @param markdown - raw SPEC.md contents
 * @returns the rigor, or undefined when the record is absent or unknown
 */
export const rigorOfSpec = (markdown: string): Rigor | undefined => creationOf(markdown).rigor;

/**
 * The raw rigor token a SPEC.md `## Creation` record names, even when it is
 * unknown. A typo is reported as `rigor.unknown`, so a reader can tell a
 * missing record from an unrecognised value.
 * @param markdown - raw SPEC.md contents
 * @returns the declared token, or undefined when the record names none
 */
export const declaredRigorOfSpec = (markdown: string): string | undefined =>
  creationOf(markdown).declaredRigor;

/**
 * The level a SPEC.md `## Creation` record was raised from, when the accepted
 * escalation recorded `rigor: <new> (raised-from <old>)`.
 * @param markdown - raw SPEC.md contents
 * @returns the base level, or undefined when the record carries none or is malformed
 */
export const raisedFromOfSpec = (markdown: string): Rigor | undefined =>
  creationOf(markdown).raisedFrom;

/** The self-reported question budget for a rigor level. */
export const questionBudget = (rigor: Rigor): number => RIGOR_CONTRACT[rigor].interaction;

/**
 * Render the `## Creation` body section, including its heading. The initial
 * question count is always `0/<budget>`: the creation run owns updating it.
 * @param rigor - the chosen rigor level
 * @param unresolved - a user-owned decision the run stopped on; defaults to `none`
 * @returns the markdown section
 */
export const renderCreationSection = (rigor: Rigor, unresolved = 'none'): string =>
  [
    `## ${CREATION_HEADING}`,
    '',
    `- rigor: ${rigor}`,
    `- questions 0/${questionBudget(rigor)}`,
    `- unresolved: ${unresolved.trim() === '' ? 'none' : unresolved.trim()}`,
    '',
  ].join('\n');
