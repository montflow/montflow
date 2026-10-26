import { PromptStore, Prompts, SkillCheck } from '@montflow/prompts';
import { Data, Effect, Match, Schema } from 'effect';
import {
  type PayloadInstall,
  SPEC_PROMPT_NAMES,
  SPEC_SKILL_NAMES,
  runDoctor,
} from '../../apps/doctor/index.js';

/**
 * The spec prompt loader: take a shipped prompt by name, prove it is current,
 * verify it, and render it with the caller's values.
 *
 * Two properties keep a dispatched session honest:
 *
 * - **Doctor owns freshness.** The installed copy under
 *   `.agents/@montflow/prompts/` is compared byte for byte with the package
 *   prompt before anything is read, so a missing or stale template fails with
 *   the file, the problem, and `mf-specs doctor` as the fix — an agent never
 *   acts on guidance the package no longer ships.
 * - **No template text lives here.** Loading, verification, and rendering all
 *   come from `@montflow/prompts`; this module only maps its outcomes onto the
 *   spec tool's coded diagnostics and hands back the rendered text plus the
 *   skills the caller must load.
 */

/** Shipped spec prompts, re-exported so callers never restate the list. */
export const PROMPT_NAMES = SPEC_PROMPT_NAMES;

/** Stable, greppable codes for every prompt-load failure class. */
export const CODES = {
  unknown: 'prompt.unknown',
  missing: 'prompt.missing',
  stale: 'prompt.stale',
  blocked: 'prompt.blocked',
  read: 'prompt.read',
  invalid: 'prompt.invalid',
  missingVariable: 'prompt.missing-variable',
  render: 'prompt.render',
  mode: 'prompt.mode',
  skillMissing: 'prompt.skill-missing',
  skillStale: 'prompt.skill-stale',
  skillBlocked: 'prompt.skill-blocked',
} as const;

/** One stable prompt-load failure code. */
export type Code = (typeof CODES)[keyof typeof CODES];

/** The one repair every prompt failure names. */
export const DOCTOR_FIX =
  'Run mf-specs doctor to install or refresh the shipped skills and prompts.';

// ─── Interaction modes ────────────────────────────────────────────────

/**
 * The public interaction modes, default first. `guided` keeps the human in the
 * loop; `autonomous` only asks for decisions the coordinator may not make
 * alone. These two names are the whole public contract: the CLI accepts no
 * other value, and the internal policy names never reach a flag.
 */
export const MODES = ['guided', 'autonomous'] as const;

/** A public interaction mode. */
export type Mode = (typeof MODES)[number];

/** Mode every caller gets when none is supplied. */
export const DEFAULT_MODE: Mode = 'guided';

/** The mode list, for diagnostics and help text. */
export const MODE_HINT = MODES.join(', ');

/** The flag that selects a mode, for diagnostics. */
export const MODE_FLAG = '--mode';

/**
 * Internal policy each public mode maps onto. Kept for docs and diagnostics
 * only: `--mode` never accepts these names.
 */
export const POLICIES = {
  guided: 'supervised',
  autonomous: 'unsupervised',
} as const satisfies Record<Mode, string>;

/**
 * Template variable that carries the policy. It stays `unsupervised` because
 * the template grammar has no string comparison, so the flag is a truthy
 * string rather than the mode name.
 */
export const UNSUPERVISED_VARIABLE = 'unsupervised';

/** The `unsupervised` value each mode renders to: blank for guided, non-empty for autonomous. */
export const UNSUPERVISED_VALUES = {
  guided: '',
  autonomous: 'autonomous',
} as const satisfies Record<Mode, string>;

/** True when `value` is one of the public modes. */
export const isMode = (value: string): value is Mode => MODES.some((mode) => mode === value);

/** The `unsupervised` value a mode renders to. */
export const unsupervisedOf = (mode: Mode): string => UNSUPERVISED_VALUES[mode];

/** Why a mode value was refused. */
export interface ModeRefusal {
  readonly ok: false;
  readonly code: typeof CODES.mode;
  readonly problem: string;
  readonly expected: string;
  readonly actual: string;
  readonly fix: string;
}

/** A mode parse: the public mode, or the refusal the caller must report. */
export type ModeParse = { readonly ok: true; readonly mode: Mode } | ModeRefusal;

/**
 * Parse a `--mode` value. Blank and omitted both mean {@link DEFAULT_MODE};
 * only the two public names are accepted, case-sensitive, so the internal
 * `supervised` / `unsupervised` policy names are refused exactly like an
 * invented one.
 * @param value - raw flag value, or undefined when the flag was omitted
 * @returns the mode, or a coded refusal naming both accepted values
 */
