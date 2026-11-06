import { Option, Schema } from 'effect';
import {
  type GateLane,
  isGateLane,
  isScopeList,
  normalizeScopeList,
  normalizeScopes,
  scopeContains,
} from '../scheduler/scope.module.js';
import { ISO_INSTANT_PATTERN } from '../stamp/index.js';
import { SLUG_PATTERN } from '../task/index.js';
import { type Issue, type Result, finding, issue, noErrors } from '../verify/index.js';

/** Stable code for a complete task whose gate holds no checked item. */
export const GATE_UNCHECKED_CODE = 'gate.unchecked';

/** Generated gate-result ledger: one JSON record per line, append-only. */
export const GATE_RESULTS_FILE = 'GATE-RESULTS.jsonl';

/** A gate stage kind: a command proves it, or a reviewer judges it. */
export const GATE_KINDS = ['mechanical', 'subjective'] as const;

/** A gate stage kind. */
export type GateKind = (typeof GATE_KINDS)[number];

/** A recorded gate verdict. */
export const GATE_VERDICTS = ['pass', 'fail'] as const;

/** A recorded gate verdict. */
export type GateVerdict = (typeof GATE_VERDICTS)[number];

/** Stable codes for the gate rules. */
export const GATE_CODES = {
  unchecked: GATE_UNCHECKED_CODE,
  kindMissing: 'gate.kind-missing',
  malformedMetadata: 'gate.malformed-metadata',
  duplicateStage: 'gate.duplicate-stage',
  placeholderCommand: 'gate.placeholder-command',
  unproven: 'gate.unproven',
  unjudged: 'gate.unjudged',
  resultInconsistent: 'gate.result-inconsistent',
  resultsMalformed: 'gate.results-malformed',
  resultOwnerMismatch: 'gate.result-owner-mismatch',
  fileMissing: 'gate.file-missing',
  stageUnknown: 'gate.stage-unknown',
  notMechanical: 'gate.not-mechanical',
  notSubjective: 'gate.not-subjective',
  judgeMismatch: 'gate.judge-mismatch',
  argumentConflict: 'gate.argument-conflict',
  notOrchestrator: 'gate.not-orchestrator',
  noMechanicalStages: 'gate.no-mechanical-stages',
  ownerMissing: 'gate.owner-missing',
  writeFailed: 'gate.write-failed',
  /** A recorded pass whose recomputed run key differs from the stored one. */
  staleResult: 'gate.stale-result',
  /** A pass on an unfinished owner carrying no run key. */
  resultUnkeyed: 'gate.result-unkeyed',
  /** A requester waited past its wait cap without running. */
  waitTimeout: 'gate.wait-timeout',
  /** `gate.json` or a lane/in-flight override is malformed or below 1. */
  invalidConfig: 'gate.invalid-config',
  /** A `--scope` or stage `scope:` token outside the C2 grammar. */
  invalidScope: 'gate.invalid-scope',
  /** A mechanical stage with no resolvable scope. */
  scopeMissing: 'gate.scope-missing',
  /** A check that belongs in the phase gate copied into a task gate. */
  sharedCheckInTask: 'gate.shared-check-in-task',
  /** The same command with overlapping scope in two gates of one spec. */
  duplicateCommand: 'gate.duplicate-command',
  /** A `--lane` or stage `lane:` value that is not heavy or light. */
  invalidLane: 'gate.invalid-lane',
  /** The run-state lock could not be acquired. */
  schedulerLock: 'gate.scheduler-lock',
} as const;

/** One metadata line between a stage heading and its first checkbox. */
export interface GateMetadata {
  /** Lowercased key, e.g. `command` or `judge`. */
  readonly key: string;
  /** Trimmed value, with one surrounding backtick pair stripped. */
  readonly value: string;
  /** 1-based line in `GATES.md`. */
  readonly line: number;
}

/** One parsed GATES.md checklist item. */
export interface GateItem {
  /** Item label after `- [ ]` / `- [x]`. */
  readonly text: string;
  /** True when the box is checked (`- [x]`). */
  readonly checked: boolean;
  /** 1-based line in `GATES.md`. */
  readonly line: number;
}

