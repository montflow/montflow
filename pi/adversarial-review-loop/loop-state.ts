import { createHash } from 'node:crypto';
import nodePath from 'node:path';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import {
  DEFAULT_MAX_CYCLES,
  DEFAULT_MAX_LOOPS,
  type LoopConfig,
} from './config';

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
  readonly version: 2;
  /** 0-based index of the current loop (independent reviewer set). */
  readonly loop: number;
  /**
   * Last completed cycle within the current loop (1-based; 0 = none yet). The
   * next cycle to run is `cycle + 1`.
   */
  readonly cycle: number;
  readonly roster: readonly string[];
  readonly findings: Readonly<Record<string, TrackedFinding>>;
  readonly conflicts: readonly LoopConflict[];
  readonly deadlocks: readonly string[];
  /**
   * The resolved loop config the review started with ("locked in" snapshot).
   * Present for reviews started after this feature; absent for legacy states,
   * which fall back to a preset pick on resume.
   */
  readonly config?: LoopConfig;
  /**
   * Last completed orchestrator phase within the current loop+cycle. Saved by
   * the review node ('reviewed') and the fixer node ('fixed'). A resume with
   * phase 'reviewed' jumps straight into the fixer phase instead of re-running
   * the reviewers (which would re-review already-fixed findings).
   */
  readonly phase?: 'reviewed' | 'fixed';
}

/**
 * Light structural check that a parsed value looks like a stored loop config
 * (written by us — no deep schema validation needed).
 * @param {unknown} value The parsed value
 * @returns True when it plausibly is a loop config
 */
export const isStoredConfig = (value: unknown): value is LoopConfig => {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Partial<LoopConfig>;
  return (
    Array.isArray(config.reviewers) &&
    typeof config.supervisor?.model === 'string' &&
    typeof config.supervisor?.skillPath === 'string' &&
    typeof config.fixerModel === 'string' &&
    typeof config.maxLoops === 'number' &&
    typeof config.deadlock?.flipThreshold === 'number'
  );
};

/**
 * Normalizes a stored loop config into the current runtime shape. Legacy
 * configs predating the loop/cycle split stored `maxLoops` meaning review
 * **cycles**; they are migrated to `maxLoops` = default loop count with their
 * old value as the per-loop cycle cap.
 * @param {LoopConfig} config The stored config
 * @returns The normalized config
 */
export const normalizeStoredConfig = (config: LoopConfig): LoopConfig =>
  config.maxCycles !== undefined && config.maxCycles > 0
    ? config
    : {
        ...config,
        maxLoops: DEFAULT_MAX_LOOPS,
        maxCycles: config.maxLoops > 0 ? config.maxLoops : DEFAULT_MAX_CYCLES,
      };

/**
 * Creates an empty loop-state document.
 * @param {readonly string[]} roster Reviewer ids for this run
 * @returns A fresh loop state
 */
export const emptyLoopState = (roster: readonly string[]): LoopState => ({
  version: 2,
  loop: 0,
  cycle: 0,
  roster: [...roster],
  findings: {},
  conflicts: [],
  deadlocks: [],
});

/**
 * Derives the state directory for a canonical review file.
 * Flat `001.md` → sibling dir `001/`.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @returns The absolute state directory path
 */
