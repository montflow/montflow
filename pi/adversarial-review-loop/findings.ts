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
 * they cannot reify as phantom findings. Recovery: when the document has an
 * unclosed fence (odd fence-marker count), a header preceded by a blank line
 * is a boundary even while a fence is open — a single unclosed ``` (a common
 * LLM markdown defect) cannot swallow the findings around it, and the fence
 * state is reset at that boundary. An odd count is ambiguous: the never-closed
 * region may be the one opened by the FIRST marker (an orphaned opener
 * mid-document followed by a later balanced pair) or the one opened by the
 * LAST marker (tail case); the recovery therefore treats any open fence as
 * potentially unclosed. A document whose fences are all balanced (even count)
 * keeps its phantom protection: a blank-preceded header inside a real fence
 * is a quoted example and stays invisible.
 * @param {string} content Full markdown contents
 * @returns Raw text blocks (leading non-finding preamble included as block 0)
 */
export const splitFindingBlocks = (content: string): readonly string[] => {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const lines = content.split('\n');
  // Fence markers pair up (opener at odd ordinal, closer at even ordinal).
  // An odd total count means some region is never closed, but which one is
  // ambiguous: it could be the region opened by the FIRST marker (an orphaned
  // opener mid-document followed by a later balanced pair — F19) or the one
  // opened by the LAST marker (tail case — F17). The split below therefore
  // treats any open fence as potentially unclosed in an odd-count document.
  // A document with an even count has only balanced fences, which are real:
  // quoted headers inside them must stay invisible even when blank-preceded
  // (F17 regression guard).
  let fenceCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trimStart().startsWith('```')) {
      fenceCount++;
    }
  }
  const hasUnclosedFence = fenceCount % 2 === 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    // Recovery: a finding header preceded by a blank line is a block boundary
    // while a fence is open ONLY when the document has an unclosed fence (odd
    // marker count) — the open region may be the never-closed one, whether it
    // is the tail region (F17) or a region opened mid-document (F19), and the
    // ambiguity is accepted. Resetting the fence at such a boundary restores
    // the document's fence state for the rest of the split. In a fully
    // balanced document (even count) a blank-preceded header inside a fence
    // is a quoted example and must not become a boundary.
    const precededByBlank =
      current.length === 0 || (current[current.length - 1] ?? '').trim() === '';
    const inUnclosedFence = hasUnclosedFence;
    const isHeader =
      /^#### F\d+\s+(?:—|--|-)/.test(line) &&
      (inFence ? precededByBlank && inUnclosedFence : true);
    if (isHeader) {
      inFence = false;
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

    // Field extraction is confined to the finding head (everything before
    // `### Discussion`) so quoted field lines inside Discussion turns cannot
    // shadow the real fields. Status/Attempts are anchored to the fixed field
    // order (Status is always followed by Attempts, Attempts by First Seen) so
    // quoted `- **Status**:` text inside Problem/Suggestion (F16) never wins
    // the parse.
    const head = block.split(/\n### Discussion\b/)[0] ?? block;

    const field = (label: string): string => {
      const match = head.match(new RegExp(`- \\*\\*${label}\\*\\*: (.+)$`, 'm'));
      return match?.[1]?.trim() ?? '';
    };

    // Anchored variant: the field line must be followed by the next field in
    // the canonical block order, so mid-text quotes cannot shadow the real one.
    const fieldBefore = (label: string, next: string): string => {
      const match = head.match(
        new RegExp(`- \\*\\*${label}\\*\\*: ([^\\n]+)(?=\\n- \\*\\*${next}\\*\\*:)`, 'm'),
      );
      return match?.[1]?.trim() ?? '';
    };

    const problemMatch = head.match(
      /- \*\*Problem\*\*: ([\s\S]+?)(?:\n- \*\*Impact\*\*)/m,
    );
    const impactMatch = head.match(
      /- \*\*Impact\*\*: ([\s\S]+?)(?:\n- \*\*Suggestion\*\*)/m,
    );
    const suggestionMatch = head.match(
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
      status: fieldBefore('Status', 'Attempts') || field('Status') || 'Open',
      attempts: fieldBefore('Attempts', 'First Seen') || field('Attempts') || '0',
      firstSeen: field('First Seen') || '1',
      discussion: discussionMatch?.[1]?.trim() ?? '',
      raw: block.trim(),
      sourceReviewers: sources,
    });
  }

  return findings;
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
 * Extracts the file portion of a finding's location string (`src/a.ts:10`
 * → `src/a.ts`, `src/a.ts:10:20` → `src/a.ts`, `C:\\dir\\a.ts:10` →
 * `C:\\dir\\a.ts`). Windows drive letters are safe because the drive colon
 * is not followed by a digit, whereas a `:line`/`:line:col` suffix is.
 * @param {string} location Finding location string
 * @returns The file path the finding edits
 */