export const parseMode = (value: string | undefined): ModeParse => {
  if (value === undefined || value === '') return { ok: true, mode: DEFAULT_MODE };
  if (isMode(value)) return { ok: true, mode: value };
  return {
    ok: false,
    code: CODES.mode,
    problem: `Unknown interaction mode '${value}'.`,
    expected: `one of ${MODE_HINT}`,
    actual: value,
    fix: `Pass ${MODE_FLAG} guided or ${MODE_FLAG} autonomous, or omit ${MODE_FLAG} for guided.`,
  };
};

/**
 * A prompt the loader refused to render: which file failed, why, and the one
 * command that repairs it. Carries the same fields as the spec tool's other
 * agent-first diagnostics, so the CLI can render it without reinterpreting it.
 */
export class PromptError extends Data.TaggedError('@montflow/PromptError')<{
  /** Stable, greppable failure class. */
  readonly code: Code;
  /** Prompt file or root the failure concerns. */
  readonly path: string;
  /** Field inside that path (`name`, `template`, or a variable name). */
  readonly field: string;
  /** What is wrong, as a human sentence. */
  readonly problem: string;
  /** What the contract requires, when naming it helps. */
  readonly expected?: string;
  /** What the file or call actually held, when naming it helps. */
  readonly actual?: string;
  /** Concrete command that repairs the failure. */
  readonly fix: string;
  /** Preserved underlying failure, when one exists. */
  readonly cause?: unknown;
}> {}

/** Fields a {@link PromptError} is built from. */
interface PromptErrorInput {
  readonly code: Code;
  readonly path: string;
  readonly field: string;
  readonly problem: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly fix?: string | undefined;
  readonly cause?: unknown;
}

/** A {@link PromptError} being filled in, so absent optional fields stay absent. */
interface MutablePromptError {
  code: Code;
  path: string;
  field: string;
  problem: string;
  fix: string;
  expected?: string;
  actual?: string;
  cause?: unknown;
}

/** Build one coded failure, omitting absent optional fields. */
const promptError = (input: PromptErrorInput): PromptError => {
  const built: MutablePromptError = {
    code: input.code,
    path: input.path,
    field: input.field,
    problem: input.problem,
    fix: input.fix ?? DOCTOR_FIX,
  };
  if (input.expected !== undefined) built.expected = input.expected;
  if (input.actual !== undefined) built.actual = input.actual;
  if (input.cause !== undefined) built.cause = input.cause;
  return new PromptError(built);
};

/**
 * Fold the public mode into the template's internal `unsupervised` flag and
 * drop the `mode` key, which no prompt declares. A prompt without the flag is
 * left alone, and an internal caller that supplies `unsupervised` directly
 * keeps it when no public mode was passed.
 */
const applyMode = (
  variables: ReadonlyArray<Prompts.Variable>,
  values: Readonly<Record<string, string>>,
  mode: Mode | undefined,
) => {
  const { mode: _supplied, ...rest } = values;
  if (mode === undefined) return rest;
  if (!variables.some((variable) => variable.name === UNSUPERVISED_VARIABLE)) return rest;
  return { ...rest, [UNSUPERVISED_VARIABLE]: unsupervisedOf(mode) };
};

/** A rendered prompt ready to dispatch. */
export interface LoadedPrompt {
  /** Prompt slug (`spec-create`, `spec-execute`, or `spec-sizing`). */
  readonly name: string;
  /** Rendered text to send to the agent. */
  readonly text: string;
  /** Skill names the caller must load alongside the prompt. */
  readonly skills: ReadonlyArray<string>;
  /** The decoded prompt, so callers can read its metadata without re-reading. */
  readonly prompt: Prompts.Prompt;
}

/**
 * What a payload status means for the prompt gate: current, or why not.
 *
 * `fix` is present only when doctor computed a repair that differs from
 * {@link DOCTOR_FIX} — the `blocked` conditions repair refuses (a symlink, a
 * directory where a file belongs), whose fix is the removal/move the report
 * printed. Propagating it keeps the loader's advertised repair convergent.
 */
type GateOutcome =
  | { readonly code: Code; readonly problem: string; readonly fix?: string }
  | undefined;

