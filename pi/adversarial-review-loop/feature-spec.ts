import { Console, Data, Effect, Option } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import { runAgent, type AgentRunError } from './runner';
import { FIXER_SYSTEM, TOOLS } from './agents';
import { FIXER_SKILL_PATH } from './skill-paths';
import { splitFindingBlocks } from './findings';
import { getCurrentGitBranch } from './git';

const FIXER_TIMEOUT = 600000;

/** Feature spec loading/parsing failure. */
export class FeatureSpecError extends Data.TaggedError('FeatureSpecError')<{
  readonly message: string;
}> {}

/** Feature-spec branch validation failure (no feat/* branch or missing feature layout). */
export class FeatureSpecValidationError extends Data.TaggedError('FeatureSpecValidationError')<{
  readonly message: string;
}> {}

/**
 * Validates feature-spec mode by detecting the git branch and matching feature
 * directory. Expects branch format: feat/<feature-name>
 * @param {string} cwd Working directory
 * @returns An effect producing the spec name, failing with FeatureSpecValidationError
 */
export const validateFeatureSpecFromBranch = (
  cwd: string,
): Effect.Effect<string, FeatureSpecValidationError, FileSystem | Path> =>
  Effect.gen(function* () {
    const branch = yield* getCurrentGitBranch(cwd);
    if (Option.isNone(branch)) {
      return yield* Effect.fail(
        new FeatureSpecValidationError({
          message: 'Not a git repository or detached HEAD. Use --spec-name explicitly.',
        }),
      );
    }

    const match = branch.value.match(/^feat\/(.+)$/);
    const specName = match?.[1];
    if (specName === undefined) {
      return yield* Effect.fail(
        new FeatureSpecValidationError({
          message:
            `Branch '${branch.value}' does not match expected format 'feat/<feature-name>'. ` +
            'Use --spec-name explicitly or checkout a feature branch.',
        }),
      );
    }

    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    const featureDir = path.join(cwd, '.agents/features', specName);
    const dirExists = yield* fileSystem
      .exists(featureDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!dirExists) {
      return yield* Effect.fail(
        new FeatureSpecValidationError({
          message:
            `Feature directory not found: ${featureDir}. ` +
            'Create the feature spec or use --spec-name explicitly.',
        }),
      );
    }

    const featureMd = path.join(featureDir, 'FEATURE.md');
    const mdExists = yield* fileSystem
      .exists(featureMd)
      .pipe(Effect.orElseSucceed(() => false));
    if (!mdExists) {
      return yield* Effect.fail(
        new FeatureSpecValidationError({
          message: `FEATURE.md not found in ${featureDir}. Initialize the feature spec first.`,
        }),
      );
    }

    return specName;
  });

/**
 * Parses YAML frontmatter (--- delimited) and returns key-value pairs.
 * Does not handle complex YAML — only simple `key: value` lines.
 * @param {string} content The full file contents
 * @returns The parsed frontmatter key-value pairs
 */
const parseFrontmatter = (content: string): Record<string, string> => {
  // Normalize CRLF → LF so files saved on Windows checkouts still parse.
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    const key = kv?.[1];
    const value = kv?.[2];
    if (key !== undefined && value !== undefined) result[key] = value.trim();
  }
  return result;
};

/**
 * Extracts the markdown body that follows the YAML frontmatter.
 * @param {string} content The full file contents
 * @returns The body after the closing `---`, or the full content when there is no frontmatter
 */
const bodyAfterFrontmatter = (content: string): string => {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return normalized;
  return normalized.slice(match[0].length);
};

export interface TaskMeta {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly dirName: string;
}

/**
 * Scans TASK.md files in a directory and returns their parsed frontmatter + metadata.
 * Defensive: a missing or unreadable directory yields no tasks.
 * @param {string} dir Absolute path to the phase directory
 * @returns The parsed task metadata, unreadable entries skipped
 */
