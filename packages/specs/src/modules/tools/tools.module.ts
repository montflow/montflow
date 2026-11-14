import { type Issue, type Result, finding } from '../verify/index.js';

/**
 * The workspace `AGENTS.md` `## Tools` section: which CLI utilities this repo
 * offers and what each one answers.
 *
 * Derived state that a reader needs (spec status, next task, locks) lives
 * behind a CLI, not in a file signature, so the workspace rules name the
 * binaries and one line for each. This module owns that table's shape, the
 * check that reports a missing or stale section, and the repair that writes it.
 */

/** Workspace file that carries the tools contract. */
export const AGENTS_FILE = 'AGENTS.md';

/** Level-2 heading that names the tools section. */
export const TOOLS_HEADING = 'Tools';

/** Table header cells, in order. */
export const TOOL_COLUMNS = ['CLI', 'Description'] as const;

/** Stable codes for the tools-section findings. */
export const CODES = {
  missing: 'agents.tools-missing',
  noTable: 'agents.tools-no-table',
  missingRow: 'agents.tools-missing-row',
  emptyDescription: 'agents.tools-empty-description',
} as const;

/** The command that writes the section and the command that only reports. */
export const REPAIR_COMMAND = 'mf-specs tools';
export const CHECK_COMMAND = 'mf-specs tools --check';

/** One CLI a reader can run in this workspace. */
export interface CliTool {
  /** The binary name, as typed. */
  readonly binary: string;
  /** One line: what the binary answers, not how it is installed. */
  readonly description: string;
}

/**
 * The CLI utilities the tools section must list.
 *
 * This package owns the specs entry; every other package's entry lands here
 * when its owner adds it, so the table never claims a binary the repo does not
 * ship.
 */
export const CLI_TOOLS: ReadonlyArray<CliTool> = [
  {
    binary: 'mf-specs',
    description:
      'Spec tree truth: `status`, `state`, `next`, `list`, `check`, and `doctor`. Ask it before reading spec files.',
  },
];

/** Line span of a level-2 section: `start` is the heading line, `end` is exclusive. */
export interface Section {
  readonly start: number;
  readonly end: number;
}

/** One parsed table row: its zero-based line index and its cells. */
interface Row {
  readonly index: number;
  readonly cells: ReadonlyArray<string>;
}

/** A line that is part of a pipe table. */
const isTableLine = (line: string): boolean => line.trimStart().startsWith('|');

/** Split one pipe-table line into trimmed cells, without the outer pipes. */
const cellsOf = (line: string): ReadonlyArray<string> =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** Strip one pair of surrounding backticks from a cell. */
const unquote = (cell: string): string => {
  const trimmed = cell.trim();
  if (trimmed.length < 2) return trimmed;
  if (!trimmed.startsWith('`') || !trimmed.endsWith('`')) return trimmed;
  return trimmed.slice(1, -1);
};

/** The header row: exactly the two required columns, in order, case-insensitive. */
const isTableHeader = (line: string): boolean => {
  const cells = cellsOf(line);
  return (
    cells.length === TOOL_COLUMNS.length &&
    cells.every((cell, index) => cell.toLowerCase() === TOOL_COLUMNS[index]?.toLowerCase())
  );
};