/** One parsed GATES.md stage: its heading, kind, metadata, and items. */
export interface GateStage {
  /** Heading text after `## `, e.g. `Stage 0: Core Validation (mechanical)`. */
  readonly heading: string;
  /** Stage title without the kind suffix, or the whole heading when unnumbered. */
  readonly title: string;
  /** Stage number when the heading reads `Stage <n>: …`. */
  readonly stage: number | undefined;
  /** Declared kind, absent on a legacy unclassified stage. */
  readonly kind: GateKind | undefined;
  /** Parsed command when exactly one `command:` line exists. */
  readonly command: string | undefined;
  /** Parsed judge when exactly one `judge:` line exists. */
  readonly judge: string | undefined;
  /** Every `key: value` line before the first checkbox, in file order. */
  readonly metadata: ReadonlyArray<GateMetadata>;
  /** Checklist items, in order. */
  readonly items: ReadonlyArray<GateItem>;
  /** 1-based line of the stage heading. */
  readonly line: number;
}

/** One recorded gate result, exactly as `GATE-RESULTS.jsonl` carries it. */
export interface GateResult {
  readonly stage: number;
  readonly title: string;
  readonly kind: GateKind;
  readonly command?: string | undefined;
  readonly judge?: string | undefined;
  readonly exit?: number | undefined;
  readonly verdict: GateVerdict;
  readonly at: string;
  readonly output?: string | undefined;
  readonly note?: string | undefined;
  /** Workspace-relative scopes the run covered; absent on a legacy record. */
  readonly scope?: ReadonlyArray<string> | undefined;
  /** Run key: `gate-v1:` plus the fingerprint-backed digest. */
  readonly key?: string | undefined;
  /** Fingerprint the key was computed from. */
  readonly fingerprint?: string | undefined;
  /** Session that requested the run. */
  readonly owner?: string | undefined;
  /** Command duration in milliseconds. */
  readonly durationMs?: number | undefined;
  /** Lane the requester used. */
  readonly lane?: 'heavy' | 'light' | undefined;
  /** How long the requester waited before it ran or consumed. */
  readonly waitedMs?: number | undefined;
  /** True when this record consumed an earlier run instead of executing. */
  readonly reused?: boolean | undefined;
  /** Instant of the original run a reused record points at. */
  readonly source?: string | undefined;
}

/** A parsed results file: valid records plus any malformed-line findings. */
export interface GateResultsParse {
  readonly records: ReadonlyArray<GateResult>;
  readonly issues: ReadonlyArray<Issue>;
}

const CLASSIFIED_STAGE = /^##\s+Stage\s+(\d+):\s+(.+?)\s*\((mechanical|subjective)\)\s*$/;
const ANY_STAGE = /^##\s+Stage\s+(\d+):\s*(.*)$/;
const ANY_HEADING = /^##\s+(.+)$/;
const CHECKBOX_ITEM = /^-\s+\[([ xX])\]\s*(.*)$/;
const METADATA = /^([A-Za-z][\w-]*):\s*(.*)$/;
const COMMAND_PLACEHOLDER = /<[^>]*>/;
const TODO_COMMAND = /^TODO\b/i;
/** The old `init` template: an `echo` that only restates the placeholder. */
const TEMPLATE_COMMAND = /^echo\s+['"]?replace with\b/i;
const INSTANT = ISO_INSTANT_PATTERN;

/**
 * True when a mechanical `command:` is still a template or placeholder, so no
 * surface may execute or accept it as proof. The check is shared by the
 * verifier and by `gate run`, so a fresh tree cannot be "proven" by its
 * generated command before the author replaces it.
 * @param command - raw `command:` value
 * @returns true when the command is not a real proof
 */
export const isPlaceholderCommand = (command: string): boolean =>
  COMMAND_PLACEHOLDER.test(command) || TODO_COMMAND.test(command) || TEMPLATE_COMMAND.test(command);

/** Placeholder markers left in unfilled templates. */
const PLACEHOLDER = /[<>]/;

/** Metadata keys a stage may carry. */
const METADATA_KEYS = new Set(['command', 'judge', 'scope', 'lane']);

/** Strip one surrounding backtick pair from a metadata value. */
const unquote = (value: string): string =>
  value.length >= 2 && value.startsWith('`') && value.endsWith('`') ? value.slice(1, -1) : value;

/** One mutable stage during parsing. */
interface MutableStage {
  heading: string;
  title: string;
  stage: number | undefined;
  kind: GateKind | undefined;
  metadata: Array<GateMetadata>;
  items: Array<GateItem>;
  line: number;
}

/**
 * Parse a GATES.md body into stages, metadata, and their checkbox items. Items
 * that appear before any `##` heading are ignored. A stage heading may carry a
 * `(mechanical)` / `(subjective)` suffix and `command:` / `judge:` lines before
 * its first item; an unclassified heading parses exactly as it always has, so a
 * legacy gate file keeps its shape.
 * @param markdown - raw GATES.md contents
 * @returns one entry per `##` heading, in file order
 */
export const parseGates = (markdown: string): ReadonlyArray<GateStage> => {
  const stages: Array<MutableStage> = [];
  let current: MutableStage | undefined;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    const number = index + 1;
    if (trimmed.startsWith('## ')) {
      const classified = CLASSIFIED_STAGE.exec(trimmed);
      const numbered = ANY_STAGE.exec(trimmed);
      const heading = ANY_HEADING.exec(trimmed);
      const kind = classified?.[3];
      current = {
        heading: (heading?.[1] ?? '').trim(),
        title: (classified?.[2] ?? numbered?.[2] ?? heading?.[1] ?? '').trim(),
        stage:
          classified !== null
            ? Number(classified[1])
            : numbered === null
              ? undefined
              : Number(numbered[1]),
        kind: kind === 'mechanical' || kind === 'subjective' ? kind : undefined,
        metadata: [],
        items: [],
        line: number,
      };
      stages.push(current);
      continue;
    }
    if (current === undefined) continue;
    const item = CHECKBOX_ITEM.exec(trimmed);
    if (item !== null) {
      current.items.push({
        text: (item[2] ?? '').trim(),
        checked: (item[1] ?? ' ') !== ' ',
        line: number,
      });
      continue;
    }
    // Metadata is only meaningful between the heading and the first item.
    if (current.items.length > 0 || trimmed === '') continue;
    const metadata = METADATA.exec(trimmed);
    if (metadata === null) continue;
    current.metadata.push({
      key: (metadata[1] ?? '').toLowerCase(),
      value: unquote((metadata[2] ?? '').trim()),
      line: number,
    });
  }
  return stages.map((stage) => {
    const commands = stage.metadata.filter((entry) => entry.key === 'command');
    const judges = stage.metadata.filter((entry) => entry.key === 'judge');
    return {
      heading: stage.heading,
      title: stage.title,
      stage: stage.stage,
      kind: stage.kind,
      command: commands.length === 1 ? commands[0]?.value : undefined,
      judge: judges.length === 1 ? judges[0]?.value : undefined,
      metadata: stage.metadata,
      items: stage.items,
      line: stage.line,
    };
  });
};