const scanTaskFiles = (
  dir: string,
): Effect.Effect<TaskMeta[], never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    const dirExists = yield* fileSystem
      .exists(dir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!dirExists) return [];

    const entries = yield* fileSystem
      .readDirectory(dir)
      .pipe(Effect.orElseSucceed((): readonly string[] => []));

    const tasks: TaskMeta[] = [];
    for (const entry of entries) {
      const taskMd = path.join(dir, entry, 'TASK.md');
      const content = yield* fileSystem.readFileString(taskMd, 'utf8').pipe(
        // Skip directories without a readable TASK.md.
        Effect.orElseSucceed(() => null),
      );
      if (content === null) continue;

      const frontmatter = parseFrontmatter(content);
      tasks.push({
        id: frontmatter['id'] ?? '',
        name: frontmatter['name'] ?? entry,
        type: frontmatter['type'] ?? '',
        status: frontmatter['status'] ?? '',
        dirName: entry,
      });
    }
    return tasks;
  });

/**
 * Extracts the phase letter(s) and numeric portion from a task ID like "A099" or "AA001".
 * @param {string} taskId The task ID to parse
 * @returns The phase letter(s) and numeric portion
 */
const parseTaskId = (taskId: string): { phase: string; num: number } => {
  const match = taskId.match(/^([A-Z]+)(\d+)$/);
  const phase = match?.[1];
  const digits = match?.[2];
  if (phase === undefined || digits === undefined) return { phase: '?', num: 0 };
  return { phase, num: parseInt(digits, 10) };
};

/**
 * Generates the next sequential task ID after the given one.
 * e.g. A099 → A100, B005 → B006
 * @param {string} currentId The current highest task ID
 * @returns The next task ID in sequence
 */
const nextTaskId = (currentId: string): string => {
  const { phase, num } = parseTaskId(currentId);
  return `${phase}${String(num + 1).padStart(3, '0')}`;
};

// ─── Feature Spec Loading ────────────────────────────────────────────

export interface FeatureSpec {
  readonly featureDir: string;
  readonly featureName: string;
  readonly lockedPhases: readonly string[];
  readonly taskTableRows: readonly string[];
}

/**
 * Collects the markdown table rows (header, separator, data rows) of the
 * first table in the FEATURE.md body that has an `ID`/`Type` header.
 * @param {string} body The markdown body (frontmatter already stripped)
 * @returns The raw table lines
 */
const collectTaskTableRows = (body: string): string[] => {
  const lines = body.split('\n');
  const rows: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inTable) {
      if (trimmed.startsWith('|') && trimmed.includes('ID') && trimmed.includes('Type')) {
        inTable = true;
        rows.push(line);
      }
      continue;
    }
    if (!trimmed.startsWith('|')) break;
    rows.push(line);
  }

  return rows;
};

/**
 * Reads and parses a feature spec from `.agents/features/<specName>/`.
 * @param {string} cwd Working directory containing `.agents/features/`
 * @param {string} specName Feature directory name
 * @returns An effect failing with FeatureSpecError when the spec is missing/unparseable
 */
export const loadFeatureSpec = (
  cwd: string,
  specName: string,
): Effect.Effect<FeatureSpec, FeatureSpecError, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    // specName must be a single path segment — it is joined directly under
    // .agents/features/, so separators or '..' would escape the features tree.
    if (specName.includes('/') || specName.includes('\\') || specName.includes('..')) {
      return yield* Effect.fail(
        new FeatureSpecError({
          message: `Invalid spec name '${specName}': must be a single path segment (no '/', '\\\\', or '..').`,
        }),
      );
    }

    const featureDir = path.join(cwd, '.agents/features', specName);
    const dirExists = yield* fileSystem
      .exists(featureDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!dirExists) {
      return yield* Effect.fail(
        new FeatureSpecError({ message: `Feature spec directory not found: ${featureDir}` }),
      );
    }

    const featureMd = path.join(featureDir, 'FEATURE.md');
    const mdExists = yield* fileSystem
      .exists(featureMd)
      .pipe(Effect.orElseSucceed(() => false));
    if (!mdExists) {
      return yield* Effect.fail(
        new FeatureSpecError({ message: `FEATURE.md not found in ${featureDir}` }),
      );
    }

    const content = yield* fileSystem.readFileString(featureMd, 'utf8').pipe(
      Effect.mapError(
        (cause) =>
          new FeatureSpecError({ message: `Failed to parse FEATURE.md: ${cause.message}` }),
      ),
    );

    const frontmatter = parseFrontmatter(content);
    const lockedPhases = (frontmatter['locked-phases'] ?? '')
      .split(',')
      .map((phase) => phase.trim())
      .filter((phase) => phase.length > 0);

    const taskTableRows = collectTaskTableRows(bodyAfterFrontmatter(content));

    return { featureDir, featureName: specName, lockedPhases, taskTableRows };
  });

