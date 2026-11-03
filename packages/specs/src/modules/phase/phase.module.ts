import { Schema } from 'effect';
import { tierOfSpec } from '../creation/index.js';
import { fieldList, fieldString, parseMarkdown } from '../frontmatter/index.js';
import type { FieldValue } from '../frontmatter/index.js';
import { GATE_RESULTS_FILE, latestResults, parseGateResults } from '../gates/index.js';
import { PHASE_PATTERN, type PhaseId } from '../spec/index.js';
import {
  type Task,
  type TaskStatus,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
} from '../task/index.js';
import { type Issue, type Result, finding, issue, noErrors } from '../verify/index.js';
import { waiverAllowed } from '../tier/index.js';
import type { SpecSnapshot } from '../structure/index.js';

/** Per-phase record file, beside the task directories. */
export const PHASE_FILE = 'PHASE.md';

/** Phase-level memory file. */
export const PHASE_MEMORY_FILE = 'MEMORY.md';

/** Phase-level gate file. */
export const PHASE_GATES_FILE = 'GATES.md';

/** Phase-level broadcast board. */
export const PHASE_BOARD_FILE = 'BOARD.md';

/** Files a v2 phase directory may contain directly. */
export const PHASE_DIR_FILES = new Set([
  PHASE_FILE,
  PHASE_MEMORY_FILE,
  PHASE_GATES_FILE,
  GATE_RESULTS_FILE,
  PHASE_BOARD_FILE,
]);

/** Files a v2 phase directory must contain. */
export const PHASE_DIR_REQUIRED = [PHASE_FILE, PHASE_MEMORY_FILE] as const;

/** Derived phase status vocabulary. */
export const PHASE_STATUSES = ['pending', 'in-progress', 'blocked', 'complete'] as const;

/** Derived phase status. */
export const PhaseStatus = Schema.Literals(PHASE_STATUSES);

/** Derived phase status. */
export type PhaseStatus = typeof PhaseStatus.Type;

/** Per-phase review decision. */
export const PHASE_REVIEWS = ['required', 'waived'] as const;

/** Per-phase review decision. */
export const PhaseReview = Schema.Literals(PHASE_REVIEWS);

/** Per-phase review decision. */
export type PhaseReview = typeof PhaseReview.Type;

/** Declared phase-gate kind. */
export const PHASE_GATES = ['none', 'mechanical', 'subjective'] as const;

/** Declared phase-gate kind. */
export const PhaseGate = Schema.Literals(PHASE_GATES);

/** Declared phase-gate kind. */
export type PhaseGate = typeof PhaseGate.Type;

/** A classified gate stage kind. */
export type GateKind = 'mechanical' | 'subjective';

/** Stable codes for the `PHASE.md` record rules. */
export const PHASE_CODES = {
  missing: 'phase.missing',
  idMismatch: 'phase.id-mismatch',
  objectiveMissing: 'phase.objective-missing',
  statusInvalid: 'phase.status-invalid',
  statusStale: 'phase.status-stale',
  reviewInvalid: 'phase.review-invalid',
  reasonMissing: 'phase.reason-missing',
  reasonUnexpected: 'phase.reason-unexpected',
  evidenceUnexpected: 'phase.evidence-unexpected',
  evidenceInvalid: 'phase.evidence-invalid',
  evidenceUnresolved: 'phase.evidence-unresolved',
  waiverUnproven: 'phase.waiver-unproven',
  waiverWithReviewTask: 'phase.waiver-with-review-task',
  reviewTaskMissing: 'phase.review-task-missing',
  gateInvalid: 'phase.gate-invalid',
  gateFileMissing: 'phase.gate-file-missing',
  gateUnexpected: 'phase.gate-unexpected',
  gateMismatch: 'phase.gate-mismatch',
  memoryMissing: 'phase.memory-missing',
  titleMismatch: 'phase.title-mismatch',
} as const;

/** One evidence reference: `phase:<stage>` or `<task-id>:<stage>`. */
export const EVIDENCE_REF_PATTERN = /^(?:phase|[A-Z]{1,2}\d{3}):(?:0|[1-9]\d*)$/;