/** Metadata entries of one key on a stage. */
const metadataOf = (stage: GateStage, key: string): ReadonlyArray<GateMetadata> =>
  stage.metadata.filter((entry) => entry.key === key);

/**
 * The resolved scope of one stage: its `scope:` metadata, normalized. Absent or
 * malformed leaves the owner's fallback scope to the caller.
 * @param stage - parsed stage
 * @returns the scope tokens, or undefined when the stage declares none
 */
export const stageScope = (stage: GateStage): ReadonlyArray<string> | undefined => {
  const entries = metadataOf(stage, 'scope');
  if (entries.length !== 1) return undefined;
  const value = entries[0]?.value ?? '';
  return value.trim() === '' ? undefined : normalizeScopes(value);
};

/**
 * The lane one stage declares, when it names a valid one.
 * @param stage - parsed stage
 * @returns the lane, or undefined when the stage declares none
 */
export const stageLane = (stage: GateStage): GateLane | undefined => {
  const entries = metadataOf(stage, 'lane');
  if (entries.length !== 1) return undefined;
  const value = entries[0]?.value ?? '';
  return isGateLane(value) ? value : undefined;
};

/** Options for {@link verifyGatesFile}. */
export interface VerifyGatesOptions {
  /**
   * Require at least one classified stage. A v2 unfinished task's gate must be
   * runnable or judgeable, so a prose-only file is `gate.no-mechanical-stages`;
   * a complete or legacy record keeps its shape.
   */
  readonly requireClassified?: boolean | undefined;
}

