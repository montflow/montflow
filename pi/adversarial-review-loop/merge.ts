import { fingerprintFinding, hashText } from './loop-state';
import {
  buildCanonicalReview,
  parseFindingBlocks,
  severityRank,
  type FindingBlock,
} from './findings';

export interface ScratchReport {
  readonly reviewerId: string;
  readonly content: string;
}

export interface MergeConflict {
  readonly fingerprint: string;
  readonly findings: readonly FindingBlock[];
  readonly reason: string;
}

export interface MergeResult {
  readonly canonicalMarkdown: string;
  readonly findings: readonly FindingBlock[];
  readonly conflicts: readonly MergeConflict[];
  readonly hadConflicts: boolean;
}

/**
 * True when two suggestions look contradictory (coarse heuristic).
 * @param {string} left First suggestion
 * @param {string} right Second suggestion
 * @returns True when hashes differ and both are non-empty
 */
const suggestionsConflict = (left: string, right: string): boolean => {
  if (left.trim() === '' || right.trim() === '') return false;
  return hashText(left) !== hashText(right);
};

/**
 * Picks the higher-severity finding when deduping.
 * @param {FindingBlock} left First finding
 * @param {FindingBlock} right Second finding
 * @returns The preferred finding
 */
const preferFinding = (left: FindingBlock, right: FindingBlock): FindingBlock =>
  severityRank(left.severity) <= severityRank(right.severity) ? left : right;

/**
 * True when a scratch duplicate carries an explicit reopen turn authorizing a
 * terminal → Open resurrection. `Escalated` requires a `[Human]` turn;
 * `Resolved`/`Won't Fix` accept `[Reviewer]` or `[Human]`.
 * @param {string} discussion Scratch finding's Discussion thread
 * @param {string} terminalStatus The terminal status being reopened
 * @returns True when a reopen turn is present
 */
const hasReopenTurn = (discussion: string, terminalStatus: string): boolean => {
  const roles = terminalStatus === 'Escalated' ? ['Human'] : ['Reviewer', 'Human'];
  return roles.some((role) =>
    new RegExp(`\\[${role}\\][^\\n]*reopen`, 'i').test(discussion),
  );
};

/**
 * Unions loser discussion turns into the winner's thread, preserving order and
 * dropping exact-duplicate lines. Append-only: the winner's turns come first.
 * @param {string} winnerDiscussion Winner's Discussion thread
 * @param {readonly FindingBlock[]} losers Deduped findings whose turns would vanish
 * @returns The merged Discussion thread
 */
const mergeDiscussions = (
  winnerDiscussion: string,
  losers: readonly FindingBlock[],
): string => {
  const seen = new Set(
    winnerDiscussion.split('\n').map((line) => line.trim()).filter((line) => line !== ''),
  );
  const extra: string[] = [];
  for (const loser of losers) {
    for (const line of loser.discussion.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || seen.has(trimmed)) continue;
      seen.add(trimmed);
      extra.push(line);
    }
  }
  if (extra.length === 0) return winnerDiscussion;
  return winnerDiscussion.trim() === ''
    ? extra.join('\n')
    : `${winnerDiscussion}\n${extra.join('\n')}`;
};

/**
 * Programmatically merges scratch reviewer reports into one canonical document.
 * Detects location/fingerprint overlaps with contradictory suggestions as conflicts
 * for optional LLM reconciliation.
 * @param {object} input Scratch reports + metadata
 * @returns Merge result with canonical markdown and conflict set
 */