/** The doctor outcome for one prompt as a coded failure, or `undefined` when current. */
const gateFailure = (
  root: string,
  name: string,
  prompts: ReadonlyArray<PayloadInstall>,
): PromptError | undefined => {
  const entry = prompts.find((prompt) => prompt.name === name);
  if (entry === undefined) {
    return promptError({
      code: CODES.unknown,
      path: root,
      field: 'name',
      problem: `Unknown spec prompt '${name}'.`,
      expected: `one of ${PROMPT_NAMES.join(', ')}`,
      actual: name,
      fix: `Load one of ${PROMPT_NAMES.join(', ')}.`,
    });
  }
  const outcome = Match.value(entry.status).pipe(
    Match.whenOr('ok', 'present', 'installed', 'repaired', (): GateOutcome => undefined),
    Match.when('missing', (): GateOutcome => ({
      code: CODES.missing,
      problem: `Prompt '${name}' is not installed.`,
    })),
    Match.when('stale', (): GateOutcome => ({
      code: CODES.stale,
      problem: `Prompt '${name}' is not current: ${entry.failure?.problem ?? entry.detail ?? entry.status}.`,
    })),
    Match.when('blocked', (): GateOutcome => ({
      code: CODES.blocked,
      problem: `Prompt '${name}' is blocked: ${entry.failure?.problem ?? entry.detail ?? entry.status}.`,
      fix: entry.failure?.fix ?? DOCTOR_FIX,
    })),
    Match.exhaustive,
  );
  if (outcome === undefined) return undefined;
  return promptError({
    code: outcome.code,
    path: entry.target,
    field: 'prompt',
    problem: outcome.problem,
    expected: `a current '${name}.json' at '${entry.target}'`,
    actual: entry.detail ?? entry.status,
    fix: outcome.fix,
    cause: entry.failure?.cause,
  });
};

/** Directory a declared skill must be installed in. */
const skillsRoot = (root: string): string => `${root.replace(/\/+$/, '')}/.agents/skills`;

/** True when `doctor` owns the skill, so `mf-specs doctor` is its installer. */
const doctorOwns = (skill: string): boolean => SPEC_SKILL_NAMES.some((owned) => owned === skill);

/** The one repair a missing declared skill names. */
const skillFix = (root: string, skill: string): string =>
  doctorOwns(skill)
    ? DOCTOR_FIX
    : `Install '${skill}' under ${skillsRoot(root)}/ (npx skills add montflow/montflow -s ${skill} -y), then re-run.`;

/**
 * Gate one doctor-owned declared skill. The status selects the code and the
 * repair: `missing` and `stale` are what `mf-specs doctor` repairs, while
 * `blocked` carries doctor's own refusal to write — a symlink or an
 * obstruction — so its removal/move fix is propagated instead of the doctor
 * rerun that cannot clear it.
 */
const ownedSkillFailure = (
  skill: string,
  promptName: string,
  entry: PayloadInstall,
): PromptError | undefined =>
  Match.value(entry.status).pipe(
    Match.whenOr(
      'ok',
      'present',
      'installed',
      'repaired',
      (): PromptError | undefined => undefined,
    ),
    Match.when('missing', () =>
      promptError({
        code: CODES.skillMissing,
        path: entry.target,
        field: skill,
        problem: `Skill '${skill}' declared by prompt '${promptName}' is not installed.`,
        expected: `a current '${skill}' skill at '${entry.target}'`,
        actual: entry.detail ?? entry.status,
        fix: DOCTOR_FIX,
        cause: entry.failure?.cause,
      }),
    ),
    Match.when('stale', () =>
      promptError({
        code: CODES.skillStale,
        path: entry.target,
        field: skill,
        problem: `Skill '${skill}' declared by prompt '${promptName}' is not current: ${entry.failure?.problem ?? entry.detail ?? entry.status}.`,
        expected: `a current '${skill}' skill at '${entry.target}'`,
        actual: entry.detail ?? entry.status,
        fix: DOCTOR_FIX,
        cause: entry.failure?.cause,
      }),
    ),
    Match.when('blocked', () =>
      promptError({
        code: CODES.skillBlocked,
        path: entry.target,
        field: skill,
        problem: `Skill '${skill}' declared by prompt '${promptName}' is blocked: ${entry.failure?.problem ?? entry.detail ?? entry.status}.`,
        expected: `a writable, non-symlinked '${skill}' skill directory at '${entry.target}'`,
        actual: entry.detail ?? entry.status,
        fix: entry.failure?.fix,
        cause: entry.failure?.cause,
      }),
    ),
    Match.exhaustive,
  );

/**
 * Gate a decoded prompt's declared skills. `doctor` already reports owned
 * skills, so a missing/stale/blocked owned skill fails before dispatch with its
 * own code and repair; a skill doctor does not ship is resolved against
 * `<root>/.agents/skills` and fails with its own installer. Skipping either
 * would dispatch a session whose first instruction is to load a skill that
 * does not exist.
 */