/**
 * Mechanically verify a GATES.md file: non-empty, at least one `## Stage`
 * heading, at least one checkbox item, no empty stage, and no unfilled
 * `<placeholder>` items. A classified stage must declare exactly the metadata
 * its kind needs (`command:` for mechanical, `judge:` for subjective); an
 * unclassified stage stays valid and is never runnable, and
 * `options.requireClassified` additionally requires at least one classified
 * stage so an unfinished v2 task has something `gate run` can execute. Pure —
 * no IO.
 * @param markdown - raw GATES.md contents
 * @param options - whether an unclassified stage is an error
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyGatesFile = (markdown: string, options: VerifyGatesOptions = {}): Result => {
  if (markdown.trim() === '') {
    return { valid: false, issues: [issue('body', 'GATES.md is empty.')] };
  }
  const issues: Array<Issue> = [];
  const stages = parseGates(markdown);
  if (stages.length === 0) {
    issues.push(issue('body', 'Missing a `## <Stage>` heading.'));
  }
  const seenStages = new Set<number>();
  let itemCount = 0;
  for (const stage of stages) {
    if (stage.stage !== undefined) {
      if (seenStages.has(stage.stage)) {
        issues.push(
          finding({
            code: GATE_CODES.duplicateStage,
            field: stage.heading,
            message: `Stage ${stage.stage} is declared more than once.`,
            expected: 'one heading per stage number',
            actual: `stage ${stage.stage}`,
            line: stage.line,
            fix: 'Renumber the duplicate stage so every stage is unique.',
          }),
        );
      }
      seenStages.add(stage.stage);
    }
    if (stage.items.length === 0) {
      issues.push(issue(stage.heading, 'Stage has no checklist items (`- [ ] <check>`).'));
      continue;
    }
    for (const item of stage.items) {
      itemCount++;
      if (item.text === '') {
        issues.push(issue(stage.heading, 'Checklist item is empty.'));
      } else if (PLACEHOLDER.test(item.text)) {
        issues.push(issue(stage.heading, `Checklist item is still a placeholder: '${item.text}'.`));
      }
    }
    issues.push(...verifyStageMetadata(stage));
  }
  if (options.requireClassified === true && !stages.some((stage) => stage.kind !== undefined)) {
    issues.push(
      finding({
        code: GATE_CODES.noMechanicalStages,
        field: 'GATES.md',
        message:
          'A v2 unfinished task gate declares no classified stage, so `gate run` has nothing to execute.',
        expected:
          'at least one `(mechanical)` stage with a `command:` line, or a `(subjective)` stage with a `judge:` line',
        actual: 'every stage is unclassified',
        fix: 'Classify a stage as `(mechanical)` and name its command, or as `(subjective)` and name its judge.',
      }),
    );
  }
  if (stages.length > 0 && itemCount === 0) {
    issues.push(issue('body', 'No checklist items (`- [ ]`) found.'));
  }
  return { valid: noErrors(issues), issues };
};

/** Verify the kind and metadata contract of one stage. */
const verifyStageMetadata = (stage: GateStage): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  for (const entry of stage.metadata) {
    if (!METADATA_KEYS.has(entry.key)) {
      issues.push(
        finding({
          code: GATE_CODES.malformedMetadata,
          field: stage.heading,
          message: `Stage metadata '${entry.key}:' is not recognized.`,
          expected: '`command:`, `judge:`, `scope:`, or `lane:` before the first checklist item',
          actual: `${entry.key}: ${entry.value}`,
          line: entry.line,
          fix: 'Remove the line, or use `command:` on a mechanical stage and `judge:` on a subjective one.',
        }),
      );
    }
  }
  issues.push(...verifyScopeMetadata(stage));
  issues.push(...verifyLaneMetadata(stage));
  const commands = metadataOf(stage, 'command');
  const judges = metadataOf(stage, 'judge');
  if (stage.kind === undefined) {
    if (commands.length > 0 || judges.length > 0) {
      issues.push(
        finding({
          code: GATE_CODES.kindMissing,
          field: stage.heading,
          message:
            'A stage with gate metadata must declare its kind as `(mechanical)` or `(subjective)`.',
          expected: `## Stage ${stage.stage ?? '<n>'}: ${stage.title} (mechanical|subjective)`,
          actual: stage.heading,
          line: stage.line,
          fix: 'Add the kind suffix to the stage heading, or remove the metadata line.',
        }),
      );
    }
    return issues;
  }
  if (stage.kind === 'mechanical') {
    if (judges.length > 0) {
      issues.push(
        ...forbiddenMetadata(
          stage,
          'judge',
          'a mechanical stage runs `command:` and takes no `judge:`',
        ),
      );
    }
    if (commands.length !== 1) {
      issues.push(
        finding({
          code: GATE_CODES.malformedMetadata,
          field: stage.heading,
          message: `A mechanical stage must carry exactly one \`command:\` line; found ${commands.length}.`,
          expected: 'exactly one `command: <shell command>`',
          actual: `${commands.length} command lines`,
          line: stage.line,
          fix: 'Add one `command:` line between the heading and the first checklist item.',
        }),
      );
    } else {
      issues.push(...verifyCommand(stage, commands[0]));
    }
    return issues;
  }
  if (commands.length > 0) {
    issues.push(
      ...forbiddenMetadata(
        stage,
        'command',
        'a subjective stage names its `judge:` and takes no `command:`',
      ),
    );
  }
  if (judges.length !== 1) {
    issues.push(
      finding({
        code: GATE_CODES.malformedMetadata,
        field: stage.heading,
        message: `A subjective stage must carry exactly one \`judge:\` line; found ${judges.length}.`,
        expected: 'exactly one `judge: <profile-slug>`',
        actual: `${judges.length} judge lines`,
        line: stage.line,
        fix: 'Add one `judge:` line between the heading and the first checklist item.',
      }),
    );
  } else if (judges[0] !== undefined && !SLUG_PATTERN.test(judges[0].value)) {
    issues.push(
      finding({
        code: GATE_CODES.malformedMetadata,
        field: stage.heading,
        message: `Judge '${judges[0].value}' is not a profile slug.`,
        expected: 'a lowercase kebab-case profile slug',
        actual: judges[0].value,
        line: judges[0].line,
        fix: 'Name the reviewer profile with lowercase words joined by hyphens.',
      }),
    );
  }
  return issues;
};