/** Values that are placeholders rather than a real review reason. */
const PLACEHOLDER_REASONS = new Set(['todo', 'tbd', 'n/a', 'none', '-']);

/** One `## Stage N: Title (kind)` heading. */
const CLASSIFIED_STAGE = /^##\s+Stage\s+(\d+):\s+(.+?)\s*\((mechanical|subjective)\)\s*$/;

/** Any `## Stage N:` heading, classified or not. */
const ANY_STAGE = /^##\s+Stage\s+(\d+):\s*(.*)$/;

/**
 * One parsed `PHASE.md` descriptor.
 * `id` must equal the phase directory name; `status` is a mirror of the
 * derived task statuses, never a second source of truth.
 */
export class Phase extends Schema.Class<Phase>('SpecPhase')({
  id: Schema.String.check(Schema.isPattern(PHASE_PATTERN)),
  objective: Schema.NonEmptyString,
  status: PhaseStatus,
  review: PhaseReview,
  gate: PhaseGate,
  reviewReason: Schema.optionalKey(Schema.String),
  reviewEvidence: Schema.Array(Schema.String),
}) {}

/** Normalized phase frontmatter input, before schema validation. */
const phaseInput = (fields: Record<string, FieldValue>) => {
  const reason = fieldString(fields, 'review-reason');
  const input = {
    id: fieldString(fields, 'id') ?? '',
    objective: fieldString(fields, 'objective') ?? '',
    status: fieldString(fields, 'status') ?? '',
    review: fieldString(fields, 'review') ?? '',
    gate: fieldString(fields, 'gate') ?? '',
    reviewEvidence: fieldList(fields, 'review-evidence'),
  };
  return reason === undefined ? input : { ...input, reviewReason: reason };
};

/**
 * Parse and schema-validate a `PHASE.md` document.
 * @param markdown - raw `PHASE.md` contents
 * @returns the phase descriptor, or undefined when invalid
 */
export const parsePhaseFile = (markdown: string): Phase | undefined => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) return undefined;
  try {
    return Schema.decodeUnknownSync(Phase)(phaseInput(parsed.fields));
  } catch {
    return undefined;
  }
};

/**
 * Derive a phase's status from its task statuses (phase-rank order).
 * @param statuses - every parsed task status in the phase
 * @returns the derived status
 */
export const derivePhaseStatus = (statuses: ReadonlyArray<TaskStatus>): PhaseStatus => {
  if (statuses.every((status) => status === 'complete')) return 'complete';
  if (statuses.some((status) => status === 'in-progress' || status === 'complete')) {
    return 'in-progress';
  }
  if (statuses.some((status) => status === 'blocked')) return 'blocked';
  return 'pending';
};

/** True when `value` is a real review reason rather than a placeholder. */
export const isReviewReason = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.includes('<') || trimmed.includes('>')) return false;
  return !PLACEHOLDER_REASONS.has(trimmed.toLowerCase());
};

/** First word of an objective, lowercased, so `TODO: x` reads as `todo`. */
const objectiveHead = (value: string): string =>
  /^[a-z/]+/i.exec(value.trim())?.[0]?.toLowerCase() ?? '';

/**
 * True when `value` is a real phase objective rather than a placeholder. A
 * blank value, angle-bracket template, or a `TODO` / `TBD` / `N/A` token
 * (case-insensitive, with or without trailing prose) is not an objective.
 */
export const isPhaseObjective = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.includes('<') || trimmed.includes('>')) return false;
  if (trimmed === '-') return false;
  return !PLACEHOLDER_REASONS.has(objectiveHead(trimmed));
};

/** A classified stage parsed from a phase `GATES.md`. */
export interface ClassifiedStage {
  /** Stage number as written. */
  readonly stage: number;
  /** Stage title, without the kind suffix. */
  readonly title: string;
  /** Declared stage kind, when the heading carries one. */
  readonly kind?: GateKind;
}

/**
 * Parse the stage headings of a phase `GATES.md`, keeping the declared kind
 * when present. A stage heading with no kind keeps `kind: undefined`, so the
 * phase verifier can report `phase.gate-mismatch` instead of guessing.
 * @param markdown - raw phase `GATES.md` contents
 * @returns one entry per stage heading, in file order
 */
