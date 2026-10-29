import { type Issue, type Result, finding, issue, noErrors } from '../verify/index.js';

/** Stable code for a complete task whose gate holds no checked item. */
export const GATE_UNCHECKED_CODE = 'gate.unchecked';

/** One parsed GATES.md checklist item. */
export interface GateItem {
  /** Item label after `- [ ]` / `- [x]`. */
  readonly text: string;
  /** True when the box is checked (`- [x]`). */
  readonly checked: boolean;
}

/** One parsed GATES.md stage: its heading and checkbox items. */
export interface GateStage {
  /** Heading text after `## `, e.g. `Stage 0: Core Validation`. */
  readonly heading: string;
  /** Checklist items, in order. */
  readonly items: ReadonlyArray<GateItem>;
}

const STAGE_HEADING = /^##\s+(.+)$/;
const CHECKBOX_ITEM = /^-\s+\[([ xX])\]\s*(.*)$/;

/** Placeholder markers left in unfilled templates. */
const PLACEHOLDER = /[<>]/;

/**
 * Parse a GATES.md body into stages and their checkbox items. Items that
 * appear before any `##` heading are ignored.
 * @param markdown - raw GATES.md contents
 * @returns one entry per `##` heading, in file order
 */
export const parseGates = (markdown: string): ReadonlyArray<GateStage> => {
  const stages: Array<{ heading: string; items: Array<GateItem> }> = [];
  let current: { heading: string; items: Array<GateItem> } | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    const heading = STAGE_HEADING.exec(trimmed);
    if (heading !== null) {
      current = { heading: (heading[1] ?? '').trim(), items: [] };
      stages.push(current);
      continue;
    }
    const item = CHECKBOX_ITEM.exec(trimmed);
    if (item !== null && current !== undefined) {
      current.items.push({ text: (item[2] ?? '').trim(), checked: (item[1] ?? ' ') !== ' ' });
    }
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
      if (item.text === '') {
        issues.push(issue(stage.heading, 'Checklist item is empty.'));
      } else if (PLACEHOLDER.test(item.text)) {
        issues.push(issue(stage.heading, `Checklist item is still a placeholder: '${item.text}'.`));
      }
    }
  }
  if (stages.length > 0 && itemCount === 0) {
    issues.push(issue('body', 'No checklist items (`- [ ]`) found.'));
  }
  return { valid: noErrors(issues), issues };
};

/**
 * The gate-progress rule on its own: a task that claims `complete` must show at
 * least one checked gate item. An all-unchecked `GATES.md` is a record
 * contradiction — the task says its verification ran and the gate records no
 * result — so it is a warning, never an error. A task with no `GATES.md`, or a
 * `GATES.md` with no items, is `verifyGatesFile`'s concern, not this rule's.
 * @param markdown - raw GATES.md contents
 * @param complete - true when the task declares `status: complete`
 * @returns the findings, in reporting order
 */
export const verifyGateProgress = (markdown: string, complete: boolean): Result => {
  if (!complete) return { valid: true, issues: [] };
  const items = parseGates(markdown).flatMap((stage) => stage.items);
  if (items.length === 0 || items.some((item) => item.checked)) {
    return { valid: true, issues: [] };
  }
  return {
    valid: true,
    issues: [
      finding({
        code: GATE_UNCHECKED_CODE,
        severity: 'warning',
        field: 'gate',
        message: `Completed task has ${items.length} gate ${items.length === 1 ? 'item' : 'items'} and none checked; the gate records no verification result.`,
        expected: 'at least one checked gate item (`- [x]`)',
        actual: `${items.length} unchecked`,
        fix: 'Run the gate and check each item that passed, or set `status: in-progress`.',
      }),
    ],
  };
};