/** Verify one stage's `scope:` metadata: exactly one, and inside the C2 grammar. */
const verifyScopeMetadata = (stage: GateStage): ReadonlyArray<Issue> => {
  const entries = metadataOf(stage, 'scope');
  if (entries.length === 0) return [];
  if (entries.length > 1) {
    return [
      finding({
        code: GATE_CODES.malformedMetadata,
        field: stage.heading,
        message: `A stage may declare at most one \`scope:\` line; found ${entries.length}.`,
        expected: 'one `scope: <token[,token…]>` line',
        actual: `${entries.length} scope lines`,
        line: stage.line,
        fix: 'Merge the scopes into one comma-separated `scope:` line.',
      }),
    ];
  }
  const entry = entries[0];
  const value = entry?.value ?? '';
  if (value.trim() === '' || !isScopeList(value)) {
    return [
      finding({
        code: GATE_CODES.invalidScope,
        field: stage.heading,
        message: `Stage scope '${value}' is not a workspace-relative path, a comma-separated list, or 'repo'.`,
        expected: 'comma-separated workspace-relative paths, optionally ending in /, or `repo`',
        actual: value,
        line: entry?.line ?? stage.line,
        fix: 'Name the paths the command reads (e.g. `packages/specs`) or `repo` for the whole workspace.',
      }),
    ];
  }
  return [];
};

/** Verify one stage's `lane:` metadata. */
const verifyLaneMetadata = (stage: GateStage): ReadonlyArray<Issue> => {
  const entries = metadataOf(stage, 'lane');
  if (entries.length === 0) return [];
  if (entries.length > 1) {
    return [
      finding({
        code: GATE_CODES.malformedMetadata,
        field: stage.heading,
        message: `A stage may declare at most one \`lane:\` line; found ${entries.length}.`,
        expected: 'one `lane: heavy|light` line',
        actual: `${entries.length} lane lines`,
        line: stage.line,
        fix: 'Keep exactly one lane line.',
      }),
    ];
  }
  const entry = entries[0];
  const value = entry?.value ?? '';
  if (!isGateLane(value)) {
    return [
      finding({
        code: GATE_CODES.invalidLane,
        field: stage.heading,
        message: `Stage lane '${value}' is not 'heavy' or 'light'.`,
        expected: 'heavy or light',
        actual: value,
        line: entry?.line ?? stage.line,
        fix: 'Use `lane: heavy` for a suite/build/typecheck/lint and `lane: light` for a narrow check.',
      }),
    ];
  }
  return [];
};

/** A finding for metadata that the stage's kind forbids. */
const forbiddenMetadata = (
  stage: GateStage,
  key: string,
  expectation: string,
): ReadonlyArray<Issue> =>
  metadataOf(stage, key).map((entry) =>
    finding({
      code: GATE_CODES.malformedMetadata,
      field: stage.heading,
      message: `Stage metadata '${entry.key}:' is forbidden here; ${expectation}.`,
      expected: expectation,
      actual: `${entry.key}: ${entry.value}`,
      line: entry.line,
      fix: `Remove the \`${key}:\` line.`,
    }),
  );