export const parsePhaseGateStages = (markdown: string): ReadonlyArray<ClassifiedStage> => {
  const stages: Array<ClassifiedStage> = [];
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    const classified = CLASSIFIED_STAGE.exec(trimmed);
    if (classified !== null) {
      const stage = Number(classified[1] ?? '0');
      const title = (classified[2] ?? '').trim();
      const kind = classified[3];
      if (kind === 'mechanical' || kind === 'subjective') {
        stages.push({ stage, title, kind });
      } else {
        stages.push({ stage, title });
      }
      continue;
    }
    const any = ANY_STAGE.exec(trimmed);
    if (any !== null) {
      stages.push({ stage: Number(any[1] ?? '0'), title: (any[2] ?? '').trim() });
    }
  }
  return stages;
};

/** Context the phase verifier needs from the phase directory and its tasks. */
export interface PhaseContext {
  /** Every parsed task status in the phase; empty when a task failed to parse. */
  readonly taskStatuses: ReadonlyArray<TaskStatus>;
  /** Every parsed task type in the phase. */
  readonly taskTypes: ReadonlyArray<string>;
  /** Phase `GATES.md` contents, when present. */
  readonly gateText?: string | undefined;
}

/** Render the standard `MEMORY.md` template every phase directory carries. */
export const renderPhaseMemory = (): string =>
  [
    '# Memory',
    '',
    '## Context',
    '',
    'None yet.',
    '',
    '## Progress',
    '',
    '- pending',
    '',
    '## Open Questions',
    '',
    '- None.',
    '',
    '## Handoff',
    '',
    '- See PHASE.md.',
    '',
    '## Deviations',
    '',
    '- None.',
    '',
    '## Execution Brief',
    '',
    '- Read: <this brief, the task TASK.md/GATES.md, and only the scoped source paths; no broad grep over generated payloads, lockfiles, or other tasks.>',
    '- Write scope: <the task directory plus only the files TASK.md names; record writes go to the task MEMORY.md.>',
    '- Gate: <point at the task or phase GATES.md; the worker runs scoped checks, and the orchestrator runs each gate once.>',
    '- Record: <keep the worker MEMORY.md at or under 80 lines; full logs go to /tmp/<task-id>.log.>',
    '- Review: <batch every open finding into one fixer attempt and one re-review after review decide.>',
    '',
  ].join('\n');

/** Render a phase record. */
export const renderPhaseFile = (input: {
  readonly id: string;
  readonly objective: string;
  readonly status: PhaseStatus;
  readonly review: PhaseReview;
  readonly gate: PhaseGate;
  readonly reviewReason?: string | undefined;
  readonly reviewEvidence?: ReadonlyArray<string> | undefined;
  readonly notes?: string | undefined;
}): string =>
  [
    '---',
    `id: ${input.id}`,
    `objective: ${input.objective}`,
    `status: ${input.status}`,
    `review: ${input.review}`,
    ...(input.review === 'waived' && input.reviewReason !== undefined
      ? [`review-reason: ${input.reviewReason}`]
      : []),
    ...(input.review === 'waived' && (input.reviewEvidence ?? []).length > 0
      ? [`review-evidence: ${(input.reviewEvidence ?? []).join(', ')}`]
      : []),
    `gate: ${input.gate}`,
    '---',
    '',
    `# Phase ${input.id}`,
    '',
    '## Notes',
    '',
    input.notes?.trim() || 'None yet.',
    '',
  ].join('\n');

/** One review decision written into a `PHASE.md` frontmatter block. */
export interface PhaseReviewWrite {
  readonly review: PhaseReview;
  readonly reason?: string | undefined;
  readonly evidence?: ReadonlyArray<string> | undefined;
}

/**
 * Rewrite only the review fields of a `PHASE.md`, preserving every other byte.
 * `--required` removes the reason and evidence; `--waived` writes both after the
 * decision line, so a hand-written notes section and all other fields survive.
 * @param markdown - raw `PHASE.md` contents
 * @param write - the review decision and its evidence
 * @returns the rewritten document
 */
