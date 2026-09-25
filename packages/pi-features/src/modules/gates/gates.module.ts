import { type Issue, type Result, issue } from '../verify/index.js';

/** One parsed GATES.md stage: its heading and checkbox items. */
export interface GateStage {
  /** Heading text after `## `, e.g. `Stage 0: Core Validation`. */
  readonly heading: string;
  /** Checklist item labels after `- [ ]` / `- [x]`, in order. */
  readonly items: ReadonlyArray<string>;
}

const STAGE_HEADING = /^##\s+(.+)$/;
const CHECKBOX_ITEM = /^-\s+\[[ xX]\]\s*(.*)$/;

/** Placeholder markers left in unfilled templates. */
const PLACEHOLDER = /[<>]/;

/**
 * Parse a GATES.md body into stages and their checkbox items. Items that
 * appear before any `##` heading are ignored.
 * @param markdown - raw GATES.md contents
 * @returns one entry per `##` heading, in file order
 */
export const parseGates = (markdown: string): ReadonlyArray<GateStage> => {
  const stages: Array<{ heading: string; items: Array<string> }> = [];
  let current: { heading: string; items: Array<string> } | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    const heading = STAGE_HEADING.exec(trimmed);
    if (heading !== null) {
      current = { heading: (heading[1] ?? '').trim(), items: [] };
      stages.push(current);
      continue;
    }
    const item = CHECKBOX_ITEM.exec(trimmed);
    if (item !== null && current !== undefined) current.items.push((item[1] ?? '').trim());
  }
  return stages;
};

/**
 * Mechanically verify a GATES.md file: non-empty, at least one `## Stage`
 * heading, at least one checkbox item, no empty stage, and no unfilled
 * `<placeholder>` items. Pure — no IO. The *content* of the checks (do
 * they match the task?) stays a review concern.
 * @param markdown - raw GATES.md contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyGatesFile = (markdown: string): Result => {
  if (markdown.trim() === '') {
    return { valid: false, issues: [issue('body', 'GATES.md is empty.')] };
  }
  const issues: Array<Issue> = [];
  const stages = parseGates(markdown);
  if (stages.length === 0) {
    issues.push(issue('body', 'Missing a `## <Stage>` heading.'));
  }
  let itemCount = 0;
  for (const stage of stages) {
    if (stage.items.length === 0) {
      issues.push(issue(stage.heading, 'Stage has no checklist items (`- [ ] <check>`).'));
      continue;
    }
    for (const item of stage.items) {
      itemCount++;
      if (item === '') {
        issues.push(issue(stage.heading, 'Checklist item is empty.'));
      } else if (PLACEHOLDER.test(item)) {
        issues.push(issue(stage.heading, `Checklist item is still a placeholder: '${item}'.`));
      }
    }
  }
  if (stages.length > 0 && itemCount === 0) {
    issues.push(issue('body', 'No checklist items (`- [ ]`) found.'));
  }
  return { valid: issues.length === 0, issues };
};
