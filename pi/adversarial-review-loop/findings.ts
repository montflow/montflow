/**
 * Pure finding extraction + summary rebuild helpers shared by merge/deadlock.
 */

export interface FindingBlock {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly location: string;
  readonly problem: string;
  readonly impact: string;
  readonly suggestion: string;
  readonly status: string;
  readonly attempts: string;
  readonly firstSeen: string;
  readonly discussion: string;
  readonly raw: string;
  readonly sourceReviewers: readonly string[];
}

const SEVERITY_ORDER: Readonly<Record<string, number>> = {
  Critical: 0,
  Major: 1,
  Minor: 2,
  Nit: 3,
};

/**
 * Orders severity labels for canonical report sections.
 * @param {string} severity Severity label
 * @returns Sort key (lower = more severe)
 */
export const severityRank = (severity: string): number =>
  SEVERITY_ORDER[severity] ?? 99;

/**
 * Splits review markdown into finding blocks at `#### F<n> —` headers.
 * Fence-aware: headers quoted inside fenced code blocks (e.g. an example
 * finding inside a Discussion turn) are NOT treated as block boundaries, so
 * they cannot reify as phantom findings.
 * @param {string} content Full markdown contents
 * @returns Raw text blocks (leading non-finding preamble included as block 0)
 */
export const splitFindingBlocks = (content: string): readonly string[] => {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^```/.test(line.trimStart())) inFence = !inFence;
    const isHeader = !inFence && /^#### F\d+\s+(?:—|--|-)/.test(line);
    if (isHeader) {
      if (current.length > 0) blocks.push(current.join('\n'));
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
};

/**
 * Parses finding blocks from review-file text.
 * @param {string} content Full markdown contents
 * @param {string} [sourceReviewer] Optional reviewer id to stamp on each finding
 * @returns Parsed finding blocks
 */
export const parseFindingBlocks = (
  content: string,
  sourceReviewer?: string,
): readonly FindingBlock[] => {
  const findings: FindingBlock[] = [];
  const findingBlocks = splitFindingBlocks(content);

  for (const block of findingBlocks) {
    const idMatch = block.match(/^#### (F\d+)\s+(?:—|--|-)\s+(.+)$/m);
    const id = idMatch?.[1];
    const title = idMatch?.[2];
    if (id === undefined || title === undefined) continue;

    const field = (label: string): string => {
      const match = block.match(new RegExp(`- \\*\\*${label}\\*\\*: (.+)$`, 'm'));
      return match?.[1]?.trim() ?? '';
    };

    const problemMatch = block.match(
      /- \*\*Problem\*\*: ([\s\S]+?)(?:\n- \*\*Impact\*\*)/m,
    );
    const impactMatch = block.match(
      /- \*\*Impact\*\*: ([\s\S]+?)(?:\n- \*\*Suggestion\*\*)/m,
    );
    const suggestionMatch = block.match(
      /- \*\*Suggestion\*\*: ([\s\S]+?)(?:\n- \*\*Status\*\*)/m,
    );
    const discussionMatch = block.match(/### Discussion\s*\n([\s\S]*?)(?=^#### |\n## |$(?![\s\S]))/m);

    const sourceFromMeta = field('Source');
    const sources =
      sourceFromMeta !== ''
        ? sourceFromMeta.split(',').map((part) => part.trim()).filter(Boolean)
        : sourceReviewer !== undefined
          ? [sourceReviewer]
          : [];

    findings.push({
      id,
      title: title.trim(),
      severity: field('Severity') || 'Unknown',
      location: field('Location').replace(/^`|`$/g, '') || 'unknown',
      problem: problemMatch?.[1]?.trim() ?? title.trim(),
      impact: impactMatch?.[1]?.trim() ?? '',
      suggestion: suggestionMatch?.[1]?.trim() ?? '',
      status: field('Status') || 'Open',
      attempts: field('Attempts') || '0',
      firstSeen: field('First Seen') || '1',
      discussion: discussionMatch?.[1]?.trim() ?? '',
      raw: block.trim(),
      sourceReviewers: sources,
    });
  }

  return findings;
};

/**
 * Renders a single finding block in the canonical report format.
 * @param {FindingBlock} finding Finding to render
 * @param {string} id The finding's stable id (F1, F2, …)
 * @returns Markdown for the finding
 */
export const renderFindingBlock = (finding: FindingBlock, id: string): string => {
  const sources =
    finding.sourceReviewers.length > 0
      ? `\n- **Source**: ${finding.sourceReviewers.join(', ')}`
      : '';
  const discussion =
    finding.discussion.trim() === ''
      ? '### Discussion\n<!-- Threaded log. Each turn prefixed with the role tag. -->'
      : `### Discussion\n${finding.discussion.trim()}`;

  return [
    `#### ${id} — ${finding.title}`,
    `- **Severity**: ${finding.severity}`,
    `- **Location**: \`${finding.location}\`${sources}`,
    `- **Problem**: ${finding.problem}`,
    `- **Impact**: ${finding.impact || '(see problem)'}`,
    `- **Suggestion**: ${finding.suggestion || '(see problem)'}`,
    `- **Status**: ${finding.status}`,
    `- **Attempts**: ${finding.attempts}`,
    `- **First Seen**: ${finding.firstSeen}`,
    '',
    discussion,
  ].join('\n');
};

