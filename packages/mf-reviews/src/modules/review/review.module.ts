/**
 * The review artifact standard: a *series* directory per target, a *round*
 * directory per review pass, and the `REVIEW.md` file each holds.
 *
 * On disk:
 *
 *   .agents/@montflow/reviews/<name>/REVIEW.md   # series ledger (index)
 *   .agents/@montflow/reviews/<name>/<NNN>/REVIEW.md  # one round's findings
 *
 * The shape is optimized for agents: every value is a `- Key: value` line or a
 * table cell, headings are stable, and a whole series can be read from the
 * ledger without opening a single round. `parseRound` / `parseSeries` read the
 * shape, `verifyRoundFile` / `verifySeriesFile` are the pure mechanical checks
 * `mf-reviews verify` runs, and `renderRound` / `renderSeries` are the
 * scaffolds `mf-reviews new` writes.
 *
 * The module is pure — no filesystem. The store owns IO; the engines own
 * cross-file consistency.
 */

/** File name of both the series ledger and each round file. */
export const FILE_NAME = 'REVIEW.md';

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * True when `name` is a valid series slug (lowercase, hyphen-separated).
 * @param name - candidate slug
 * @returns true for valid slugs
 */
export const isValidName = (name: string): boolean => SLUG_PATTERN.test(name);

/**
 * Lowercase and convert any run of non-alphanumerics into a single hyphen,
 * trimming leading/trailing hyphens.
 * @param name - raw display name
 * @returns slugified name
 */
export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Round directory names are zero-padded three-digit numbers (`001`). */
export const ROUND_PATTERN = /^\d{3}$/;

/** A spec phase id: one or two uppercase letters (`A`, `AA`). */
export const PHASE_ID_PATTERN = /^[A-Z]{1,2}$/;

/**
 * Zero-pad a round number to its directory name.
 * @param round - positive round number
 * @returns the three-digit directory name
 */
export const formatRound = (round: number): string => String(round).padStart(3, '0');

/**
 * True when `round` is a three-digit round directory name.
 * @param round - candidate directory name
 * @returns true for valid round names
 */
export const isValidRound = (round: string): boolean => ROUND_PATTERN.test(round);

/**
 * Numeric value of a round directory name.
 * @param round - three-digit directory name
 * @returns its integer value
 */
export const roundNumber = (round: string): number => Number.parseInt(round, 10);

/** Finding severity, most severe first. */
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Nit'] as const;

/** A finding severity. */
export type Severity = (typeof SEVERITIES)[number];

/** Finding lifecycle status. */
export const FINDING_STATUSES = [
  'Open',
  'In Review',
  'Resolved',
  "Won't Fix",
  'Escalated',
] as const;

/** A finding lifecycle status. */
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** A round file's review type. */
export const REVIEW_TYPES = ['standalone', 're-review'] as const;

/** Open/closed state shared by a round and a series. */
export const OPEN_CLOSED = ['open', 'closed'] as const;

/** The fields every finding must declare. */
export const FINDING_FIELDS = [
  'Severity',
  'Location',
  'Status',
  'Attempts',
  'First Seen',
  'Problem',
  'Impact',
  'Suggestion',
] as const;

/** The metadata keys every round file must declare. */
export const ROUND_META_FIELDS = [
  'Target',
  'Round',
  'Type',
  'Isolation',
  'Max Attempts',
  'Status',
  'Created',
] as const;

/** The metadata keys every series ledger must declare. */
export const SERIES_META_FIELDS = ['Target', 'Status', 'Rounds', 'Created'] as const;

/** One mechanical check failure: which field broke, why, and how to fix it. */
export interface VerifyIssue {
  readonly field: string;
  readonly message: string;
  /** Concrete instruction for whoever authored the file. Omitted when none applies. */
  readonly fix?: string;
  /** 1-based file line, when the issue is located on one. */
  readonly line?: number;
}

/** Mechanical verification outcome for one review file. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/** A finding as parsed from a round file. Best-effort: absent fields become ''. */
export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly location: string;
  readonly status: string;
  readonly attempts: number;
  readonly firstSeen: number;
  readonly problem: string;
  readonly impact: string;
  readonly suggestion: string;
  readonly discussion: ReadonlyArray<string>;
}

