import {
  fingerprintFinding,
  hashText,
  type LoopState,
  type TrackedFinding,
  type FindingTransition,
} from './loop-state';
import { parseFindingBlocks, SUMMARY_SECTION_RE, type FindingBlock } from './findings';

export interface DeadlockUpdate {
  readonly state: LoopState;
  readonly markdown: string;
  readonly newlyDeadlocked: readonly string[];
}

/**
 * Appends an orchestrator Discussion turn and sets Status to Escalated.
 * @param {string} markdown Canonical review markdown
 * @param {string} findingId Finding id to escalate
 * @param {string} reason Deadlock reason
 * @returns Updated markdown
 */
const escalateFindingInMarkdown = (
  markdown: string,
  findingId: string,
  reason: string,
): string => {
  const turn =
    `[Orchestrator] Deadlock detected: ${reason}. Escalating — further fixer thrash will not run on this finding.\n`;

  // Locate THIS finding's block: from its header to the next finding header
  // or section. Scoping is essential — the old greedy pattern could reach
  // across a Status-less block into a neighbor's Status line and corrupt it
  // (F4).
  const startMatch = markdown.match(
    new RegExp(`^#### ${findingId}\\s+(?:—|--|-).*$`, 'm'),
  );
  const start = startMatch?.index;
  if (start === undefined) return markdown;
  const tail = markdown.slice(start);
  const headerEnd = tail.indexOf('\n');
  const body = tail.slice(headerEnd + 1);
  const nextBlock = body.search(/^#### F\\d+\\s+(?:—|--|-)|^##\\s/m);
  const blockEnd = nextBlock < 0 ? tail.length : headerEnd + 1 + nextBlock;
  const block = tail.slice(0, blockEnd);

  // Set Status: Escalated — replace the LAST Status line in the block's head
  // (fields precede Discussion, and Status is the last of them), or insert one
  // before Attempts when the block has none (F4).
  const head = block.split(/\n### Discussion\b/)[0] ?? block;
  const statusRe = /- \*\*Status\*\*: [^\n]*/g;
  const statuses = [...head.matchAll(statusRe)];
  const last = statuses[statuses.length - 1];
  let next = block;
  if (last !== undefined && last.index !== undefined) {
    next =
      next.slice(0, last.index) +
      '- **Status**: Escalated' +
      next.slice(last.index + last[0].length);
  } else {
    next = next.replace(/(- \*\*Attempts\*\*:)/, '- **Status**: Escalated\n$1');
  }

  // Append the orchestrator turn under Discussion.
  next = next.replace(/(### Discussion\s*\n)/, `$1${turn}`);
  return markdown.slice(0, start) + next + markdown.slice(start + blockEnd);
};

/**
 * Bumps Summary Escalated/Open/In Review counts after deadlock escalations.
 * @param {string} markdown Review markdown
 * @param {number} newlyEscalated Count of findings newly escalated
 * @returns Updated markdown with adjusted summary (best-effort)
 */
const adjustSummaryAfterDeadlocks = (markdown: string, newlyEscalated: number): string => {
  if (newlyEscalated <= 0) return markdown;

  const bump = (label: string, delta: number): ((text: string) => string) => (text) =>
    text.replace(
      new RegExp(`(- \\*\\*${label}\\*\\*:\\s*)(\\d+)`),
      (_match, prefix: string, digits: string) => {
        const next = Math.max(0, parseInt(digits, 10) + delta);
        return `${prefix}${next}`;
      },
    );

  // Anchor every count edit to the `## Summary` section: a document-wide
  // replace would bump the first `- **Open**:`/`- **Escalated**:` line found
  // anywhere (finding Problem/Impact/Discussion text frequently quotes review
  // content) and leave the real Summary stale.
  const sectionMatch = markdown.match(SUMMARY_SECTION_RE);
  const section = sectionMatch?.[0];
  if (section === undefined) return markdown;

  // Move counts from Open/In Review into Escalated (approximate — exact rebuild
  // happens on the next merge cycle).
  let next = bump('Escalated', newlyEscalated)(section);
  // Prefer decrementing Open first.
  const openMatch = next.match(/- \*\*Open\*\*:\s*(\d+)/);
  const open = openMatch?.[1] !== undefined ? parseInt(openMatch[1], 10) : 0;
  const fromOpen = Math.min(open, newlyEscalated);
  next = bump('Open', -fromOpen)(next);
  const remaining = newlyEscalated - fromOpen;
  if (remaining > 0) next = bump('In Review', -remaining)(next);
  return markdown.replace(SUMMARY_SECTION_RE, () => next);
};

/**
 * Updates loop-state from the current canonical findings and escalates deadlocks.
 * Flip detection: Open → In Review → Open (or status oscillation) at/above threshold,
 * or patch-hash A → B → A at the same fingerprint.
 * @param {object} input Current state + canonical markdown + cycle
 * @returns Updated state, markdown, and newly deadlocked ids
 */
export const applyDeadlockDetection = (input: {
  readonly state: LoopState;
  readonly markdown: string;
  readonly cycle: number;
  readonly flipThreshold: number;
}): DeadlockUpdate => {
  const { state, cycle, flipThreshold } = input;
  let markdown = input.markdown;
  const findings = parseFindingBlocks(markdown);
  const nextFindings: Record<string, TrackedFinding> = { ...state.findings };
  const newlyDeadlocked: string[] = [];
  const reEscalated: string[] = [];

  for (const finding of findings) {
    const fingerprint = fingerprintFinding(finding.location, finding.problem);
    const patchHash =
      finding.suggestion.trim() === '' ? undefined : hashText(finding.suggestion);
    const previous = nextFindings[finding.id] ?? nextFindingsByFingerprint(nextFindings, fingerprint);

    const transition: FindingTransition = {
      cycle,
      status: finding.status,
      sourceReviewers: finding.sourceReviewers,
      patchHash,
    };

    const transitions = previous !== undefined ? [...previous.transitions, transition] : [transition];
    let flipCount = previous?.flipCount ?? 0;

    if (previous !== undefined) {
      const priorStatus = previous.transitions[previous.transitions.length - 1]?.status;
      if (
        priorStatus !== undefined &&
        priorStatus !== finding.status &&
        (finding.status === 'Open' || finding.status === 'In Review') &&
        (priorStatus === 'Open' || priorStatus === 'In Review' || priorStatus === 'Escalated')
      ) {
        // Count reopen / oscillation between actionable statuses.
        if (priorStatus === 'In Review' && finding.status === 'Open') flipCount += 1;
        if (priorStatus === 'Open' && finding.status === 'In Review' && flipCount > 0) {
          // completing a flip cycle already counted on reopen; no-op
        }
      }

      if (
        previous.lastPatchHash !== undefined &&
        patchHash !== undefined &&
        previous.lastPatchHash !== patchHash
      ) {
        const earlier = previous.transitions
          .map((item) => item.patchHash)
          .filter((hash): hash is string => hash !== undefined);
        if (earlier.includes(patchHash)) {
          // Suggestion direction reverted to a prior hash → thrash.
          flipCount += 1;
        }
      }
    }

    const deadlocked =
      (previous?.deadlocked ?? false) ||
      finding.status === 'Escalated' ||
      flipCount >= flipThreshold;

    if (deadlocked && finding.status !== 'Escalated') {
      // Enforcement always re-applies to the file: a finding whose status was
      // flipped back to Open/In Review (merge resurrection, reviewer reopen
      // without a [Human] turn) must be re-escalated. previous.deadlocked only
      // suppresses the duplicate notification, never the enforcement.
      markdown = escalateFindingInMarkdown(
        markdown,
        finding.id,
        `status/suggestion oscillation flipCount=${flipCount} (threshold=${flipThreshold}) at ${finding.location}`,
      );
      if (!(previous?.deadlocked ?? false)) {
        newlyDeadlocked.push(finding.id);
      } else {
        reEscalated.push(finding.id);
      }
    }

    nextFindings[finding.id] = {
      id: finding.id,
      fingerprint,
      location: finding.location,
      transitions,
      flipCount,
      lastPatchHash: patchHash ?? previous?.lastPatchHash,
      deadlocked: deadlocked || newlyDeadlocked.includes(finding.id),
    };
  }

  // Same-location cross-finding thrash: two open findings at one location with
  // contradictory suggestions across cycles.
  const byLocation = new Map<string, FindingBlock[]>();
  for (const finding of findings) {
    if (finding.status !== 'Open' && finding.status !== 'In Review') continue;
    const key = finding.location.trim().toLowerCase();
    const group = byLocation.get(key) ?? [];
    group.push(finding);
    byLocation.set(key, group);
  }
  for (const [, group] of byLocation) {
    if (group.length < 2) continue;
    // Require thrash evidence: only findings that persisted across a prior
    // cycle (tracked transitions > 1) or already consumed a fix attempt are
    // eligible. Distinct first-cycle findings at a busy location with
    // Attempts: 0 are not deadlock evidence.
    const eligible = group.filter((finding) => {
      if (finding.attempts !== '0') return true;
      const tracked = nextFindings[finding.id];
      return tracked !== undefined && tracked.transitions.length > 1;
    });
    if (eligible.length < 2) continue;
    const hashes = eligible
      .map((finding) => (finding.suggestion.trim() === '' ? undefined : hashText(finding.suggestion)))
      .filter((hash): hash is string => hash !== undefined);
    const unique = new Set(hashes);
    if (unique.size < 2) continue;
    for (const finding of eligible) {
      if (finding.status === 'Escalated') continue;
      if (newlyDeadlocked.includes(finding.id) || reEscalated.includes(finding.id)) continue;
      newlyDeadlocked.push(finding.id);
      markdown = escalateFindingInMarkdown(
        markdown,
        finding.id,
        `cross-reviewer contradiction at ${finding.location}`,
      );
      const tracked = nextFindings[finding.id];
      if (tracked !== undefined) {
        nextFindings[finding.id] = { ...tracked, deadlocked: true, flipCount: tracked.flipCount + 1 };
      }
    }
  }

  const escalatedInFile = newlyDeadlocked.length + reEscalated.length;
  if (escalatedInFile > 0) {
    markdown = adjustSummaryAfterDeadlocks(markdown, escalatedInFile);
  }

  const deadlocks = [
    ...new Set([
      ...state.deadlocks,
      ...newlyDeadlocked,
      ...Object.values(nextFindings).filter((item) => item.deadlocked).map((item) => item.id),
    ]),
  ];

  return {
    state: {
      ...state,
      cycle,
      findings: nextFindings,
      deadlocks,
    },
    markdown,
    newlyDeadlocked,
  };
};

/**
 * Finds a tracked finding by fingerprint when ids were remapped.
 * @param {Readonly<Record<string, TrackedFinding>>} findings Tracked findings
 * @param {string} fingerprint Fingerprint to match
 * @returns Matching tracked finding, if any
 */
const nextFindingsByFingerprint = (
  findings: Readonly<Record<string, TrackedFinding>>,
  fingerprint: string,
): TrackedFinding | undefined =>
  Object.values(findings).find((item) => item.fingerprint === fingerprint);