const skillGateFailure = (
  root: string,
  promptName: string,
  declared: ReadonlyArray<string>,
  doctorSkills: ReadonlyArray<PayloadInstall>,
  resolution: Prompts.SkillResolution | undefined,
): PromptError | undefined => {
  for (const skill of declared) {
    const owned = doctorSkills.find((entry) => entry.name === skill);
    if (owned !== undefined) {
      const failure = ownedSkillFailure(skill, promptName, owned);
      if (failure !== undefined) return failure;
    }
    if (resolution === undefined || resolution.names.has(skill)) continue;
    return promptError({
      code: CODES.skillMissing,
      path: `${skillsRoot(root)}/${skill}`,
      field: skill,
      problem: `Skill '${skill}' declared by prompt '${promptName}' is not installed.`,
      expected: `an installed skill named '${skill}' under ${skillsRoot(root)}/`,
      actual: 'not installed',
      fix: skillFix(root, skill),
    });
  }
  return undefined;
};

/**
 * Load and render one shipped spec prompt.
 *
 * Order matters: doctor proves the installed copy matches the package, the file
 * is read and verified against the prompt standard, required values are
 * checked, and only then is the template rendered. Every refusal is a
 * {@link PromptError} naming the file, the problem, and `mf-specs doctor`.
 * @param root - repo root that owns `.agents/@montflow/prompts/`
 * @param name - prompt slug (`spec-create`, `spec-execute`, or `spec-sizing`)
 * @param values - caller values by variable name, plus the optional `mode`
 *   (`guided` or `autonomous`); the loader folds it into `unsupervised`
 * @returns the rendered text, the declared skills, and the decoded prompt
 */
export const load = (
  root: string,
  name: string,
  values: Readonly<Record<string, string>>,
): Effect.Effect<LoadedPrompt, PromptError, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const doctor = yield* runDoctor(root, { check: true });
    const refusal = gateFailure(root, name, doctor.prompts);
    if (refusal !== undefined) return yield* Effect.fail(refusal);

    const target = doctor.prompts.find((prompt) => prompt.name === name)?.target ?? root;
    const store = yield* PromptStore.PromptStore;
    const raw = yield* store.readRaw(root, name).pipe(
      Effect.mapError((cause) =>
        promptError({
          code: CODES.read,
          path: cause.path ?? target,
          field: 'prompt',
          problem: cause.message,
          expected: `a readable '${name}.json' at '${target}'`,
          cause,
        }),
      ),
    );

    const resolution = yield* SkillCheck.resolveSkills(root);
    const verified = Prompts.verifyPromptFile(name, raw, { skills: resolution });
    if (!verified.valid) {
      const first =
        verified.issues.find((found) => (found.severity ?? 'error') === 'error') ??
        verified.issues[0];
      return yield* Effect.fail(
        promptError({
          code: CODES.invalid,
          path: target,
          field: first?.field ?? 'prompt',
          problem: first?.message ?? `Prompt '${name}' does not pass verification.`,
          fix: first?.fix ?? DOCTOR_FIX,
        }),
      );
    }

    const prompt = yield* Schema.decodeUnknownEffect(Prompts.FromJson)(raw).pipe(
      Effect.mapError((cause) =>
        promptError({
          code: CODES.invalid,
          path: target,
          field: 'json',
          problem: `Prompt '${name}' does not decode as a prompt file.`,
          expected: 'the prompt file shape',
          actual: 'decode failure',
          cause,
        }),
      ),
    );

    const skillRefusal = skillGateFailure(root, name, prompt.skills, doctor.skills, resolution);
    if (skillRefusal !== undefined) return yield* Effect.fail(skillRefusal);

    const parsed = parseMode(values.mode);
    if (!parsed.ok) {
      return yield* Effect.fail(
        promptError({
          code: parsed.code,
          path: target,
          field: 'mode',
          problem: parsed.problem,
          expected: parsed.expected,
          actual: parsed.actual,
          fix: parsed.fix,
        }),
      );
    }

    const resolved = applyMode(
      prompt.variables,
      values,
      values.mode === undefined ? undefined : parsed.mode,
    );

    const missing = Prompts.missingRequired(prompt.variables, resolved);
    if (missing.length > 0) {
      return yield* Effect.fail(
        promptError({
          code: CODES.missingVariable,
          path: target,
          field: missing[0] ?? 'variables',
          problem: `Prompt '${name}' needs a value for ${missing.join(', ')}.`,
          expected: 'a non-empty value for every required variable',
          actual: `missing: ${missing.join(', ')}`,
          fix: `Supply ${missing.join(', ')} to the prompt loader.`,
        }),
      );
    }

    const text = yield* Prompts.renderPrompt(prompt, resolved).pipe(
      Effect.mapError((problem) =>
        promptError({
          code: CODES.render,
          path: target,
          field: 'template',
          problem,
          fix: `Fix the '${name}.json' template in packages/specs/prompts, then run mf-specs doctor.`,
        }),
      ),
    );

    return { name, text, skills: [...prompt.skills], prompt };
  });