export const mergeScratchReports = (input: {
  readonly reports: readonly ScratchReport[];
  readonly target: string;
  readonly reviewFile: string;
  readonly iteration: number;
  readonly existingCanonical?: string;
}): MergeResult => {
  const { reports, target, reviewFile, iteration, existingCanonical } = input;

  const collected: FindingBlock[] = [];
  for (const report of reports) {
    const blocks = parseFindingBlocks(report.content, report.reviewerId);
    for (const block of blocks) {
      collected.push({
        ...block,
        sourceReviewers:
          block.sourceReviewers.length > 0 ? block.sourceReviewers : [report.reviewerId],
      });
    }
  }

  // Preserve terminal findings from an existing canonical file that scratch
  // reports may not restate (Resolved / Won't Fix / Escalated). Track them so
  // they always win over scratch duplicates (see the grouping loop below).
  const existingBlocks: readonly FindingBlock[] =
    existingCanonical !== undefined && existingCanonical !== ''
      ? parseFindingBlocks(existingCanonical)
      : [];
  const existingTerminal = new Set<FindingBlock>();
  for (const block of existingBlocks) {
    if (
      block.status === 'Resolved' ||
      block.status === "Won't Fix" ||
      block.status === 'Escalated'
    ) {
      existingTerminal.add(block);
      collected.push(block);
    }
  }

  const byFingerprint = new Map<string, FindingBlock[]>();
  for (const finding of collected) {
    const fingerprint = fingerprintFinding(finding.location, finding.problem);
    const group = byFingerprint.get(fingerprint) ?? [];
    group.push(finding);
    byFingerprint.set(fingerprint, group);
  }

  const merged: FindingBlock[] = [];
  const conflicts: MergeConflict[] = [];

  for (const [fingerprint, group] of byFingerprint) {
    if (group.length === 1) {
      const only = group[0];
      if (only !== undefined) merged.push(only);
      continue;
    }

    // Terminal blocks (Resolved / Won't Fix / Escalated) from the existing
    // canonical are carried through verbatim; a scratch duplicate may only
    // resurrect them to Open with an explicit reopen turn ([Human] for
    // Escalated, [Reviewer]/[Human] otherwise). Without one, the terminal
    // Status and its Discussion history win over the scratch duplicate.
    const terminalBlocks = group.filter((finding) => existingTerminal.has(finding));
    let pool = group;
    if (terminalBlocks.length > 0) {
      const terminal = terminalBlocks.reduce(preferFinding);
      const scratch = group.filter((finding) => !existingTerminal.has(finding));
      const reopened = scratch.some((finding) =>
        hasReopenTurn(finding.discussion, terminal.status),
      );
      if (!reopened || scratch.length === 0) {
        const sources = [...new Set(group.flatMap((finding) => [...finding.sourceReviewers]))];
        merged.push({ ...terminal, sourceReviewers: sources });
        continue;
      }
      pool = scratch;
    }

    if (pool.length === 1) {
      const only = pool[0];
      if (only !== undefined) merged.push(only);
      continue;
    }

    const openish = pool.filter(
      (finding) => finding.status === 'Open' || finding.status === 'In Review',
    );
    const candidates = openish.length > 0 ? openish : pool;

    let conflict = false;
    for (let index = 0; index < candidates.length; index++) {
      for (let other = index + 1; other < candidates.length; other++) {
        const left = candidates[index];
        const right = candidates[other];
        if (left === undefined || right === undefined) continue;
        if (suggestionsConflict(left.suggestion, right.suggestion)) {
          conflict = true;
        }
        // Same location, different problems from different reviewers → conflict
        if (
          left.location === right.location &&
          hashText(left.problem) !== hashText(right.problem) &&
          left.sourceReviewers.some((source) => !right.sourceReviewers.includes(source))
        ) {
          conflict = true;
        }
      }
    }

    if (conflict) {
      conflicts.push({
        fingerprint,
        findings: candidates,
        reason: 'overlapping findings with contradictory suggestions or problems',
      });
      // Still emit a provisional winner so the file is usable if LLM is skipped.
      const winner = candidates.reduce(preferFinding);
      const losers = candidates.filter((finding) => finding !== winner);
      const sources = [
        ...new Set(candidates.flatMap((finding) => [...finding.sourceReviewers])),
      ];
      merged.push({
        ...winner,
        sourceReviewers: sources,
        discussion:
          `${mergeDiscussions(winner.discussion, losers)}\n[Orchestrator] Provisional merge of ${candidates.length} overlapping findings (${sources.join(', ')}); awaiting reconciliator if enabled.`.trim(),
      });
      continue;
    }

    // Compatible overlap: keep highest severity, union sources, and carry the
    // losers' Discussion turns into the winner (append-only contract).
    const winner = candidates.reduce(preferFinding);
    const losers = candidates.filter((finding) => finding !== winner);
    const sources = [...new Set(candidates.flatMap((finding) => [...finding.sourceReviewers]))];
    merged.push({
      ...winner,
      sourceReviewers: sources,
      discussion: mergeDiscussions(winner.discussion, losers),
    });
  }

  // Also flag same-location thrash across different fingerprints.
  const byLocation = new Map<string, FindingBlock[]>();
  for (const finding of merged) {
    if (finding.status !== 'Open' && finding.status !== 'In Review') continue;
    const key = finding.location.trim().toLowerCase();
    const group = byLocation.get(key) ?? [];
    group.push(finding);
    byLocation.set(key, group);
  }
  for (const [, group] of byLocation) {
    if (group.length < 2) continue;
    const suggestions = group.map((finding) => finding.suggestion);
    const hasContradiction = suggestions.some((left, index) =>
      suggestions.slice(index + 1).some((right) => suggestionsConflict(left, right)),
    );
    if (!hasContradiction) continue;
    const fingerprint = fingerprintFinding(group[0]?.location ?? '', 'location-cluster');
    if (conflicts.some((conflict) => conflict.fingerprint === fingerprint)) continue;
    conflicts.push({
      fingerprint,
      findings: group,
      reason: 'multiple open findings at the same location with contradictory suggestions',
    });
  }

  // Stable IDs: reuse the existing canonical id for a matching fingerprint;
  // assign next-free ids only to genuinely new findings (the bundled
  // addressing skill's contract requires ids to never change across
  // iterations; remediation dirs and finding-refs key off them).
  const existingIdByFingerprint = new Map<string, string>();
  const usedIds = new Set<string>();
  for (const block of existingBlocks) {
    existingIdByFingerprint.set(fingerprintFinding(block.location, block.problem), block.id);
    usedIds.add(block.id);
  }
  let nextFreeId = 1;
  const stableFindings = merged.map((finding) => {
    const fingerprint = fingerprintFinding(finding.location, finding.problem);
    const existingId = existingIdByFingerprint.get(fingerprint);
    if (existingId !== undefined) return { ...finding, id: existingId };
    while (usedIds.has(`F${nextFreeId}`)) nextFreeId++;
    const id = `F${nextFreeId++}`;
    usedIds.add(id);
    return { ...finding, id };
  });

  const existingIterationMatch = existingCanonical?.match(/- \*\*Iteration\*\*:\s*(\d+)/);
  const existingIteration =
    existingIterationMatch?.[1] !== undefined
      ? parseInt(existingIterationMatch[1], 10)
      : undefined;

  const canonicalMarkdown = buildCanonicalReview({
    target,
    reviewFile,
    iteration,
    findings: stableFindings,
    existingIteration,
  });

  return {
    canonicalMarkdown,
    findings: stableFindings,
    conflicts,
    hadConflicts: conflicts.length > 0,
  };
};

/**
 * Passthrough when a single reviewer already wrote the canonical file.
 * @param {string} content Reviewer output
 * @returns Merge result with no conflicts
 */
export const passthroughMerge = (content: string): MergeResult => ({
  canonicalMarkdown: content,
  findings: parseFindingBlocks(content),
  conflicts: [],
  hadConflicts: false,
});