/** A round file, parsed. */
export interface ParsedRound {
  readonly heading: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly findings: ReadonlyArray<Finding>;
  readonly summary: Readonly<Record<string, string>>;
  /** Non-finding prose under `## Findings` (e.g. a "no defects" note). */
  readonly note: string;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/** A row of the series `## Rounds` table. */
export interface RoundRow {
  readonly round: string;
  readonly status: string;
  readonly open: number;
  readonly inReview: number;
  readonly resolved: number;
  readonly wontFix: number;
  readonly escalated: number;
}

/** A row of the series `## Findings` index table. */
export interface FindingsRow {
  readonly round: string;
  readonly id: string;
  readonly severity: string;
  readonly status: string;
  readonly title: string;
}

/** A series ledger file, parsed. */
export interface ParsedSeries {
  readonly heading: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly rounds: ReadonlyArray<RoundRow>;
  readonly findings: ReadonlyArray<FindingsRow>;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/** One file's verification outcome, paired with its path for a report. */
export interface VerifyEntry {
  readonly path: string;
  readonly result: VerifyResult;
}

/** A `VerifyIssue` being filled in, so `fix` and `line` can stay absent. */
interface MutableIssue {
  field: string;
  message: string;
  fix?: string;
  line?: number;
}

const issue = (field: string, message: string, fix?: string, line?: number): VerifyIssue => {
  const found: MutableIssue = { field, message };
  if (fix !== undefined) found.fix = fix;
  if (line !== undefined) found.line = line;
  return found;
};

interface RawLine {
  readonly line: number;
  readonly text: string;
}

interface Section {
  readonly heading: string;
  readonly line: number;
  readonly body: ReadonlyArray<RawLine>;
}

const linesOf = (raw: string): ReadonlyArray<RawLine> =>
  raw.split('\n').map((text, index) => ({ line: index + 1, text: text.replace(/\r$/u, '') }));

/** The document's `# …` heading, or '' when absent. */
const headingOf = (lines: ReadonlyArray<RawLine>): string => {
  for (const entry of lines) {
    const match = /^#\s+(.*)$/u.exec(entry.text);
    if (match !== null) return (match[1] ?? '').trim();
  }
  return '';
};

/** Top-level (`## `) sections, each with its body lines. */
const topSections = (lines: ReadonlyArray<RawLine>): ReadonlyArray<Section> => {
  const sections: Array<{ heading: string; line: number; body: Array<RawLine> }> = [];
  let current: { heading: string; line: number; body: Array<RawLine> } | undefined;
  for (const entry of lines) {
    const match = /^##\s+(.*)$/u.exec(entry.text);
    if (match !== null) {
      if (current !== undefined) sections.push(current);
      current = { heading: (match[1] ?? '').trim(), line: entry.line, body: [] };
      continue;
    }
    if (current !== undefined) current.body.push(entry);
  }
  if (current !== undefined) sections.push(current);
  return sections;
};

/** `- Key: value` lines from a section body, first occurrence winning. */
const fieldMap = (body: ReadonlyArray<RawLine>) => {
  const fields: Record<string, string> = {};
  for (const entry of body) {
    const match = /^-\s*([^:]+?)\s*:\s*(.*)$/u.exec(entry.text);
    if (match === null) continue;
    const key = (match[1] ?? '').trim();
    if (key === '' || fields[key] !== undefined) continue;
    fields[key] = (match[2] ?? '').trim();
  }
  return fields;
};

/** The line a `- Key:` field sits on, for issue locations. */
const fieldLine = (body: ReadonlyArray<RawLine>, key: string): number | undefined => {
  for (const entry of body) {
    const match = /^-\s*([^:]+?)\s*:/u.exec(entry.text);
    if (match !== null && (match[1] ?? '').trim() === key) return entry.line;
  }
  return undefined;
};

/** A non-negative integer, or undefined when the text is not one. */
const nonNegativeInt = (value: string): number | undefined => {
  const trimmed = value.trim();
  return /^\d+$/u.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined;
};

/**
 * Data rows of the first markdown table in a body: header row included, the
 * `| --- |` separator dropped, every cell trimmed.
 */
const tableRows = (body: ReadonlyArray<RawLine>): ReadonlyArray<ReadonlyArray<string>> => {
  const rows: Array<ReadonlyArray<string>> = [];
  for (const entry of body) {
    if (!entry.text.trimStart().startsWith('|')) continue;
    const cells = entry.text
      .trim()
      .replace(/^\|/u, '')
      .replace(/\|$/u, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-+:?$/u.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
};

const isSeverity = (value: string): value is Severity =>
  SEVERITIES.some((severity) => severity === value);

const isFindingStatus = (value: string): value is FindingStatus =>
  FINDING_STATUSES.some((status) => status === value);

const isOpenClosed = (value: string): boolean => OPEN_CLOSED.some((state) => state === value);

/** A finding sub-heading: `### F1 — title`. */
const findingHeading = (
  text: string,
): { readonly id: string; readonly title: string } | undefined => {
  const match = /^###\s+(F\d+)\b\s*(.*)$/u.exec(text);
  if (match === null) return undefined;
  const title = (match[2] ?? '').replace(/^\s*[—–-]\s*/u, '').trim();
  return { id: match[1] ?? '', title };
};

/** Finding counts by lifecycle status. Mutable while accumulating. */
export interface StatusCounts {
  Open: number;
  'In Review': number;
  Resolved: number;
  "Won't Fix": number;
  Escalated: number;
}

/** Finding counts by severity. Mutable while accumulating. */
export interface SeverityCounts {
  Critical: number;
  Major: number;
  Minor: number;
  Nit: number;
}

/** Finding counts by lifecycle status, every status always present. */
export const statusCounts = (findings: ReadonlyArray<Finding>): StatusCounts => {
  const counts = {
    Open: 0,
    'In Review': 0,
    Resolved: 0,
    "Won't Fix": 0,
    Escalated: 0,
  } satisfies StatusCounts;
  for (const finding of findings) {
    if (isFindingStatus(finding.status)) counts[finding.status] += 1;
  }
  return counts;
};

/** Finding counts by severity, every severity always present. */
export const severityCounts = (findings: ReadonlyArray<Finding>): SeverityCounts => {
  const counts = { Critical: 0, Major: 0, Minor: 0, Nit: 0 } satisfies SeverityCounts;
  for (const finding of findings) {
    if (isSeverity(finding.severity)) counts[finding.severity] += 1;
  }
  return counts;
};

/** Parse the `## Findings` body into findings, the free-text note, and issues. */
const parseFindings = (body: ReadonlyArray<RawLine>) => {
  const findings: Array<Finding> = [];
  const issues: Array<VerifyIssue> = [];
  const notes: Array<string> = [];
  const seenIds = new Set<string>();
  let current:
    | {
        id: string;
        title: string;
        line: number;
        fields: Record<string, string>;
        fieldLines: Record<string, number>;
        discussion: Array<string>;
        inDiscussion: boolean;
        sawDiscussion: boolean;
      }
    | undefined;

  const flush = (): void => {
    if (current === undefined) return;
    const entry = current;
    current = undefined;
    if (seenIds.has(entry.id)) {
      issues.push(
        issue(
          'findings',
          `Finding id '${entry.id}' is used more than once.`,
          'Give every finding a unique F<n> id.',
          entry.line,
        ),
      );
    }
    seenIds.add(entry.id);
    if (entry.title === '') {
      issues.push(
        issue(
          'findings',
          `${entry.id} has no title.`,
          `Write '### ${entry.id} — <short title>'.`,
          entry.line,
        ),
      );
    }
    for (const field of FINDING_FIELDS) {
      const value = entry.fields[field];
      if (value === undefined || value === '') {
        issues.push(
          issue(
            'findings',
            `${entry.id} is missing '${field}'.`,
            `Add '- ${field}: …' under ${entry.id}.`,
            entry.line,
          ),
        );
      }
    }
    const severity = entry.fields['Severity'] ?? '';
    if (severity !== '' && !isSeverity(severity)) {
      issues.push(
        issue(
          'findings',
          `${entry.id} has an unknown Severity '${severity}'.`,
          `Use one of: ${SEVERITIES.join(', ')}.`,
          entry.fieldLines['Severity'],
        ),
      );
    }
    const status = entry.fields['Status'] ?? '';
    if (status !== '' && !isFindingStatus(status)) {
      issues.push(
        issue(
          'findings',
          `${entry.id} has an unknown Status '${status}'.`,
          `Use one of: ${FINDING_STATUSES.join(', ')}.`,
          entry.fieldLines['Status'],
        ),
      );
    }
    const attempts = entry.fields['Attempts'];
    if (attempts !== undefined && nonNegativeInt(attempts) === undefined) {
      issues.push(
        issue(
          'findings',
          `${entry.id} 'Attempts' must be a non-negative integer.`,
          'Use a number such as 0.',
          entry.fieldLines['Attempts'],
        ),
      );
    }
    const firstSeen = entry.fields['First Seen'];
    if (firstSeen !== undefined && nonNegativeInt(firstSeen) === undefined) {
      issues.push(
        issue(
          'findings',
          `${entry.id} 'First Seen' must be a positive integer.`,
          'Use the iteration the finding first appeared in.',
          entry.fieldLines['First Seen'],
        ),
      );
    }
    if (!entry.sawDiscussion) {
      issues.push(
        issue(
          'findings',
          `${entry.id} has no '#### Discussion' subsection.`,
          `Add an empty '#### Discussion' under ${entry.id}.`,
          entry.line,
        ),
      );
    }
    findings.push({
      id: entry.id,
      title: entry.title,
      severity,
      location: entry.fields['Location'] ?? '',
      status,
      attempts: attempts === undefined ? 0 : (nonNegativeInt(attempts) ?? 0),
      firstSeen: firstSeen === undefined ? 0 : (nonNegativeInt(firstSeen) ?? 0),
      problem: entry.fields['Problem'] ?? '',
      impact: entry.fields['Impact'] ?? '',
      suggestion: entry.fields['Suggestion'] ?? '',
      discussion: entry.discussion,
    });
  };

  for (const entry of body) {
    const head = findingHeading(entry.text);
    if (head !== undefined) {
      flush();
      current = {
        id: head.id,
        title: head.title,
        line: entry.line,
        fields: {},
        fieldLines: {},
        discussion: [],
        inDiscussion: false,
        sawDiscussion: false,
      };
      continue;
    }
    const sub = /^####\s+(.*)$/u.exec(entry.text);
    if (sub !== null && current !== undefined) {
      current.inDiscussion = (sub[1] ?? '').trim().toLowerCase() === 'discussion';
      if (current.inDiscussion) current.sawDiscussion = true;
      continue;
    }
    if (current === undefined) {
      const trimmed = entry.text.trim();
      if (trimmed !== '' && !trimmed.startsWith('<!--')) notes.push(trimmed);
      continue;
    }
    if (current.inDiscussion) {
      current.discussion.push(entry.text);
      continue;
    }
    const match = /^-\s*([^:]+?)\s*:\s*(.*)$/u.exec(entry.text);
    if (match !== null) {
      const key = (match[1] ?? '').trim();
      if (current.fields[key] === undefined) {
        current.fields[key] = (match[2] ?? '').trim();
        current.fieldLines[key] = entry.line;
      }
    }
  }
  flush();
  return { findings, note: notes.join('\n').trim(), issues };
};

/**
 * Parse a round file (`<name>/<round>/REVIEW.md`) and collect every structural
 * issue. Never throws — a malformed file yields issues, not an exception.
 * @param round - the round directory name the file lives in (`001`)
 * @param raw - the file's raw contents
 * @returns the parsed round plus the issues found
 */
export const parseRound = (round: string, raw: string): ParsedRound => {
  const lines = linesOf(raw);
  const heading = headingOf(lines);
  const sections = topSections(lines);
  const issues: Array<VerifyIssue> = [];

  if (!/^Review\b/u.test(heading)) {
    issues.push(
      issue(
        'heading',
        'First heading must start with "# Review:".',
        `Write '# Review: <name> / ${round}'.`,
        1,
      ),
    );
  }

  const metaSection = sections.find((section) => section.heading === 'Metadata');
  const findingsSection = sections.find((section) => section.heading === 'Findings');
  const summarySection = sections.find((section) => section.heading === 'Summary');

  const metadata = metaSection === undefined ? {} : fieldMap(metaSection.body);
  if (metaSection === undefined) {
    issues.push(issue('metadata', 'Missing "## Metadata" section.', 'Add the Metadata block.'));
  } else {
    for (const field of ROUND_META_FIELDS) {
      const value = metadata[field];
      if (value === undefined || value === '') {
        issues.push(
          issue(
            'metadata',
            `Metadata is missing '${field}'.`,
            `Add '- ${field}: …'.`,
            metaSection.line,
          ),
        );
      }
    }
    const declaredRound = metadata['Round'];
    if (declaredRound !== undefined && declaredRound !== round) {
      issues.push(
        issue(
          'metadata',
          `Metadata 'Round' is '${declaredRound}' but the directory is '${round}'.`,
          `Set '- Round: ${round}'.`,
          fieldLine(metaSection.body, 'Round'),
        ),
      );
    }
    const maxAttempts = metadata['Max Attempts'];
    if (maxAttempts !== undefined && nonNegativeInt(maxAttempts) === undefined) {
      issues.push(
        issue(
          'metadata',
          "'Max Attempts' must be a positive integer.",
          'Default to 3.',
          fieldLine(metaSection.body, 'Max Attempts'),
        ),
      );
    }
    const phase = metadata['Phase'];
    if (phase !== undefined && phase !== '' && !PHASE_ID_PATTERN.test(phase)) {
      issues.push(
        issue(
          'metadata',
          `'Phase' must be a phase id such as 'A' or 'AA' (got '${phase}').`,
          "Set '- Phase: <phase>', or drop the line.",
          fieldLine(metaSection.body, 'Phase'),
        ),
      );
    }
    const type = metadata['Type'];
    if (type !== undefined && !REVIEW_TYPES.some((known) => known === type)) {
      issues.push(
        issue(
          'metadata',
          `'Type' must be one of: ${REVIEW_TYPES.join(', ')}.`,
          `Use 'standalone' or 're-review'.`,
          fieldLine(metaSection.body, 'Type'),
        ),
      );
    }
    const status = metadata['Status'];
    if (status !== undefined && !isOpenClosed(status)) {
      issues.push(
        issue(
          'metadata',
          "'Status' must be 'open' or 'closed'.",
          "Set '- Status: open'.",
          fieldLine(metaSection.body, 'Status'),
        ),
      );
    }
  }

  let findings: ReadonlyArray<Finding> = [];
  let note = '';
  if (findingsSection === undefined) {
    issues.push(issue('findings', 'Missing "## Findings" section.', 'Add a Findings section.'));
  } else {
    const parsed = parseFindings(findingsSection.body);
    findings = parsed.findings;
    note = parsed.note;
    issues.push(...parsed.issues);
    if (parsed.findings.length === 0 && parsed.note === '') {
      issues.push(
        issue(
          'findings',
          'The Findings section is empty.',
          'List findings, or write "No defects found." so it is clear the review ran.',
          findingsSection.line,
        ),
      );
    }
  }

  const summary = summarySection === undefined ? {} : fieldMap(summarySection.body);
  if (summarySection === undefined) {
    issues.push(issue('summary', 'Missing "## Summary" section.', 'Add the Summary counts.'));
  } else {
    const expectedStatus = statusCounts(findings);
    const expectedSeverity = severityCounts(findings);
    for (const [key, expected] of [
      ...FINDING_STATUSES.map((status) => [status, expectedStatus[status]] as const),
      ...SEVERITIES.map((severity) => [severity, expectedSeverity[severity]] as const),
    ]) {
      const declared = summary[key];
      if (declared === undefined) {
        issues.push(
          issue(
            'summary',
            `Summary is missing '${key}: ${expected}'.`,
            `Add '- ${key}: ${expected}'.`,
            summarySection.line,
          ),
        );
        continue;
      }
      const value = nonNegativeInt(declared);
      if (value === undefined) {
        issues.push(
          issue(
            'summary',
            `Summary '${key}' must be a non-negative integer.`,
            `Set '- ${key}: ${expected}'.`,
            fieldLine(summarySection.body, key),
          ),
        );
      } else if (value !== expected) {
        issues.push(
          issue(
            'summary',
            `Summary '${key}' is ${value} but the findings total ${expected}.`,
            `Set '- ${key}: ${expected}'.`,
            fieldLine(summarySection.body, key),
          ),
        );
      }
    }
  }

  return { heading, metadata, findings, summary, note, issues };
};

/**
 * Mechanically verify a round file against the review standard. Pure — the
 * caller supplies the raw contents.
 * @param round - the round directory name the file lives in
 * @param raw - the file's raw contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyRoundFile = (round: string, raw: string): VerifyResult => {
  const parsed = parseRound(round, raw);
  return { valid: parsed.issues.length === 0, issues: parsed.issues };
};

/** Parse a series ledger (`<name>/REVIEW.md`). Never throws. */
export const parseSeries = (raw: string): ParsedSeries => {
  const lines = linesOf(raw);
  const heading = headingOf(lines);
  const sections = topSections(lines);
  const issues: Array<VerifyIssue> = [];

  if (!/^Review Series\b/u.test(heading)) {
    issues.push(
      issue(
        'heading',
        'First heading must start with "# Review Series:".',
        "Write '# Review Series: <name>'.",
        1,
      ),
    );
  }

  const metaSection = sections.find((section) => section.heading === 'Metadata');
  const roundsSection = sections.find((section) => section.heading === 'Rounds');
  const findingsSection = sections.find((section) => section.heading === 'Findings');

  const metadata = metaSection === undefined ? {} : fieldMap(metaSection.body);
  if (metaSection === undefined) {
    issues.push(issue('metadata', 'Missing "## Metadata" section.', 'Add the Metadata block.'));
  } else {
    for (const field of SERIES_META_FIELDS) {
      const value = metadata[field];
      if (value === undefined || value === '') {
        issues.push(
          issue(
            'metadata',
            `Metadata is missing '${field}'.`,
            `Add '- ${field}: …'.`,
            metaSection.line,
          ),
        );
      }
    }
    const status = metadata['Status'];
    if (status !== undefined && !isOpenClosed(status)) {
      issues.push(
        issue(
          'metadata',
          "'Status' must be 'open' or 'closed'.",
          "Set '- Status: open'.",
          fieldLine(metaSection.body, 'Status'),
        ),
      );
    }
    const profile = metadata['Profile'];
    if (profile !== undefined && profile !== '' && !isValidName(profile)) {
      issues.push(
        issue(
          'metadata',
          `'Profile' must be a kebab-case profile name (got '${profile}').`,
          "Set '- Profile: <name>', or drop the line.",
          fieldLine(metaSection.body, 'Profile'),
        ),
      );
    }
    const rounds = metadata['Rounds'];
    if (rounds !== undefined && nonNegativeInt(rounds) === undefined) {
      issues.push(
        issue(
          'metadata',
          "'Rounds' must be a non-negative integer.",
          'Set it to the number of round directories.',
          fieldLine(metaSection.body, 'Rounds'),
        ),
      );
    }
  }

  const rounds: Array<RoundRow> = [];
  if (roundsSection === undefined) {
    issues.push(issue('rounds', 'Missing "## Rounds" section.', 'Add the rounds table.'));
  } else {
    const rows = tableRows(roundsSection.body);
    for (const cells of rows.slice(1)) {
      const [
        round = '',
        status = '',
        open = '',
        inReview = '',
        resolved = '',
        wontFix = '',
        escalated = '',
      ] = cells;
      if (!isValidRound(round)) {
        issues.push(
          issue(
            'rounds',
            `Round '${round}' must be a three-digit number.`,
            'Use a name such as 001.',
            roundsSection.line,
          ),
        );
        continue;
      }
      if (!isOpenClosed(status)) {
        issues.push(
          issue(
            'rounds',
            `Round '${round}' status must be 'open' or 'closed'.`,
            "Set the status cell to 'open'.",
            roundsSection.line,
          ),
        );
      }
      const counts = [open, inReview, resolved, wontFix, escalated].map(nonNegativeInt);
      if (counts.some((value) => value === undefined)) {
        issues.push(
          issue(
            'rounds',
            `Round '${round}' has a non-numeric count.`,
            'Every count cell must be a non-negative integer.',
            roundsSection.line,
          ),
        );
        continue;
      }
      rounds.push({
        round,
        status,
        open: counts[0] ?? 0,
        inReview: counts[1] ?? 0,
        resolved: counts[2] ?? 0,
        wontFix: counts[3] ?? 0,
        escalated: counts[4] ?? 0,
      });
    }
    const declaredRounds = metadata['Rounds'];
    if (
      declaredRounds !== undefined &&
      nonNegativeInt(declaredRounds) !== undefined &&
      rounds.length !== Number(declaredRounds)
    ) {
      issues.push(
        issue(
          'metadata',
          `Metadata 'Rounds' is ${declaredRounds} but the table lists ${rounds.length}.`,
          `Set '- Rounds: ${rounds.length}'.`,
          fieldLine(metaSection?.body ?? [], 'Rounds'),
        ),
      );
    }
  }

  const findings: Array<FindingsRow> = [];
  if (findingsSection === undefined) {
    issues.push(
      issue('findings', 'Missing "## Findings" section.', 'Add the findings index table.'),
    );
  } else {
    const rows = tableRows(findingsSection.body);
    for (const cells of rows.slice(1)) {
      const [round = '', id = '', severity = '', status = '', title = ''] = cells;
      if (!isValidRound(round)) {
        issues.push(
          issue(
            'findings',
            `Finding row round '${round}' must be a three-digit number.`,
            'Use the round directory such as 001.',
            findingsSection.line,
          ),
        );
      }
      if (!/^F\d+$/u.test(id)) {
        issues.push(
          issue(
            'findings',
            `Finding row id '${id}' must match F<n>.`,
            'Use the finding id, e.g. F1.',
            findingsSection.line,
          ),
        );
      }
      if (!isSeverity(severity)) {
        issues.push(
          issue(
            'findings',
            `Finding '${id}' severity must be one of: ${SEVERITIES.join(', ')}.`,
            'Copy the severity from the round file.',
            findingsSection.line,
          ),
        );
      }
      if (!isFindingStatus(status)) {
        issues.push(
          issue(
            'findings',
            `Finding '${id}' status must be one of: ${FINDING_STATUSES.join(', ')}.`,
            'Copy the status from the round file.',
            findingsSection.line,
          ),
        );
      }
      findings.push({ round, id, severity, status, title });
    }
  }

  return { heading, metadata, rounds, findings, issues };
};

/**
 * Mechanically verify a series ledger against the review standard. Pure.
 * Cross-file consistency with the round files is the engine's job.
 * @param raw - the ledger's raw contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifySeriesFile = (raw: string): VerifyResult => {
  const parsed = parseSeries(raw);
  return { valid: parsed.issues.length === 0, issues: parsed.issues };
};

/** How many findings a round, and each series, reports. */
export interface Counts {
  readonly severity: SeverityCounts;
  readonly status: StatusCounts;
}

/**
 * Counts for a set of parsed findings.
 * @param findings - findings from a round
 * @returns severity and status counts
 */
export const counts = (findings: ReadonlyArray<Finding>): Counts => ({
  severity: severityCounts(findings),
  status: statusCounts(findings),
});

/** Build a `## Rounds` row from a round's directory name, status, and findings. */
export const roundRow = (
  round: string,
  status: string,
  findings: ReadonlyArray<Finding>,
): RoundRow => {
  const counted = statusCounts(findings);
  return {
    round,
    status,
    open: counted.Open,
    inReview: counted['In Review'],
    resolved: counted.Resolved,
    wontFix: counted["Won't Fix"],
    escalated: counted.Escalated,
  };
};

/** Build `## Findings` index rows for one round. */
export const findingRows = (
  round: string,
  findings: ReadonlyArray<Finding>,
): ReadonlyArray<FindingsRow> =>
  findings.map((finding) => ({
    round,
    id: finding.id,
    severity: finding.severity,
    status: finding.status,
    title: finding.title,
  }));

/**
 * The `## Rounds` table body (header, separator, rows), as agents read and
 * write it. `renderSeries` and the engine's consistency check share this so the
 * expected table and the written table can never disagree.
 * @param rows - one row per round, round-sorted
 * @returns the markdown table lines
 */
export const renderRoundsTable = (rows: ReadonlyArray<RoundRow>): string => {
  const header = "| Round | Status | Open | In Review | Resolved | Won't Fix | Escalated |";
  const separator = '| ----- | ------ | ---- | --------- | -------- | --------- | --------- |';
  const body = rows.map(
    (row) =>
      `| ${row.round} | ${row.status} | ${row.open} | ${row.inReview} | ${row.resolved} | ${row.wontFix} | ${row.escalated} |`,
  );
  return [header, separator, ...body].join('\n');
};

/**
 * The `## Findings` index table body, as agents read and write it.
 * @param rows - one row per finding, round- and id-sorted
 * @returns the markdown table lines
 */
export const renderFindingsTable = (rows: ReadonlyArray<FindingsRow>): string => {
  const header = '| Round | ID | Severity | Status | Title |';
  const separator = '| ----- | -- | -------- | ------ | ----- |';
  const body = rows.map(
    (row) => `| ${row.round} | ${row.id} | ${row.severity} | ${row.status} | ${row.title} |`,
  );
  return [header, separator, ...body].join('\n');
};

/** Everything `renderRound` needs to write a round file scaffold. */
export interface RoundScaffold {
  readonly name: string;
  readonly round: string;
  readonly target: string;
  readonly created: string;
  readonly type?: string | undefined;
  readonly isolation?: string | undefined;
  readonly maxAttempts?: number | undefined;
  readonly status?: string | undefined;
  /** The spec phase this round reviews, e.g. `C`; omitted for a standalone review. */
  readonly phase?: string | undefined;
}

/**
 * Render a round file. With no findings it is a valid, empty review the
 * reviewer fills in — and `mf-reviews verify` accepts before any finding
 * exists, because an empty section with an explicit note is a stated result,
 * not a missing one.
 * @param input - the round's identity and defaults
 * @returns the file contents
 */
export const renderRound = (input: RoundScaffold): string =>
  [
    `# Review: ${input.name} / ${input.round}`,
    '',
    '## Metadata',
    `- Target: ${input.target}`,
    `- Round: ${input.round}`,
    ...(input.phase === undefined || input.phase === '' ? [] : [`- Phase: ${input.phase}`]),
    `- Type: ${input.type ?? 'standalone'}`,
    `- Isolation: ${input.isolation ?? 'isolated'}`,
    `- Max Attempts: ${input.maxAttempts ?? 3}`,
    `- Status: ${input.status ?? 'open'}`,
    `- Created: ${input.created}`,
    '',
    '## Findings',
    '',
    // A valid empty round: the note states the result so verify accepts it.
    'No findings recorded yet. Replace this line with findings, or write "No defects found." once the review is complete.',
    '',
    '## Summary',
    '# Finding counts by severity, then by status. Keep both in step with the findings above.',
    '- Critical: 0',
    '- Major: 0',
    '- Minor: 0',
    '- Nit: 0',
    '- Open: 0',
    '- In Review: 0',
    '- Resolved: 0',
    "- Won't Fix: 0",
    '- Escalated: 0',
    '',
  ].join('\n');

/** Everything `renderSeries` needs to write a series ledger scaffold. */
export interface SeriesScaffold {
  readonly name: string;
  readonly target: string;
  readonly created: string;
  readonly status?: string | undefined;
  readonly rounds?: ReadonlyArray<RoundRow> | undefined;
  readonly findings?: ReadonlyArray<FindingsRow> | undefined;
  /** Reviewer profile bound to this series; omitted for the general reviewer. */
  readonly profile?: string | undefined;
}

/**
 * Render a series ledger. The rounds and findings tables are regenerated from
 * the values supplied, so the ledger is always a faithful index of the rounds.
 * @param input - the series identity and its table rows
 * @returns the file contents
 */
export const renderSeries = (input: SeriesScaffold): string => {
  const rows = input.rounds ?? [];
  const findings = input.findings ?? [];
  return [
    `# Review Series: ${input.name}`,
    '',
    '## Metadata',
    `- Target: ${input.target}`,
    `- Status: ${input.status ?? 'open'}`,
    `- Rounds: ${rows.length}`,
    ...(input.profile === undefined || input.profile === '' ? [] : [`- Profile: ${input.profile}`]),
    `- Created: ${input.created}`,
    '',
    '## Rounds',
    '',
    renderRoundsTable(rows),
    '',
    '## Findings',
    '',
    renderFindingsTable(findings),
    '',
  ].join('\n');
};

/**
 * One generic verify status line, for a detail panel.
 * @param result - result from {@link verifyRoundFile} or {@link verifySeriesFile}
 * @returns one status line
 */
export const verifyInfoLine = (result: VerifyResult): string => {
  if (result.valid) return '✓ verified';
  const count = result.issues.length;
  return `✗ not verified — ${count} issue${count === 1 ? '' : 's'}`;
};

/**
 * The full verification report, written for an agent to act on: the status and
 * every issue with its `Fix:` line.
 * @param name - the file's path, as shown to the reader
 * @param result - verification result for that file
 * @returns a multi-line report
 */
export const verifyReport = (name: string, result: VerifyResult): string => {
  if (result.valid) return `✓ ${name} matches the review standard.`;
  const count = result.issues.length;
  const lines = [
    `✗ ${name} has ${count} issue${count === 1 ? '' : 's'}. Fix each one and run verify again.`,
    '',
  ];
  result.issues.forEach((found, index) => {
    const where = found.line === undefined ? '' : ` (line ${found.line})`;
    lines.push(`${index + 1}. [${found.field}] ${found.message}${where}`);
    if (found.fix !== undefined) lines.push(`   Fix: ${found.fix}`);
  });
  return lines.join('\n');
};

/**
 * The review artifact contract as one string: the layout an authoring agent
 * must produce, and the exact rules the verifier enforces. Single source of
 * truth for the skills and any agent prompt that scaffolds a review.
 * @returns the format contract
 */
export const authoringRules = (): string => `A review lives in a series directory per target:

  .agents/@montflow/reviews/<name>/REVIEW.md        # the series ledger
  .agents/@montflow/reviews/<name>/<NNN>/REVIEW.md  # one round (NNN = 001, 002, …)

Every value is a "- Key: value" line or a table cell; headings are fixed.

Series ledger (REVIEW.md at the series root):

  # Review Series: <name>

  ## Metadata
  - Target: <what is under review>
  - Status: open | closed
  - Rounds: <number of round directories>
  - Profile: <profile name>          # optional; verified against the profiles plugin
  - Created: <YYYY-MM-DD>

  ## Rounds
  | Round | Status | Open | In Review | Resolved | Won't Fix | Escalated |
  | ----- | ------ | ---- | --------- | -------- | --------- | --------- |
  | 001   | open   | 0    | 0         | 0        | 0         | 0         |

  ## Findings
  | Round | ID | Severity | Status | Title |
  | ----- | -- | -------- | ------ | ----- |
  (one row per finding across every round)

Round file (<NNN>/REVIEW.md):

  # Review: <name> / <NNN>

  ## Metadata
  - Target: <what was reviewed>
  - Round: <NNN>
  - Phase: <phase id>             # optional; the spec phase this round reviews
  - Type: standalone | re-review
  - Isolation: isolated | non-isolated (<reason>)
  - Max Attempts: 3
  - Status: open | closed
  - Created: <YYYY-MM-DD>

  ## Findings

  ### F1 — <short title>
  - Severity: Critical | Major | Minor | Nit
  - Location: \`path:line\`
  - Status: Open | In Review | Resolved | Won't Fix | Escalated
  - Attempts: 0
  - First Seen: 1
  - Problem: <concrete trigger and what breaks>
  - Impact: <user or system consequence>
  - Suggestion: <minimal fix>

  #### Discussion
  (append-only [Reviewer] / [Fixer] / [Human] turns)

  ## Summary
  - Critical: 0
  - Major: 0
  - Minor: 0
  - Nit: 0
  - Open: 0
  - In Review: 0
  - Resolved: 0
  - Won't Fix: 0
  - Escalated: 0

Rules the verifier enforces: the heading prefixes above; every metadata key
present and valid; every finding field present with Severity and Status from
their enums; Attempts and First Seen integers; one Discussion per finding;
Summary counts equal to the actual findings; the series Rounds count and both
tables agree with the round directories. Keep the ledger in step with the
round files every time a finding changes.`;