export const locationFile = (location: string): string => {
  const match = location.match(/^(.+?):\d/);
  return (match?.[1] ?? location).trim();
};

/**
 * Builds the fixer schedule from the actionable (Open) findings: a list of
 * **waves**. Findings in the same file are related (their fixes overlap —
 * concurrent fixers editing the same file race on read-modify-write) and are
 * assigned to distinct waves — run sequentially. Findings in different files
 * are unrelated and share a wave — run in parallel. Within a file group,
 * fixes apply in severity order.
 * @param {readonly FindingBlock[]} findings Actionable findings
 * @returns The waves; each wave runs in parallel, waves run sequentially
 */
export const buildFixerSchedule = (
  findings: readonly FindingBlock[],
): readonly (readonly FindingBlock[])[] => {
  const groups = new Map<string, FindingBlock[]>();
  for (const finding of findings) {
    const file = locationFile(finding.location);
    const group = groups.get(file) ?? [];
    group.push(finding);
    groups.set(file, group);
  }
  // Within each file group, most severe first (the skill fixes in severity
  // order within a related cluster).
  const sortedGroups = [...groups.values()].map((group) =>
    group.toSorted((left, right) => severityRank(left.severity) - severityRank(right.severity)),
  );
  // Finding i of a group goes to wave i → same-file findings never share a
  // wave; wave count = the largest file group.
  const waveCount = Math.max(0, ...sortedGroups.map((group) => group.length));
  const waves: FindingBlock[][] = Array.from({ length: waveCount }, () => []);
  for (const group of sortedGroups) {
    group.forEach((finding, index) => {
      waves[index]?.push(finding);
    });
  }
  return waves;
};

/**
 * Replaces one finding's block in a canonical review document with an updated
 * block, matched by its id (`#### F<n> …`), preserving everything else.
 * @param {string} canonical The review document
 * @param {string} updatedBlock The updated finding block (must carry the id)
 * @returns The merged document (unchanged when the id is missing/unknown)
 */
export const mergeFindingBlock = (canonical: string, updatedBlock: string): string => {
  const idMatch = updatedBlock.match(/^#### (F\d+)\s+(?:—|--|-)/m);
  const id = idMatch?.[1];
  if (id === undefined) return canonical;
  const blocks = [...splitFindingBlocks(canonical)];
  const index = blocks.findIndex((block) => block.startsWith(`#### ${id} `));
  if (index < 0) return canonical;
  blocks[index] = updatedBlock.trimEnd();
  return blocks.join('\n');
};

/** Matches the `## Summary` section (from the header to the next `##` or EOF). */
export const SUMMARY_SECTION_RE = /^## Summary\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m;

/**
 * Recomputes and rewrites the `## Summary` counts section from the given
 * findings, preserving the rest of the document. Appends the section when the
 * document has none.
 * @param {string} canonical The review document
 * @param {readonly FindingBlock[]} findings Findings to count
 * @returns The document with an up-to-date summary section
 */
export const updateSummarySection = (
  canonical: string,
  findings: readonly FindingBlock[],
): string => {
  const counts = countStatuses(findings);
  const summary = [
    '## Summary',
    `- **Open**: ${counts.open}`,
    `- **In Review**: ${counts.inReview}`,
    `- **Escalated**: ${counts.escalated}`,
    `- **Resolved**: ${counts.resolved}`,
    `- **Won't Fix**: ${counts.wontFix}`,
    '',
  ].join('\n');
  return SUMMARY_SECTION_RE.test(canonical)
    ? canonical.replace(SUMMARY_SECTION_RE, summary)
    : `${canonical.trimEnd()}\n\n${summary}`;
};