export const renderPhaseReview = (markdown: string, write: PhaseReviewWrite): string => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(newline);
  if ((lines[0] ?? '').trim() !== '---') return markdown;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closing === -1) return markdown;
  const kept = lines
    .slice(1, closing)
    .filter((line) => !/^review(?:\s*:|-reason\s*:|-evidence\s*:)/.test(line.trim()));
  const index = kept.findIndex((line) => /^review\s*:/.test(line.trim()));
  const reviewLines = [`review: ${write.review}`];
  if (write.review === 'waived' && write.reason !== undefined) {
    reviewLines.push(`review-reason: ${write.reason}`);
    if ((write.evidence ?? []).length > 0) {
      reviewLines.push(`review-evidence: ${(write.evidence ?? []).join(', ')}`);
    }
  }
  if (index === -1) kept.push(...reviewLines);
  else kept.splice(index, 1, ...reviewLines);
  return [lines[0] ?? '---', ...kept, ...lines.slice(closing)].join(newline);
};

/** The required `# Phase <id>` title, with its captured id. */ const phaseTitle = (
  body: string,
): string | undefined => {
  const match = /^#\s+Phase\s+([A-Z]{1,2})\s*$/m.exec(body);
  return match === null ? undefined : (match[1] ?? '');
};

/**
 * Mechanically verify one `PHASE.md` against the v2 phase contract.
 * `status` is a conformity mirror: it must equal the status derived from the
 * phase's tasks. Review evidence is checked for grammar, duplicates, and
 * ownership here; result coverage is checked by {@link phaseEvidence}. Pure —
 * no IO.
 * @param dirName - the phase directory name (the phase id)
 * @param markdown - raw `PHASE.md` contents
 * @param context - task statuses/types and the phase gate file
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyPhaseFile = (
  dirName: string,
  markdown: string,
  context: PhaseContext,
): Result => {
  const issues: Array<Issue> = [];
  const parsed = parseMarkdown(markdown);
  if (parsed === null) {
    return {
      valid: false,
      issues: [
        finding({
          code: PHASE_CODES.missing,
          field: 'frontmatter',
          message: 'Missing frontmatter block.',
        }),
      ],
    };
  }
  const { fields, body } = parsed;

  const id = fieldString(fields, 'id');
  if (id === undefined || id.trim() === '') {
    issues.push(issue('id', 'Required frontmatter field is missing or empty.'));
  } else if (!PHASE_PATTERN.test(id)) {
    issues.push(issue('id', 'Must be one or two uppercase letters (e.g. A, AA).'));
  } else if (id !== dirName) {
    issues.push(
      finding({
        code: PHASE_CODES.idMismatch,
        field: 'id',
        message: `Phase id '${id}' does not match the directory name '${dirName}'.`,
        expected: `id: ${dirName}`,
        actual: id,
        fix: `Set \`id: ${dirName}\`.`,
      }),
    );
  }

  const objective = fieldString(fields, 'objective');
  if (!isPhaseObjective(objective)) {
    issues.push(
      finding({
        code: PHASE_CODES.objectiveMissing,
        field: 'objective',
        message: 'Required phase objective is missing, blank, or a placeholder.',
        expected: 'one non-empty line describing what the phase must achieve',
        actual: objective === undefined || objective.trim() === '' ? 'missing' : objective,
        fix: 'Write the phase objective on one line in PHASE.md.',
      }),
    );
  }

  const status = fieldString(fields, 'status');
  if (status === undefined || status.trim() === '') {
    issues.push(issue('status', 'Required frontmatter field is missing or empty.'));
  } else if (!PHASE_STATUSES.some((value) => value === status)) {
    issues.push(
      finding({
        code: PHASE_CODES.statusInvalid,
        field: 'status',
        message: `Unknown phase status '${status}'.`,
        expected: `one of: ${PHASE_STATUSES.join(', ')}`,
        actual: status,
        fix: 'Use a derived phase status, or let the status generator update the mirror.',
      }),
    );
  } else if (context.taskStatuses.length > 0) {
    const derived = derivePhaseStatus(context.taskStatuses);
    if (status !== derived) {
      issues.push(
        finding({
          code: PHASE_CODES.statusStale,
          field: 'status',
          message: `Phase status is '${status}' but its tasks derive '${derived}'.`,
          expected: derived,
          actual: status,
          fix: 'Bring the PHASE.md status mirror in line with the phase tasks.',
        }),
      );
    }
  }

  const review = fieldString(fields, 'review');
  const reviewValid = review !== undefined && PHASE_REVIEWS.some((value) => value === review);
  if (!reviewValid) {
    issues.push(
      finding({
        code: PHASE_CODES.reviewInvalid,
        field: 'review',
        message: `Phase review decision '${review ?? ''}' is not 'required' or 'waived'.`,
        expected: 'required or waived',
        actual: review ?? 'missing',
        fix: 'Set `review: required` or `review: waived`.',
      }),
    );
  }

  const reason = fieldString(fields, 'review-reason');
  const evidence = fieldList(fields, 'review-evidence');
  if (review === 'waived') {
    if (!isReviewReason(reason)) {
      issues.push(
        finding({
          code: PHASE_CODES.reasonMissing,
          field: 'review-reason',
          message: 'A waived phase needs one non-placeholder reason.',
          expected: 'one line explaining why the gates stand in for a review round',
          actual: reason ?? 'missing',
          fix: 'Add `review-reason: <one line>` to PHASE.md.',
        }),
      );
    }
  } else if (review === 'required') {
    if (reason !== undefined && reason.trim() !== '') {
      issues.push(
        finding({
          code: PHASE_CODES.reasonUnexpected,
          field: 'review-reason',
          message: '`review-reason` is only valid on a waived phase.',
          expected: 'no review-reason field',
          actual: reason,
          fix: 'Remove `review-reason`, or set `review: waived`.',
        }),
      );
    }
    if (evidence.length > 0) {
      issues.push(
        finding({
          code: PHASE_CODES.evidenceUnexpected,
          field: 'review-evidence',
          message: '`review-evidence` is only valid on a waived phase.',
          expected: 'no review-evidence field',
          actual: evidence.join(', '),
          fix: 'Remove `review-evidence`, or set `review: waived`.',
        }),
      );
    }
  }

  const seen = new Set<string>();
  for (const ref of evidence) {
    const [owner] = ref.split(':');
    const duplicate = seen.has(ref);
    const valid = EVIDENCE_REF_PATTERN.test(ref);
    const foreign = valid && owner !== undefined && owner !== 'phase' && phaseOf(owner) !== dirName;
    if (!valid || duplicate || foreign) {
      issues.push(
        finding({
          code: PHASE_CODES.evidenceInvalid,
          field: 'review-evidence',
          message: duplicate
            ? `Evidence reference '${ref}' is listed more than once.`
            : foreign
              ? `Evidence reference '${ref}' names a task outside phase '${dirName}'.`
              : `Evidence reference '${ref}' is not 'phase:<stage>' or '<task-id>:<stage>'.`,
          expected: 'comma-separated `phase:<n>` or `<task-id>:<n>` references',
          actual: ref,
          fix: 'Use a stage number and a task id inside this phase (or `phase`).',
        }),
      );
    }
    seen.add(ref);
  }

  const hasReviewTask = context.taskTypes.includes('review');
  if (review === 'waived' && hasReviewTask) {
    issues.push(
      finding({
        code: PHASE_CODES.waiverWithReviewTask,
        field: 'review',
        message: 'A waived phase must not hold a review task.',
        expected: 'no review-type task in a waived phase',
        actual: 'review task present',
        fix: 'Remove the review task, or set `review: required`.',
      }),
    );
  }
  if (review === 'required' && !hasReviewTask) {
    issues.push(
      finding({
        code: PHASE_CODES.reviewTaskMissing,
        severity: 'warning',
        field: 'review',
        message: 'A required phase holds no review task; the phase stays unlocked.',
        expected: 'a review-type task, or `review: waived`',
        actual: 'no review task',
        fix: 'Request a review task when the tier needs one, or waive the phase explicitly.',
      }),
    );
  }

  const gate = fieldString(fields, 'gate');
  const gateValid = gate !== undefined && PHASE_GATES.some((value) => value === gate);
  if (!gateValid) {
    issues.push(
      finding({
        code: PHASE_CODES.gateInvalid,
        field: 'gate',
        message: `Phase gate kind '${gate ?? ''}' is not 'none', 'mechanical', or 'subjective'.`,
        expected: 'none, mechanical, or subjective',
        actual: gate ?? 'missing',
        fix: 'Set `gate` to the kind of the phase gate.',
      }),
    );
  } else if (context.gateText === undefined) {
    if (gate !== 'none') {
      issues.push(
        finding({
          code: PHASE_CODES.gateFileMissing,
          field: 'gate',
          message: `Phase declares a ${gate} gate but has no GATES.md.`,
          expected: 'a phase GATES.md',
          actual: 'missing',
          fix: 'Add the phase GATES.md, or set `gate: none`.',
        }),
      );
    }
  } else if (gate === 'none') {
    issues.push(
      finding({
        code: PHASE_CODES.gateUnexpected,
        field: 'gate',
        message: 'A phase GATES.md exists but `gate` is `none`.',
        expected: 'gate: mechanical or gate: subjective',
        actual: 'none',
        fix: 'Declare the phase gate kind, or remove the phase GATES.md.',
      }),
    );
  } else {
    const stages = parsePhaseGateStages(context.gateText);
    const wrong = stages.find((stage) => stage.kind !== gate);
    if (stages.length === 0 || wrong !== undefined) {
      issues.push(
        finding({
          code: PHASE_CODES.gateMismatch,
          field: 'gate',
          message:
            stages.length === 0
              ? 'A phase GATES.md must hold at least one classified stage.'
              : `Stage ${wrong?.stage ?? '?'} is not classified as '${gate}'.`,
          expected: `every phase-gate stage classified '(${gate})'`,
          actual: wrong?.kind ?? 'unclassified',
          fix: `Classify every phase-gate stage as (${gate}), or change PHASE.md gate.`,
        }),
      );
    }
  }

  const title = phaseTitle(body);
  if (title === undefined || (id !== undefined && title !== id)) {
    issues.push(
      finding({
        code: PHASE_CODES.titleMismatch,
        field: 'body',
        message:
          title === undefined
            ? `Body must carry a '# Phase ${dirName}' title.`
            : `Body title is '# Phase ${title}', not '# Phase ${dirName}'.`,
        expected: `# Phase ${dirName}`,
        actual: title === undefined ? 'missing' : `# Phase ${title}`,
        fix: `Add or correct the '# Phase ${dirName}' title.`,
      }),
    );
  }

  return { valid: noErrors(issues), issues };
};

/** Evidence derived from the phase records, its gates, and its results. */
export interface PhaseEvidence {
  /** Phases with a valid, fully proven waiver. */
  readonly waived: ReadonlyArray<string>;
  /** Phases whose classified mechanical stages all have a latest pass. */
  readonly proven: ReadonlyArray<string>;
  /** Coverage findings that need the recorded results. */
  readonly issues: ReadonlyArray<Issue>;
}

