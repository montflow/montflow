import { createHash } from 'node:crypto';
import nodePath from 'node:path';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

export interface FindingTransition {
  readonly cycle: number;
  readonly status: string;
  readonly sourceReviewers: readonly string[];
  readonly patchHash: string | undefined;
}

export interface TrackedFinding {
  readonly id: string;
  readonly fingerprint: string;
  readonly location: string;
  readonly transitions: readonly FindingTransition[];
  readonly flipCount: number;
  readonly lastPatchHash: string | undefined;
  readonly deadlocked: boolean;
}

export interface LoopConflict {
  readonly fingerprint: string;
  readonly findingIds: readonly string[];
  readonly reason: string;
  readonly cycle: number;
}

export interface LoopState {
  readonly version: 1;
  readonly cycle: number;
  readonly roster: readonly string[];
  readonly findings: Readonly<Record<string, TrackedFinding>>;
  readonly conflicts: readonly LoopConflict[];
  readonly deadlocks: readonly string[];
}

/**
 * Creates an empty loop-state document.
 * @param {readonly string[]} roster Reviewer ids for this run
 * @returns A fresh loop state
 */
export const emptyLoopState = (roster: readonly string[]): LoopState => ({
  version: 1,
  cycle: 0,
  roster: [...roster],
  findings: {},
  conflicts: [],
  deadlocks: [],
});

/**
 * Derives the state directory for a canonical review file.
 * Flat `001.md` → sibling dir `001/`; `…/REVIEW.md` → its parent directory.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @returns The absolute state directory path
 */
export const stateDirForReviewFile = (reviewFile: string): string => {
  const basename = nodePath.basename(reviewFile);
  if (basename === 'REVIEW.md') return nodePath.dirname(reviewFile);
  if (basename.endsWith('.md')) {
    const code = basename.slice(0, -'.md'.length);
    return nodePath.join(nodePath.dirname(reviewFile), code);
  }
  return `${reviewFile}.state`;
};

/**
 * Absolute path to loop-state.json for a review file.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @returns The loop-state.json path
 */
export const loopStatePath = (reviewFile: string): string =>
  nodePath.join(stateDirForReviewFile(reviewFile), 'loop-state.json');

/**
 * Absolute path to a reviewer's scratch file for this cycle (legacy flat layout).
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {string} reviewerId Reviewer profile id
 * @returns The scratch markdown path
 */
export const scratchPath = (reviewFile: string, reviewerId: string): string =>
  nodePath.join(stateDirForReviewFile(reviewFile), 'scratch', `${reviewerId}.md`);

/**
 * Absolute directory for a pass within a cycle.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} cycle Cycle / pass number (1-based)
 * @returns The pass directory path
 */
export const passDir = (reviewFile: string, cycle: number): string =>
  nodePath.join(stateDirForReviewFile(reviewFile), 'passes', String(cycle));

/**
 * Absolute path to the supervisor brief for a cycle.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} cycle Cycle / pass number
 * @returns The brief.md path
 */
export const briefPath = (reviewFile: string, cycle: number): string =>
  nodePath.join(passDir(reviewFile, cycle), 'brief.md');

/**
 * Absolute path to a specialist scratch file under the pass directory.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} cycle Cycle / pass number
 * @param {string} reviewerId Reviewer profile id
 * @returns The pass-scoped scratch markdown path
 */
export const passScratchPath = (
  reviewFile: string,
  cycle: number,
  reviewerId: string,
): string => nodePath.join(passDir(reviewFile, cycle), 'scratch', `${reviewerId}.md`);

/**
 * Fingerprints a finding for deadlock / dedupe tracking.
 * @param {string} location Finding location
 * @param {string} problem Finding problem text
 * @returns Stable fingerprint string
 */
export const fingerprintFinding = (location: string, problem: string): string => {
  const normalizedLocation = location.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedProblem = problem.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 240);
  const digest = createHash('sha256')
    .update(`${normalizedLocation}\n${normalizedProblem}`)
    .digest('hex')
    .slice(0, 16);
  return `${normalizedLocation}|${digest}`;
};

/**
 * Hashes suggestion/problem text as a coarse "patch direction" marker.
 * @param {string} text Text to hash
 * @returns Short hex digest
 */
export const hashText = (text: string): string =>
  createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 12);

/**
 * Ensures the state + scratch directories exist for a review file.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @returns An effect creating the directories
 */
export const ensureStateDirs = (
  reviewFile: string,
): Effect.Effect<void, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const stateDir = stateDirForReviewFile(reviewFile);
    const scratchDir = path.join(stateDir, 'scratch');
    const passesDir = path.join(stateDir, 'passes');
    yield* fileSystem.makeDirectory(scratchDir, { recursive: true }).pipe(
      Effect.orElseSucceed(() => undefined),
    );
    yield* fileSystem.makeDirectory(passesDir, { recursive: true }).pipe(
      Effect.orElseSucceed(() => undefined),
    );
  });

/**
 * Ensures pass + pass-scratch directories exist for a cycle.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} cycle Cycle / pass number
 * @returns An effect creating the directories
 */
export const ensurePassDirs = (
  reviewFile: string,
  cycle: number,
): Effect.Effect<void, never, FileSystem | Path> =>
  Effect.gen(function* () {
    yield* ensureStateDirs(reviewFile);
    const fileSystem = yield* FileSystem;
    const scratch = nodePath.join(passDir(reviewFile, cycle), 'scratch');
    yield* fileSystem.makeDirectory(scratch, { recursive: true }).pipe(
      Effect.orElseSucceed(() => undefined),
    );
  });

/**
 * Loads loop-state.json, or returns empty state when missing/unreadable.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {readonly string[]} roster Reviewer ids (used when creating empty state)
 * @returns The loaded or empty loop state
 */
export const loadLoopState = (
  reviewFile: string,
  roster: readonly string[],
): Effect.Effect<LoopState, never, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const filePath = loopStatePath(reviewFile);
    const exists = yield* fileSystem.exists(filePath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return emptyLoopState(roster);

    const text = yield* fileSystem
      .readFileString(filePath, 'utf8')
      .pipe(Effect.orElseSucceed(() => null));
    if (text === null) return emptyLoopState(roster);

    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) return emptyLoopState(roster);
      const record = parsed as Partial<LoopState>;
      if (record.version !== 1) return emptyLoopState(roster);
      return {
        version: 1,
        cycle: typeof record.cycle === 'number' ? record.cycle : 0,
        roster: Array.isArray(record.roster) ? record.roster.map(String) : [...roster],
        findings:
          typeof record.findings === 'object' && record.findings !== null
            ? (record.findings as Record<string, TrackedFinding>)
            : {},
        conflicts: Array.isArray(record.conflicts) ? record.conflicts : [],
        deadlocks: Array.isArray(record.deadlocks) ? record.deadlocks.map(String) : [],
      };
    } catch {
      return emptyLoopState(roster);
    }
  });

/**
 * Persists loop-state.json next to the review file.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {LoopState} state State to write
 * @returns An effect writing the file
 */
export const saveLoopState = (
  reviewFile: string,
  state: LoopState,
): Effect.Effect<void, never, FileSystem | Path> =>
  Effect.gen(function* () {
    yield* ensureStateDirs(reviewFile);
    const fileSystem = yield* FileSystem;
    yield* fileSystem
      .writeFileString(loopStatePath(reviewFile), `${JSON.stringify(state, null, 2)}\n`)
      .pipe(Effect.orElseSucceed(() => undefined));
  });