// ─── Active Phase Detection ──────────────────────────────────────────

export interface ReviewTaskRef {
  readonly id: string;
  readonly memoryPath: string;
  readonly reviewFile: string;
}

export interface ActivePhase {
  readonly phase: string;
  readonly phaseDir: string;
  readonly reviewTask: ReviewTaskRef | null;
  readonly highestTaskId: string;
}

/**
 * Determines the active phase by scanning all TASK.md files in the feature
 * directory. Returns the first phase (by order A→Z) that has non-complete
 * tasks and is not locked. Also returns the review task within that phase
 * (highest-numbered task with type=review).
 *
 * @param {FeatureSpec} spec The loaded feature spec
 * @param {readonly string[]} [lockedPhases] Phase letters to skip
 * @returns The active phase, or null when all phases are complete/locked
 */
export const findActivePhase = (
  spec: FeatureSpec,
  lockedPhases?: readonly string[],
): Effect.Effect<ActivePhase | null, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    const entries = yield* fileSystem
      .readDirectory(spec.featureDir)
      .pipe(Effect.orElseSucceed((): readonly string[] => []));

    // Collect phase directories (one or more uppercase letters: A…Z, AA, AB…),
    // sorted by (length, then lexicographic): single letters A–Z run before
    // double letters AA, AB… — localeCompare would put AA before B.
    const phases = entries
      .filter((entry) => /^[A-Z]+$/.test(entry) && !lockedPhases?.includes(entry))
      .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));

    for (const phase of phases) {
      const phaseDir = path.join(spec.featureDir, phase);
      const tasks = yield* scanTaskFiles(phaseDir);
      if (tasks.length === 0) continue;

      const hasNonComplete = tasks.some((task) => task.status !== 'complete');
      if (!hasNonComplete) continue;

      // Find the review task (highest-numbered task with type=review).
      const reviewTasks = tasks
        .filter((task) => task.type === 'review')
        .sort((a, b) => parseTaskId(b.id).num - parseTaskId(a.id).num);
      const reviewTask = reviewTasks[0];

      // Numeric max — lexicographic sort fails once IDs exceed 3 digits (A1000 < A999).
      let highestTaskId = '';
      let highestNum = -1;
      for (const task of tasks) {
        const num = parseTaskId(task.id).num;
        if (num > highestNum) {
          highestNum = num;
          highestTaskId = task.id;
        }
      }

      return {
        phase,
        phaseDir,
        reviewTask:
          reviewTask === undefined
            ? null
            : {
                id: reviewTask.id,
                memoryPath: path.join(phaseDir, reviewTask.dirName, 'MEMORY.md'),
                reviewFile: path.join(phaseDir, reviewTask.dirName, 'REVIEW.md'),
              },
        highestTaskId,
      };
    }

    return null;
  });

// ─── Review Loop Counter ─────────────────────────────────────────────

/**
 * `(?=^##\s|$(?![\s\S]))` is the JS-correct end-of-section terminator (see
 * parse-summary.ts — a `\Z` anchor is a literal `Z` in ECMAScript regex).
 */
const REVIEW_LOOP_SECTION_RE = /^## Review Loop Counter\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m;

/**
 * Reads the existing review loop counter from a MEMORY.md file.
 * Defensive: missing/unparseable files count as zero iterations.
 * @param {string} memoryPath Absolute path to the review task's MEMORY.md
 * @returns The current iteration count (0 if absent)
 */
