import { parseMarkdown } from '../frontmatter/index.js';
import { TIER_CONTRACT, type Tier, tierOrUndefined } from '../tier/index.js';

/** Heading of the creation record `init` writes into SPEC.md. */
export const CREATION_HEADING = 'Creation';

/** One creation record read from a SPEC.md body. */
export interface Creation {
  /** The appraiser's chosen tier, when the record names a known one. */
  readonly tier: Tier | undefined;
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
 * an unknown tier reads as no tier so a generator refuses rather than guesses.
 * @param markdown - raw SPEC.md contents
 * @returns the parsed creation record
 */
export const creationOf = (markdown: string): Creation => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) return { tier: undefined, questions: undefined, unresolved: undefined };
  let tier: Tier | undefined;
  let questions: Creation['questions'];
  let unresolved: string | undefined;
  for (const raw of sectionLines(parsed.body, CREATION_HEADING)) {
    const line = raw.replace(/^\s*-\s*/, '').trim();
    const tierMatch = /^tier:\s*(\S+)$/.exec(line);
    if (tierMatch !== null) {
      tier = tierOrUndefined(tierMatch[1]);
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
  return { tier, questions, unresolved };
};

/**
 * The tier a SPEC.md `## Creation` record declares.
 * @param markdown - raw SPEC.md contents
 * @returns the tier, or undefined when the record is absent or unknown
 */
export const tierOfSpec = (markdown: string): Tier | undefined => creationOf(markdown).tier;

/** The self-reported question budget for a tier. */
export const questionBudget = (tier: Tier): number => TIER_CONTRACT[tier].interaction;

/**
 * Render the `## Creation` body section, including its heading. The initial
 * question count is always `0/<budget>`: the creation run owns updating it.
 * @param tier - the chosen tier
 * @param unresolved - a user-owned decision the run stopped on; defaults to `none`
 * @returns the markdown section
 */
export const renderCreationSection = (tier: Tier, unresolved = 'none'): string =>
  [
    `## ${CREATION_HEADING}`,
    '',
    `- tier: ${tier}`,
    `- questions 0/${questionBudget(tier)}`,
    `- unresolved: ${unresolved.trim() === '' ? 'none' : unresolved.trim()}`,
    '',
  ].join('\n');