/** The `| --- | --- |` separator row. */
const isSeparator = (line: string): boolean => {
  const cells = cellsOf(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
};

/** A data row: a table line that is neither the header nor the separator. */
const isDataRow = (line: string): boolean =>
  isTableLine(line) && !isTableHeader(line) && !isSeparator(line);

/** Split a markdown document into lines, keeping a trailing empty line. */
const linesOf = (markdown: string): ReadonlyArray<string> => markdown.split('\n');

/** Locate a level-2 section by heading text, ignoring h3 and deeper. */
const sectionAt = (lines: ReadonlyArray<string>, heading: string): Section | undefined => {
  const start = lines.findIndex((line) => line.trimEnd() === `## ${heading}`);
  if (start === -1) return undefined;
  let end = start + 1;
  while (end < lines.length && !(lines[end] ?? '').startsWith('## ')) end += 1;
  return { start, end };
};

/** The tools section's normal form: one heading, one two-column table. */
const canonicalLines = (tools: ReadonlyArray<CliTool>): ReadonlyArray<string> => [
  `## ${TOOLS_HEADING}`,
  '',
  `| ${TOOL_COLUMNS[0]} | ${TOOL_COLUMNS[1]} |`,
  '| --- | --- |',
  ...tools.map((tool) => `| \`${tool.binary}\` | ${tool.description} |`),
  '',
];

/** Render the canonical tools section, newline-terminated. */
export const renderToolsSection = (tools: ReadonlyArray<CliTool> = CLI_TOOLS): string =>
  canonicalLines(tools).join('\n');

/** Locate the tools section in a document. */
export const toolsSection = (markdown: string): Section | undefined =>
  sectionAt(linesOf(markdown), TOOLS_HEADING);

/** Parse the data rows of a line range, keeping each row's absolute index. */
const rowsIn = (lines: ReadonlyArray<string>, section: Section): ReadonlyArray<Row> => {
  const rows: Array<Row> = [];
  for (let index = section.start; index < section.end; index += 1) {
    const line = lines[index] ?? '';
    if (isDataRow(line)) rows.push({ index, cells: cellsOf(line) });
  }
  return rows;
};

/** True when the section carries the required two-column header. */
const hasTableHeader = (lines: ReadonlyArray<string>, section: Section): boolean => {
  for (let index = section.start; index < section.end; index += 1) {
    if (isTableHeader(lines[index] ?? '')) return true;
  }
  return false;
};

/** One finding that the section must be repaired. */
const repairFinding = (input: {
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly expected: string;
  readonly actual: string;
  readonly line?: number;
}): Issue => {
  const base = {
    code: input.code,
    field: input.field,
    message: input.message,
    expected: input.expected,
    actual: input.actual,
    fix: `Run \`${REPAIR_COMMAND}\` to write the section.`,
  };
  return input.line === undefined ? finding(base) : finding({ ...base, line: input.line });
};

/**
 * Check that `AGENTS.md` carries a `## Tools` section with the required table
 * and one described row per known CLI. Extra rows for binaries this module does
 * not know are allowed.
 * @param markdown - raw `AGENTS.md` contents
 * @param tools - the CLIs the section must list; defaults to {@link CLI_TOOLS}
 * @returns the result; `valid` is true only with zero findings
 */
export const verifyAgentsTools = (
  markdown: string,
  tools: ReadonlyArray<CliTool> = CLI_TOOLS,
): Result => {
  const lines = linesOf(markdown);
  const section = sectionAt(lines, TOOLS_HEADING);
  if (section === undefined) {
    return {
      valid: false,
      issues: [
        repairFinding({
          code: CODES.missing,
          field: AGENTS_FILE,
          message: `${AGENTS_FILE} has no '## ${TOOLS_HEADING}' section.`,
          expected: `a '## ${TOOLS_HEADING}' section with a '| ${TOOL_COLUMNS[0]} | ${TOOL_COLUMNS[1]} |' table`,
          actual: 'no section',
        }),
      ],
    };
  }
  if (!hasTableHeader(lines, section)) {
    return {
      valid: false,
      issues: [
        repairFinding({
          code: CODES.noTable,
          field: `## ${TOOLS_HEADING}`,
          message: `The '## ${TOOLS_HEADING}' section has no '| ${TOOL_COLUMNS[0]} | ${TOOL_COLUMNS[1]} |' table header.`,
          expected: `'| ${TOOL_COLUMNS[0]} | ${TOOL_COLUMNS[1]} |' followed by a separator row`,
          actual: 'no header row',
          line: section.start + 1,
        }),
      ],
    };
  }
  const rows = rowsIn(lines, section);
  const issues: Array<Issue> = [];
  for (const tool of tools) {
    const row = rows.find((entry) => unquote(entry.cells[0] ?? '') === tool.binary);
    if (row === undefined) {
      issues.push(
        repairFinding({
          code: CODES.missingRow,
          field: `## ${TOOLS_HEADING}`,
          message: `The tools table does not list '${tool.binary}'.`,
          expected: `a row named '${tool.binary}' with a description`,
          actual: 'no row',
          line: section.start + 1,
        }),
      );
      continue;
    }
    if ((row.cells[1] ?? '') === '') {
      issues.push(
        repairFinding({
          code: CODES.emptyDescription,
          field: `## ${TOOLS_HEADING}`,
          message: `The tools row for '${tool.binary}' has an empty description cell.`,
          expected: 'one line saying what the binary answers',
          actual: 'empty cell',
          line: row.index + 1,
        }),
      );
    }
  }
  return { valid: issues.length === 0, issues };
};

/** Drop trailing blank lines from the end of a list. */
const trimTrailingBlank = (lines: ReadonlyArray<string>): ReadonlyArray<string> => {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return lines.slice(0, end);
};

/** Drop leading blank lines from the start of a list. */
const trimLeadingBlank = (lines: ReadonlyArray<string>): ReadonlyArray<string> => {
  let start = 0;
  while (start < lines.length && (lines[start] ?? '').trim() === '') start += 1;
  return lines.slice(start);
};

/** Where a new tools section goes: after `## Commands` when present, else EOF. */
const insertionPoint = (lines: ReadonlyArray<string>): number => {
  const commands = sectionAt(lines, 'Commands');
  return commands === undefined ? lines.length : commands.end;
};

/**
 * Write the canonical tools section. A missing section is inserted after
 * `## Commands` (or appended at the end); an existing one is replaced, keeping
 * any row for a binary this module does not know, so repair never deletes a
 * workspace's own tool entry.
 * @param markdown - raw `AGENTS.md` contents
 * @param tools - the CLIs the section must list; defaults to {@link CLI_TOOLS}
 * @returns the repaired document, newline-terminated
 */
export const addToolsSection = (
  markdown: string,
  tools: ReadonlyArray<CliTool> = CLI_TOOLS,
): string => {
  const lines = linesOf(markdown);
  const canonical = canonicalLines(tools);
  const section = sectionAt(lines, TOOLS_HEADING);
  if (section === undefined) {
    const at = insertionPoint(lines);
    const before = trimTrailingBlank(lines.slice(0, at));
    const after = trimLeadingBlank(lines.slice(at));
    return [...before, '', ...canonical, ...after].join('\n');
  }
  const known = new Set(tools.map((tool) => tool.binary));
  const extras = lines
    .slice(section.start, section.end)
    .filter(isDataRow)
    .filter((line) => !known.has(unquote(cellsOf(line)[0] ?? '')))
    .map((line) => line.trim());
  const body = [...canonical.slice(0, -1), ...extras, ''];
  const after = trimLeadingBlank(lines.slice(section.end));
  return [...lines.slice(0, section.start), ...body, ...after].join('\n');
};