export const getReviewLoopCounter = (
  memoryPath: string,
): Effect.Effect<number, never, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;

    const exists = yield* fileSystem
      .exists(memoryPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return 0;

    const content = yield* fileSystem
      .readFileString(memoryPath, 'utf8')
      .pipe(Effect.orElseSucceed(() => null));
    if (content === null) return 0;

    const section = content.match(REVIEW_LOOP_SECTION_RE);
    if (!section) return 0;

    let maxIteration = 0;
    for (const line of (section[1] ?? '').trim().split('\n')) {
      const match = line.match(/Iteration\s+(\d+)/);
      const digits = match?.[1];
      if (digits === undefined) continue;
      const iteration = parseInt(digits, 10);
      if (iteration > maxIteration) maxIteration = iteration;
    }
    return maxIteration;
  });

/**
 * Appends an iteration log line to the review task's MEMORY.md, at the end of
 * the `## Review Loop Counter` section (chronological order). Creates the
 * section if missing. Defensive: write failures are swallowed — the loop
 * still works without the counter log.
 * @param {string} memoryPath Absolute path to the review task's MEMORY.md
 * @param {number} iteration The iteration number being logged
 * @param {number} findingCount Findings discovered this iteration
 * @param {number} taskCount Remediation tasks created this iteration
 * @returns An effect performing the append
 */
export const updateReviewLoopCounter = (
  memoryPath: string,
  iteration: number,
  findingCount: number,
  taskCount: number,
): Effect.Effect<void, never, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const line = `- Iteration ${iteration}: ${findingCount} finding(s) found, ${taskCount} remediation task(s) created`;

    const exists = yield* fileSystem
      .exists(memoryPath)
      .pipe(Effect.orElseSucceed(() => false));

    if (!exists) {
      yield* fileSystem
        .writeFileString(memoryPath, `# MEMORY\n\n## Review Loop Counter\n${line}\n`)
        .pipe(Effect.orElseSucceed(() => undefined));
      return;
    }

    const content = yield* fileSystem
      .readFileString(memoryPath, 'utf8')
      .pipe(Effect.orElseSucceed(() => null));
    if (content === null) return;

    const section = content.match(REVIEW_LOOP_SECTION_RE);
    const updated =
      section === null
        ? `${content.trimEnd()}\n\n## Review Loop Counter\n${line}\n`
        : // Insert after the last non-empty line of the section so iterations
          // stay in chronological order.
          content.replace(REVIEW_LOOP_SECTION_RE, (wholeMatch, sectionBody: string) => {
            const trimmedBody = sectionBody.trimEnd();
            return trimmedBody.length === 0
              ? wholeMatch.replace(sectionBody, `\n${line}\n`)
              : wholeMatch.replace(trimmedBody, `${trimmedBody}\n${line}`);
          });

    yield* fileSystem
      .writeFileString(memoryPath, updated)
      .pipe(Effect.orElseSucceed(() => undefined));
  });

// ─── Finding Extraction ──────────────────────────────────────────────

export interface Finding {
  readonly id: string;
  readonly severity: string;
  readonly problem: string;
  readonly status: string;
  readonly location: string;
}

/**
 * Parses individual findings from a review file.
 * Extracts F<n> blocks under each severity heading.
 * Defensive: missing/unreadable files yield no findings.
 * @param {string} reviewFilePath Absolute path to the review file
 * @returns The parsed findings in file order
 */