/** Verify one mechanical stage's command line. */
const verifyCommand = (stage: GateStage, entry: GateMetadata | undefined): ReadonlyArray<Issue> => {
  const command = entry?.value ?? '';
  if (command.trim() === '') {
    return [
      finding({
        code: GATE_CODES.malformedMetadata,
        field: stage.heading,
        message: 'A mechanical stage has an empty `command:` line.',
        expected: 'a shell command to execute',
        actual: 'empty',
        line: entry?.line ?? stage.line,
        fix: 'Write the command that proves this stage.',
      }),
    ];
  }
  if (COMMAND_PLACEHOLDER.test(command) || TODO_COMMAND.test(command)) {
    return [
      finding({
        code: GATE_CODES.placeholderCommand,
        field: stage.heading,
        message: `Mechanical command is still a placeholder: '${command}'.`,
        expected: 'the real command that proves this stage',
        actual: command,
        line: entry?.line ?? stage.line,
        fix: 'Replace the placeholder with the command the stage actually runs.',
      }),
    ];
  }
  return [];
};

/**
 * The gate-progress rule on its own: a task that claims `complete` must show at
 * least one checked gate item or one recorded passing result. An all-unchecked
 * `GATES.md` with no passing result is a record contradiction — the task says
 * its verification ran and the gate records no result — so it is an error. An
 * unfinished task may carry an all-unchecked gate with no finding.
 * @param markdown - raw GATES.md contents
 * @param complete - true when the task declares `status: complete`
 * @param results - optional `GATE-RESULTS.jsonl` contents
 * @returns the findings, in reporting order
 */
export const verifyGateProgress = (
  markdown: string,
  complete: boolean,
  results?: string | undefined,
): Result => {
  if (!complete) return { valid: true, issues: [] };
  const stages = parseGates(markdown);
  const template = stages.find(
    (stage) =>
      stage.kind === 'mechanical' &&
      stage.command !== undefined &&
      isPlaceholderCommand(stage.command),
  );
  if (template !== undefined) {
    return {
      valid: false,
      issues: [
        finding({
          code: GATE_CODES.placeholderCommand,
          field: 'gate',
          message: `Completed task's mechanical command is still a placeholder: '${template.command ?? ''}'.`,
          expected: 'the real command that proves the stage',
          actual: template.command ?? '',
          fix: 'Replace the placeholder with the command the stage actually runs, then run the gate.',
        }),
      ],
    };
  }
  const items = stages.flatMap((stage) => stage.items);
  if (items.some((item) => item.checked)) {
    return { valid: true, issues: [] };
  }
  if (results !== undefined) {
    const stageNumbers = new Set(
      stages.map((stage) => stage.stage).filter((stage): stage is number => stage !== undefined),
    );
    const passed = parseGateResults(results).records.some(
      (record) => record.verdict === 'pass' && stageNumbers.has(record.stage),
    );
    if (passed) return { valid: true, issues: [] };
  }
  if (items.length === 0) return { valid: true, issues: [] };
  return {
    valid: false,
    issues: [
      finding({
        code: GATE_UNCHECKED_CODE,
        field: 'gate',
        message: `Completed task has ${items.length} gate ${items.length === 1 ? 'item' : 'items'} and none checked; the gate records no verification result.`,
        expected: 'at least one checked gate item (`- [x]`) or a recorded passing result',
        actual: `${items.length} unchecked`,
        fix: 'Run the gate and check each item that passed, or set `status: in-progress`.',
      }),
    ],
  };
};

/** A non-negative stage number. */
const StageNumber = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** A process exit status. */
const ExitCode = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(255),
);

/** A recorded instant. */
const RecordedInstant = Schema.String.check(Schema.isPattern(INSTANT));

/** One mechanical record, exactly B004's keys plus the scheduler's optional ones. */
const MechanicalRecord = Schema.Struct({
  stage: StageNumber,
  title: Schema.String,
  kind: Schema.Literal('mechanical'),
  command: Schema.NonEmptyString,
  exit: ExitCode,
  verdict: Schema.Literals(GATE_VERDICTS),
  at: RecordedInstant,
  output: Schema.String,
  scope: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  key: Schema.optionalKey(Schema.NonEmptyString),
  fingerprint: Schema.optionalKey(Schema.NonEmptyString),
  owner: Schema.optionalKey(Schema.String),
  durationMs: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  lane: Schema.optionalKey(Schema.Literals(['heavy', 'light'])),
  waitedMs: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  reused: Schema.optionalKey(Schema.Boolean),
  source: Schema.optionalKey(RecordedInstant),
});

/** One subjective record, exactly B004's keys. */
const SubjectiveRecord = Schema.Struct({
  stage: StageNumber,
  title: Schema.String,
  kind: Schema.Literal('subjective'),
  judge: Schema.NonEmptyString.check(Schema.isPattern(SLUG_PATTERN)),
  verdict: Schema.Literals(GATE_VERDICTS),
  at: RecordedInstant,
  note: Schema.NonEmptyString,
});