/**
 * Derive phase evidence from a snapshot: effective waivers, gate proof, and the
 * coverage findings that need `GATE-RESULTS.jsonl`. A phase with no classified
 * mechanical stage is vacuously proven, which keeps every v1 tree unchanged.
 * @param snapshot - every file and directory under the spec root
 * @returns the waived and proven phase ids plus coverage findings
 */
export const phaseEvidence = (snapshot: SpecSnapshot): PhaseEvidence => {
  const files = snapshot.files.filter((entry) => (entry.kind ?? 'file') === 'file');
  const directories = new Set<string>();
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'directory') continue;
    let path = entry.path;
    while (path !== '') {
      directories.add(path);
      const slash = path.lastIndexOf('/');
      path = slash === -1 ? '' : path.slice(0, slash);
    }
  }
  for (const file of files) {
    let parent = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    while (parent !== '') {
      directories.add(parent);
      parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : '';
    }
  }

  const fileAt = (path: string): string | undefined =>
    files.find((entry) => entry.path === path)?.content;
  const childrenOf = (parent: string): ReadonlyArray<string> =>
    [...directories].filter(
      (dir) => (dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '') === parent,
    );

  const waived: Array<string> = [];
  const proven: Array<string> = [];
  const issues: Array<Issue> = [];
  const specText = fileAt('SPEC.md');
  const tier = specText === undefined ? undefined : tierOfSpec(specText);

  for (const phase of childrenOf('')
    .filter((dir) => PHASE_PATTERN.test(dir))
    .toSorted()) {
    const phaseFile = fileAt(`${phase}/${PHASE_FILE}`);
    const parsed = phaseFile === undefined ? undefined : parsePhaseFile(phaseFile);
    const taskDirs = childrenOf(phase);
    const tasks: Array<Task> = [];
    for (const dir of taskDirs) {
      const taskFile = fileAt(`${dir}/TASK.md`);
      const task = taskFile === undefined ? undefined : parseTaskFile(taskFile);
      if (task !== undefined) tasks.push(task);
    }
    const taskTypes = tasks.map((task) => task.type);
    const complete = tasks.length > 0 && tasks.every((task) => task.status === 'complete');

    const refs = new Map<string, { kind: GateKind; pass: boolean }>();
    const collect = (owner: string, gatesPath: string, resultsPath: string): void => {
      const gates = fileAt(gatesPath);
      if (gates === undefined) return;
      const resultsFile = fileAt(resultsPath);
      const parsedResults = resultsFile === undefined ? undefined : parseGateResults(resultsFile);
      const latest = parsedResults === undefined ? undefined : latestResults(parsedResults.records);
      for (const stage of parsePhaseGateStages(gates)) {
        if (stage.kind === undefined) continue;
        const ref = `${owner}:${stage.stage}`;
        const result = latest?.get(stage.stage);
        refs.set(ref, {
          kind: stage.kind,
          pass: result?.kind === stage.kind && result.verdict === 'pass',
        });
      }
    };
    collect('phase', `${phase}/${PHASE_GATES_FILE}`, `${phase}/${GATE_RESULTS_FILE}`);
    for (const dir of taskDirs) {
      const leaf = dir.includes('/') ? dir.slice(dir.lastIndexOf('/') + 1) : dir;
      const parsedDir = parseTaskDirName(leaf);
      if (parsedDir === undefined) continue;
      collect(parsedDir.id, `${dir}/${PHASE_GATES_FILE}`, `${dir}/${GATE_RESULTS_FILE}`);
    }

    const mechanical = [...refs.values()].filter((ref) => ref.kind === 'mechanical');
    if (mechanical.every((ref) => ref.pass)) proven.push(phase);

    if (parsed !== undefined) {
      const evidenceRefs = new Set(parsed.reviewEvidence);
      for (const ref of evidenceRefs) {
        if (!refs.has(ref)) {
          issues.push(
            finding({
              code: PHASE_CODES.evidenceUnresolved,
              field: 'review-evidence',
              message: `Evidence reference '${ref}' resolves to no classified gate stage.`,
              expected: 'a stage declared in this phase or its tasks',
              actual: ref,
              fix: 'Name an existing stage, or regenerate the waiver with the waiver verb.',
            }),
          );
        }
      }

      const allStagesPass = [...refs.values()].every((ref) => ref.pass);
      const coverage =
        refs.size > 0 &&
        allStagesPass &&
        evidenceRefs.size === refs.size &&
        [...refs.keys()].every((ref) => evidenceRefs.has(ref));
      const waiver =
        parsed.review === 'waived' &&
        isReviewReason(parsed.reviewReason) &&
        !taskTypes.includes('review') &&
        complete &&
        tier !== undefined &&
        waiverAllowed(tier, taskTypes) &&
        coverage;
      if (waiver) waived.push(phase);
      if (parsed.review === 'waived' && complete && !waiver) {
        issues.push(
          finding({
            code: PHASE_CODES.waiverUnproven,
            field: 'review',
            message: `Phase '${phase}' declares a waiver that is not fully proven by recorded gate results.`,
            expected: 'every classified stage passing and named in review-evidence',
            actual: 'incomplete coverage',
            fix: 'Run the gates and record their passes, or change the phase to review: required.',
          }),
        );
      }
    }
  }

  return { waived, proven, issues };
};

/** Re-export the phase id brand for callers that only need the type. */
export type { PhaseId };