export const extractFindings = (
  reviewFilePath: string,
): Effect.Effect<Finding[], never, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;

    const exists = yield* fileSystem
      .exists(reviewFilePath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return [];

    const content = yield* fileSystem
      .readFileString(reviewFilePath, 'utf8')
      .pipe(Effect.orElseSucceed(() => null));
    if (content === null) return [];

    const findings: Finding[] = [];

    // Split by finding headers: #### F<N> — <title> (also accept -- or -).
    // Fence-aware so quoted headers inside Discussion turns don't reify.
    const findingBlocks = splitFindingBlocks(content);

    for (const block of findingBlocks) {
      const idMatch = block.match(/^#### (F\d+)\s+(?:—|--|-)\s+(.+)$/m);
      const id = idMatch?.[1];
      const title = idMatch?.[2];
      if (id === undefined || title === undefined) continue;

      const severityMatch = block.match(/- \*\*Severity\*\*: (.+)$/m);
      const locationMatch = block.match(/- \*\*Location\*\*: `(.+?)`/m);
      // Problem may span multiple lines; stop at the next `- **Impact**` bullet.
      const problemMatch = block.match(/- \*\*Problem\*\*: ([\s\S]+?)(?:\n- \*\*Impact\*\*)/m);
      const statusMatch = block.match(/- \*\*Status\*\*: (.+)$/m);

      findings.push({
        id,
        severity: severityMatch?.[1]?.trim() ?? 'Unknown',
        location: locationMatch?.[1] ?? 'unknown',
        problem: problemMatch?.[1]?.trim() ?? title.trim(),
        status: statusMatch?.[1]?.trim() ?? 'Open',
      });
    }

    return findings;
  });

// ─── Remediation Task Creation ───────────────────────────────────────

export interface RemediationTasks {
  readonly taskDirs: string[];
  readonly taskIds: string[];
}

/**
 * Creates remediation tasks for accepted findings.
 * Each task goes in its own directory: `<PHASE><NNN>-remediate-f<n>/`
 * (matches the feature-spec skill's `<PHASE_LETTERS><NNN>-<kebab-name>/` layout).
 *
 * @param {readonly Finding[]} findings Open findings to create tasks for
 * @param {string} phaseLetter The active phase letter (e.g., 'A')
 * @param {string} highestTaskId Highest existing task ID in phase (e.g., 'A099')
 * @param {string} reviewTaskId The review task ID (used for depends-on)
 * @param {string} featureDir Path to the feature directory
 * @param {string} reviewFile Path to the review file
 * @returns An effect producing the created task directories and IDs
 */
export const createRemediationTasks = (
  findings: readonly Finding[],
  phaseLetter: string,
  highestTaskId: string,
  reviewTaskId: string,
  featureDir: string,
  reviewFile: string,
): Effect.Effect<RemediationTasks, PlatformError, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    let nextNumber = parseTaskId(highestTaskId).num;
    const taskDirs: string[] = [];
    const taskIds: string[] = [];

    for (const finding of findings) {
      nextNumber++;
      const taskId = `${phaseLetter}${String(nextNumber).padStart(3, '0')}`;
      const taskDirName = `${taskId}-remediate-${finding.id.toLowerCase()}`;
      const taskDir = path.join(featureDir, phaseLetter, taskDirName);

      yield* fileSystem.makeDirectory(taskDir, { recursive: true });

      const taskMd = `---
id: ${taskId}
name: remediate-${finding.id.toLowerCase()}
type: defect
originator: defect:${reviewTaskId}
depends-on: ${reviewTaskId}
finding-ref: ${finding.id}
status: pending
---

# Task ${taskId}: Remediate Finding ${finding.id}

## Type: defect

## Description
Fix ${finding.id} from the adversarial review.

## Requirements
- Address the problem described in the review: ${finding.problem}
- Pass all verification gates (lint, test, typecheck)

## Completion
- [ ] Code compiles / Tests pass
- [ ] Output summarized in MEMORY.md
`;
      yield* fileSystem.writeFileString(path.join(taskDir, 'TASK.md'), taskMd);

      const memoryMd = `# MEMORY

## Finding Context
- **Finding**: ${finding.id}
- **Severity**: ${finding.severity}
- **Location**: ${finding.location}
- **Problem**: ${finding.problem}
- **Review File**: ${reviewFile}
`;
      yield* fileSystem.writeFileString(path.join(taskDir, 'MEMORY.md'), memoryMd);

      taskDirs.push(taskDir);
      taskIds.push(taskId);
    }

    return { taskDirs, taskIds };
  });