export interface SummaryCountsLike {
  readonly open: number;
  readonly inReview: number;
  readonly escalated: number;
  readonly resolved: number;
  readonly wontFix: number;
}

/**
 * Counts statuses from finding blocks.
 * @param {readonly FindingBlock[]} findings Findings to count
 * @returns Summary counts
 */
export const countStatuses = (findings: readonly FindingBlock[]): SummaryCountsLike => {
  const counts = { open: 0, inReview: 0, escalated: 0, resolved: 0, wontFix: 0 };
  for (const finding of findings) {
    const status = finding.status;
    if (status === 'Open') counts.open++;
    else if (status === 'In Review') counts.inReview++;
    else if (status === 'Escalated') counts.escalated++;
    else if (status === 'Resolved') counts.resolved++;
    else if (status === "Won't Fix") counts.wontFix++;
  }
  return counts;
};

/**
 * Rebuilds a canonical review document from merged findings.
 * Finding ids are STABLE: each block keeps its own id (assigned by the merge
 * from the existing canonical where possible); next-free ids are only handed
 * out for blocks with missing or duplicate ids. Reviewer-owned metadata
 * (Iteration / Review Type) is carried forward from the existing canonical
 * instead of being rewound to the in-memory cycle.
 * @param {object} input Metadata + findings
 * @returns Full markdown document
 */
export const buildCanonicalReview = (input: {
  readonly target: string;
  readonly reviewFile: string;
  readonly iteration: number;
  readonly findings: readonly FindingBlock[];
  readonly coverageNote?: string;
  readonly existingIteration?: number;
}): string => {
  const { target, reviewFile, findings, coverageNote, existingIteration } = input;
  const iteration = Math.max(
    existingIteration !== undefined ? existingIteration + 1 : 1,
    input.iteration,
  );
  const bySeverity = new Map<string, FindingBlock[]>();
  for (const finding of findings) {
    const list = bySeverity.get(finding.severity) ?? [];
    list.push(finding);
    bySeverity.set(finding.severity, list);
  }

  // Stable ids: keep each finding's id; assign next-free ids only to blocks
  // with a missing/invalid/duplicate id (merge pre-assigns, so this is a
  // defensive fallback).
  const usedIds = new Set<string>();
  let nextFreeId = 1;
  const resolveId = (preferred: string): string => {
    if (/^F\d+$/.test(preferred) && !usedIds.has(preferred)) {
      usedIds.add(preferred);
      return preferred;
    }
    while (usedIds.has(`F${nextFreeId}`)) nextFreeId++;
    const id = `F${nextFreeId++}`;
    usedIds.add(id);
    return id;
  };

  const remapped: { severity: string; markdown: string }[] = [];
  const summaryFindings: FindingBlock[] = [];
  const severitySections = [...bySeverity.entries()].sort(
    ([left], [right]) => severityRank(left) - severityRank(right),
  );
  for (const [severity, group] of severitySections) {
    const parts: string[] = [];
    for (const finding of group) {
      const id = resolveId(finding.id);
      summaryFindings.push({ ...finding, id });
      parts.push(renderFindingBlock(finding, id));
    }
    remapped.push({
      severity,
      markdown: `### ${severity}\n\n${parts.join('\n\n')}`,
    });
  }

  const counts = countStatuses(summaryFindings);
  const findingsBody =
    remapped.length === 0
      ? 'No defects found.\n\nCoverage: ' + (coverageNote ?? 'full adversarial audit')
      : remapped.map((section) => section.markdown).join('\n\n');

  return [
    `# Adversarial Review`,
    '',
    `## Review Metadata`,
    `- **Target**: ${target}`,
    `- **Review Type**: ${existingIteration !== undefined || iteration > 1 ? 'Re-review' : 'Initial'}`,
    `- **Review File**: ${reviewFile}`,
    `- **Iteration**: ${iteration}`,
    `- **Max Attempts**: 3`,
    '',
    `## Findings`,
    '',
    findingsBody,
    '',
    `## Summary`,
    `- **Open**: ${counts.open}`,
    `- **In Review**: ${counts.inReview}`,
    `- **Escalated**: ${counts.escalated}`,
    `- **Resolved**: ${counts.resolved}`,
    `- **Won't Fix**: ${counts.wontFix}`,
    '',
  ].join('\n');
};