export const stateDirForReviewFile = (reviewFile: string): string => {
  const basename = nodePath.basename(reviewFile);
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
 * Absolute directory for a pass within a loop+cycle: `passes/<loop>/<cycle>/`.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number (1-based)
 * @param {number} cycle Cycle number within the loop (1-based)
 * @returns The pass directory path
 */
export const passDir = (reviewFile: string, loop: number, cycle: number): string =>
  nodePath.join(stateDirForReviewFile(reviewFile), 'passes', String(loop), String(cycle));

/**
 * Absolute path to the supervisor brief for a loop+cycle.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @returns The brief.md path
 */
export const briefPath = (reviewFile: string, loop: number, cycle: number): string =>
  nodePath.join(passDir(reviewFile, loop, cycle), 'brief.md');

/**
 * Absolute path to a specialist scratch file under the pass directory.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @param {string} reviewerId Reviewer profile id
 * @returns The pass-scoped scratch markdown path
 */
export const passScratchPath = (
  reviewFile: string,
  loop: number,
  cycle: number,
  reviewerId: string,
): string =>
  nodePath.join(passDir(reviewFile, loop, cycle), 'scratch', `${reviewerId}.md`);

/**
 * Absolute path to a fixer's per-finding scratch file (the fixer writes its
 * updated finding block here instead of the shared review file, so parallel
 * fixers never race; the orchestrator merges these after each wave).
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @param {string} findingId Finding id (F1, F2, …)
 * @returns The fixer scratch path
 */
export const fixerScratchPath = (
  reviewFile: string,
  loop: number,
  cycle: number,
  findingId: string,
): string => nodePath.join(passDir(reviewFile, loop, cycle), 'fixes', `${findingId}.md`);

/**
 * Absolute path to a fixer's per-finding failure record (JSON), written next
 * to the scratch file when a fixer attempt fails. Preserved across crashes /
 * resumes so the next fixer attempt can pick up partial work with full
 * context, and so a human can see why a fixer produced no scratch block.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @param {string} findingId Finding id (F1, F2, …)
 * @returns The fixer failure record path
 */
export const fixerErrorPath = (
  reviewFile: string,
  loop: number,
  cycle: number,
  findingId: string,
): string => nodePath.join(passDir(reviewFile, loop, cycle), 'fixes', `${findingId}.error.json`);

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
 * Ensures pass + pass-scratch directories exist for a loop+cycle.
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @returns An effect creating the directories
 */
export const ensurePassDirs = (
  reviewFile: string,
  loop: number,
  cycle: number,
): Effect.Effect<void, never, FileSystem | Path> =>
  Effect.gen(function* () {
    yield* ensureStateDirs(reviewFile);
    const fileSystem = yield* FileSystem;
    const scratch = nodePath.join(passDir(reviewFile, loop, cycle), 'scratch');
    yield* fileSystem.makeDirectory(scratch, { recursive: true }).pipe(
      Effect.orElseSucceed(() => undefined),
    );
  });

/**
 * Loads loop-state.json, or returns empty state when missing/unreadable.
 * Version 1 states (pre loop/cycle split) are migrated: `loop` defaults to 0.
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
      const version = (parsed as { version?: unknown }).version;
      if (version !== 1 && version !== 2) return emptyLoopState(roster);
      const record = parsed as Partial<LoopState> & { version?: unknown };
      return {
        version: 2,
        loop: typeof record.loop === 'number' ? record.loop : 0,
        cycle: typeof record.cycle === 'number' ? record.cycle : 0,
        roster: Array.isArray(record.roster) ? record.roster.map(String) : [...roster],
        findings:
          typeof record.findings === 'object' && record.findings !== null
            ? (record.findings as Record<string, TrackedFinding>)
            : {},
        conflicts: Array.isArray(record.conflicts) ? record.conflicts : [],
        deadlocks: Array.isArray(record.deadlocks) ? record.deadlocks.map(String) : [],
        config: isStoredConfig(record.config)
          ? normalizeStoredConfig(record.config)
          : undefined,
        phase:
          record.phase === 'reviewed' || record.phase === 'fixed'
            ? record.phase
            : undefined,
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
): Effect.Effect<void, PlatformError, FileSystem | Path> =>
  Effect.gen(function* () {
    yield* ensureStateDirs(reviewFile);
    const fileSystem = yield* FileSystem;
    yield* fileSystem.writeFileString(
      loopStatePath(reviewFile),
      `${JSON.stringify(state, null, 2)}\n`,
    );
  });