// ─── FEATURE.md Task Table Update ────────────────────────────────────

/**
 * Appends rows for new remediation tasks to the FEATURE.md task table.
 * Defensive: missing/unwritable files yield false.
 * @param {string} featureMdPath Absolute path to FEATURE.md
 * @param {readonly { id: string, name: string }[]} newTasks Tasks to append
 * @returns True if the file was updated
 */
export const updateFeatureTaskTable = (
  featureMdPath: string,
  newTasks: readonly { id: string; name: string }[],
): Effect.Effect<boolean, never, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;

    const exists = yield* fileSystem
      .exists(featureMdPath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return false;

    const content = yield* fileSystem
      .readFileString(featureMdPath, 'utf8')
      .pipe(Effect.orElseSucceed(() => null));
    if (content === null) return false;

    const lines = content.split('\n');
    const newRows = newTasks.map((task) => `| ${task.id} | ${task.name} | defect | pending |`);

    // Find the last row that starts with `| ` and contains a task ID pattern.
    let insertIndex = -1;
    for (let index = lines.length - 1; index >= 0; index--) {
      if (/^\| [A-Z]+\d+/.test(lines[index] ?? '')) {
        insertIndex = index + 1;
        break;
      }
    }

    if (insertIndex === -1) {
      // Fallback: append before the last non-empty line.
      for (let index = lines.length - 1; index >= 0; index--) {
        if ((lines[index] ?? '').trim()) {
          insertIndex = index + 1;
          break;
        }
      }
    }

    if (insertIndex === -1) return false;

    // Insert before the anchor line (or append when insertIndex === lines.length).
    // The previous splice(insertIndex, 1, ...newRows, anchorLine) form failed
    // silently when the last task row was the last line of the file
    // (anchorLine === undefined → early return false).
    lines.splice(insertIndex, 0, ...newRows);

    yield* fileSystem
      .writeFileString(featureMdPath, lines.join('\n'))
      .pipe(Effect.orElseSucceed(() => undefined));
    return true;
  });

// ─── Fixer Execution for Remediation ─────────────────────────────────

export interface RemediationResult {
  readonly success: number;
  readonly failed: number;
}

/**
 * Spawns a fixer agent to resolve the review findings in feature-spec mode.
 *
 * @param {string} targetDir Directory the fixer may modify
 * @param {string} reviewFile Absolute path to the review file
 * @param {string} cwd Working directory for the agent session
 * @param {string} model Fixer model name
 * @returns An effect producing success/failure counts
 */
export const executeRemediations = (
  targetDir: string,
  reviewFile: string,
  cwd: string,
  model: string,
): Effect.Effect<RemediationResult, AgentRunError> =>
  Effect.gen(function* () {
    const fixerTask =
      `Resolve the findings in the review file at ${reviewFile}. ` +
      `Load and follow the addressing-adversarial-review skill at ${FIXER_SKILL_PATH} ` +
      'as your governing pipeline: triage findings by Status, enforce the per-finding ' +
      'Attempts ceiling (Max Attempts from Review Metadata, default 3), apply minimal ' +
      'fixes in severity order to the code under ' +
      `${targetDir}, verify with the repo real checks (typecheck/lint/tests), ` +
      'increment Attempts per attempt, set Status to In Review after local verification ' +
      'passes (or leave Open on failure), append [Fixer] turns to each finding\'s ' +
      '### Discussion thread, and overwrite the review file in place. ' +
      'Do NOT touch Iteration or any reviewer-authored field. Escalate findings at the ceiling.';

    const result = yield* runAgent(
      {
        model,
        systemPrompt: FIXER_SYSTEM,
        task: fixerTask,
        tools: TOOLS.fixer,
        cwd,
      },
      FIXER_TIMEOUT,
    );

    if (result.error !== undefined) {
      yield* Console.log(
        `[adversarial-review-loop] Fixer error during remediation: ${result.error}`,
      );
      return { success: 0, failed: 1 };
    }

    return { success: 1, failed: 0 };
  });