/** Either result record shape. */
const GateResultSchema = Schema.Union([MechanicalRecord, SubjectiveRecord]);

/** Strict decoder: an extra key is a malformed line, never silently dropped. */
const decodeGateResult = Schema.decodeUnknownOption(GateResultSchema, {
  onExcessProperty: 'error',
});

/** One parsed line: a record, or the reason the line is malformed. */
type ParsedRecord =
  | { readonly ok: true; readonly record: GateResult }
  | { readonly ok: false; readonly reason: string };

/** Parse one JSONL line into a record, or a reason it is malformed. */
const parseRecord = (line: string, number: number): ParsedRecord => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, reason: `line ${number} is not JSON` };
  }
  const decoded = decodeGateResult(value);
  if (Option.isNone(decoded)) {
    return {
      ok: false,
      reason: `line ${number} is not a mechanical or subjective gate result record`,
    };
  }
  return { ok: true, record: decoded.value };
};

/**
 * Parse a `GATE-RESULTS.jsonl` file. A blank line is ignored; every other
 * unparsable line is a `gate.results-malformed` finding naming its line, and
 * contributes no record. A mechanical record whose verdict disagrees with its
 * exit status is `gate.result-inconsistent`.
 * @param content - raw `GATE-RESULTS.jsonl` contents
 * @returns the valid records and the malformed-line findings
 */
export const parseGateResults = (content: string): GateResultsParse => {
  const records: Array<GateResult> = [];
  const issues: Array<Issue> = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue;
    const number = index + 1;
    const parsed = parseRecord(line.trim(), number);
    if (!parsed.ok) {
      issues.push(
        finding({
          code: GATE_CODES.resultsMalformed,
          field: GATE_RESULTS_FILE,
          message: `Malformed gate result: ${parsed.reason}.`,
          expected: 'one B004 result record per line',
          actual: parsed.reason,
          line: number,
          fix: 'Fix or remove the malformed line; only `gate run` and `gate record` write this file.',
        }),
      );
      continue;
    }
    const record = parsed.record;
    if (record.kind === 'mechanical' && (record.verdict === 'pass') !== (record.exit === 0)) {
      issues.push(
        finding({
          code: GATE_CODES.resultInconsistent,
          field: GATE_RESULTS_FILE,
          message: `Stage ${record.stage} records '${record.verdict}' with exit ${record.exit ?? '?'}; a pass must be exit 0.`,
          expected: 'verdict pass with exit 0, or verdict fail with a non-zero exit',
          actual: `verdict ${record.verdict}, exit ${record.exit ?? '?'}`,
          line: number,
          fix: 'Re-run the gate with `mf-specs gate run`; never hand-edit a result.',
        }),
      );
    }
    records.push(record);
  }
  return { records, issues };
};

/** The last record per stage, in file order: the authoritative one. */
export const latestResults = (
  records: ReadonlyArray<GateResult>,
): ReadonlyMap<number, GateResult> => {
  const latest = new Map<number, GateResult>();
  for (const record of records) latest.set(record.stage, record);
  return latest;
};

/** Context for {@link verifyGateResults}. */
export interface GateResultsInput {
  /** Raw owner `GATES.md` contents. */
  readonly gates: string;
  /** Raw owner `GATE-RESULTS.jsonl` contents, when the file exists. */
  readonly results?: string | undefined;
  /** True when the owning task or phase declares complete. */
  readonly complete: boolean;
  /** Owner label: the task id, or `phase <id>`. */
  readonly owner: string;
}

/**
 * Verify recorded gate results against an owner's gate file. Results that name
 * no declared stage are `gate.result-owner-mismatch`; a complete owner with a
 * mechanical stage whose latest record is not a matching pass is
 * `gate.unproven` (error); a complete owner's unjudged subjective stage is
 * `gate.unjudged` (warning). An unfinished owner gets no unproven/unjudged
 * finding, and an unclassified legacy stage requires nothing.
 * @param input - gate text, results text, completion, and owner label
 * @returns the result; `valid` is true only with zero errors
 */
export const verifyGateResults = (input: GateResultsInput): Result => {
  const stages = parseGates(input.gates);
  const parsedResults = parseGateResults(input.results ?? '');
  const issues: Array<Issue> = [...parsedResults.issues];
  const latest = latestResults(parsedResults.records);
  const byStage = new Map<number, GateStage>();
  for (const stage of stages) {
    if (stage.stage !== undefined && !byStage.has(stage.stage)) byStage.set(stage.stage, stage);
  }

  for (const record of parsedResults.records) {
    const stage = byStage.get(record.stage);
    if (stage === undefined) {
      issues.push(
        finding({
          code: GATE_CODES.resultOwnerMismatch,
          field: GATE_RESULTS_FILE,
          message: `${input.owner} records a result for stage ${record.stage}, which its GATES.md does not declare.`,
          expected: 'a result for a stage declared in the owner GATES.md',
          actual: `stage ${record.stage}`,
          fix: 'Remove the stray record, or declare the stage it names.',
        }),
      );
      continue;
    }
    if (stage.kind !== record.kind) {
      issues.push(
        finding({
          code: GATE_CODES.resultInconsistent,
          field: GATE_RESULTS_FILE,
          message: `Stage ${record.stage} is '${stage.kind ?? 'unclassified'}' in GATES.md but '${record.kind}' in its result.`,
          expected: `${stage.kind ?? 'unclassified'} record`,
          actual: record.kind,
          fix: 'Re-run the stage with the verb that matches its kind.',
        }),
      );
    }
    const declared = stageScope(stage);
    if (declared !== undefined && record.kind === 'mechanical') {
      if (record.scope === undefined) {
        issues.push(
          finding({
            code: GATE_CODES.resultsMalformed,
            field: GATE_RESULTS_FILE,
            message: `Stage ${record.stage} declares scope '${declared.join(',')}' but its result records no scope.`,
            expected: `a result covering the declared scope (${declared.join(',')})`,
            actual: 'no scope',
            fix: `Re-run mf-specs gate run --stage ${record.stage} so the result carries the scope it covered.`,
          }),
        );
      } else if (!scopeContains(normalizeScopeList(record.scope), normalizeScopeList(declared))) {
        issues.push(
          finding({
            code: GATE_CODES.staleResult,
            field: GATE_RESULTS_FILE,
            message: `Stage ${record.stage} declares scope '${declared.join(',')}' but its result covers '${record.scope.join(',')}'.`,
            expected: `a result covering the declared scope (${declared.join(',')})`,
            actual: `scope ${record.scope.join(',')}`,
            fix: `Re-run mf-specs gate run --stage ${record.stage} so the result covers the declared scope.`,
          }),
        );
      }
    }
  }

  if (!input.complete) return { valid: noErrors(issues), issues };

  for (const stage of stages) {
    if (stage.kind === undefined || stage.stage === undefined) continue;
    const record = latest.get(stage.stage);
    if (stage.kind === 'mechanical') {
      const command = stage.command;
      const pass = record?.kind === 'mechanical' && record.verdict === 'pass';
      const commandMatches = record?.kind === 'mechanical' && record.command === command;
      if (!pass || !commandMatches) {
        const actual =
          record === undefined
            ? 'no recorded result'
            : record.kind !== 'mechanical'
              ? `a ${record.kind} result`
              : record.verdict !== 'pass'
                ? `latest verdict ${record.verdict}`
                : `latest command '${record.command ?? ''}' differs from '${command ?? ''}'`;
        issues.push(
          finding({
            code: GATE_CODES.unproven,
            field: 'GATES.md',
            message: `${input.owner} is complete but mechanical stage ${stage.stage} '${stage.title}' has no recorded passing result (${actual}).`,
            expected: `a GATE-RESULTS.jsonl pass for stage ${stage.stage} with command '${command ?? ''}'`,
            actual,
            fix: `Run mf-specs gate run --stage ${stage.stage} for this owner, then re-check.`,
          }),
        );
      }
      continue;
    }
    const judged = record?.kind === 'subjective' && record.verdict === 'pass';
    if (!judged) {
      issues.push(
        finding({
          code: GATE_CODES.unjudged,
          severity: 'warning',
          field: 'GATES.md',
          message: `${input.owner} is complete but subjective stage ${stage.stage} '${stage.title}' has no recorded passing verdict from '${stage.judge ?? 'its judge'}'.`,
          expected: `a subjective pass recorded by ${stage.judge ?? 'the named judge'}`,
          actual: record === undefined ? 'no recorded verdict' : `latest verdict ${record.verdict}`,
          fix: `Have ${stage.judge ?? 'the named reviewer'} record stage ${stage.stage} with mf-specs gate record.`,
        }),
      );
    }
  }
  return { valid: noErrors(issues), issues };
};

// The one clock format lives in `modules/stamp`, shared with `mail` and `stamp`.
export { instant } from '../stamp/index.js';
