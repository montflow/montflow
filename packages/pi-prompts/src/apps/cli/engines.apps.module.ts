import { Effect } from 'effect';
import * as PromptExecute from '../../modules/prompt-execute/index.js';
import * as Prompts from '../../modules/prompts/index.js';
import * as TemplateEngine from '../../modules/template-engine/index.js';
import { PromptStore } from '../../services/index.js';
import * as Doctor from '../doctor/index.js';

/**
 * The operations the CLI offers, as plain Effect functions over the store.
 *
 * Deliberately free of argv, of a UI, and of any notion of a "front end". The
 * binary (`binary.apps.module.ts`) and the `/mf-prompts` slash command
 * (`slash.apps.module.ts`) are both thin adapters over this module, so the two
 * surfaces cannot drift in behaviour — only in how they print a result.
 *
 * Every engine fails with a displayable string rather than a thrown error, and
 * none of them notify anything: rendering belongs to `renderers`.
 */

/** Collected variable values, by variable name. */
export type ValuesByName = Readonly<Record<string, string>>;

/** Where a prompt file lives. `dir` overrides the default store directory. */
export interface StoreScope {
  /** Project working directory. */
  readonly cwd: string;
  /** Explicit store directory, resolved against `cwd` when set. */
  readonly dir?: string | undefined;
}

/**
 * Collect `key=value` pairs from tokens, as both front-ends accept them.
 * Accepts bare `k=v`, `--set k=v`, and `--set=k=v`. First occurrence wins, so
 * a later duplicate cannot silently shadow an earlier answer.
 *
 * Return type inferred rather than annotated: a name→value map is inherently
 * an open dictionary, and naming that here would only restate it.
 * @param tokens - tokens after the subcommand and its arguments
 * @returns collected values by key
 */
export const keyValues = (tokens: readonly string[]) => {
  const values: Record<string, string> = {};
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (token === '--set') {
      const next = tokens[index + 1];
      if (next === undefined) continue;
      index++;
      const equals = next.indexOf('=');
      if (equals > 0 && values[next.slice(0, equals)] === undefined) {
        values[next.slice(0, equals)] = next.slice(equals + 1);
      }
      continue;
    }
    const match = /^(?:--set=)?([^=\s]+)=(.*)$/u.exec(token);
    if (match !== null && values[match[1] ?? ''] === undefined) {
      values[match[1] ?? ''] = match[2] ?? '';
    }
  }
  return values;
};

/** Split a comma-separated flag value into trimmed, non-empty parts. */
const csv = (value: string | undefined): readonly string[] | undefined => {
  if (value === undefined || value === '') return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 0 ? parts : undefined;
};

/**
 * Parse a `name[:flags]` variable spec. `o` marks it optional and `d=<text>`
 * gives it a default; a default implies optional, because a variable that is
 * `required` *and* defaulted could never be blank — which the verifier rejects
 * and the flag grammar therefore does not offer.
 * @param spec - the raw `--variable` value
 * @returns Effect resolving to the variable, failing on a malformed spec
 */
export const parseVariableSpec = (spec: string): Effect.Effect<Prompts.Variable, string> => {
  const [rawName, rawFlags] = spec.split(':', 2);
  const name = (rawName ?? '').trim();
  if (!TemplateEngine.isValidVariableName(name)) {
    return Effect.fail(
      `--variable '${spec}': '${name}' is not a usable variable name (expected [a-zA-Z_][a-zA-Z0-9_]*).`,
    );
  }
  const flags = rawFlags ?? '';
  const defaulted = /d=(.*)$/su.exec(flags);
  const defaultValue = defaulted?.[1] ?? '';
  const optional = defaultValue !== '' || flags.includes('o');
  return Effect.succeed(
    new Prompts.Variable({
      name,
      label: name,
      description: '',
      type: 'text',
      required: !optional,
      default: defaultValue,
    }),
  );
};

/** Parse every `name[:flags]` spec, failing on the first malformed one. */
export const parseVariableSpecs = (
  specs: readonly string[],
): Effect.Effect<ReadonlyArray<Prompts.Variable>, string> =>
  Effect.forEach(specs, (spec) => parseVariableSpec(spec));

/** Verification states accepted by `list --status`. */
export const LIST_STATUSES = ['valid', 'invalid'] as const;

/** A verification state `list --status` accepts. */
export type ListStatus = (typeof LIST_STATUSES)[number];

const isListStatus = (value: string): value is ListStatus =>
  LIST_STATUSES.some((status) => status === value);

/** Options for {@link list}: an optional verification filter. */
export interface ListOptions {
  /** Keep only prompts whose verification result matches. */
  readonly status?: ListStatus | undefined;
}

/**
 * Resolve a raw `--status` value to a {@link ListStatus}. Absent or empty
 * means "no filter"; anything else must name a state.
 * @param value - raw flag value, if any
 * @returns the status, or a refusal naming the accepted values
 */
export const resolveListStatus = (
  value: string | undefined,
): Effect.Effect<ListStatus | undefined, string> => {
  if (value === undefined || value === '') return Effect.succeed(undefined);
  return isListStatus(value)
    ? Effect.succeed(value)
    : Effect.fail(`Unknown status '${value}'. Use one of: ${LIST_STATUSES.join(', ')}.`);
};

/**
 * Every prompt in the store, sorted by name, optionally filtered to those
 * whose file passes (`valid`) or fails (`invalid`) mechanical verification.
 * The filter verifies each file's raw bytes, so it reports the file's real
 * state rather than a decoded round-trip of it. Files the store cannot decode
 * are never listed, with or without a filter.
 */
export const list = (
  scope: StoreScope,
  options: ListOptions = {},
): Effect.Effect<ReadonlyArray<Prompts.Prompt>, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const prompts = yield* store
      .list(scope.cwd, scope.dir)
      .pipe(Effect.mapError((error: PromptStore.StoreError) => error.message));
    const sorted = [...prompts].toSorted((a, b) => a.name.localeCompare(b.name));
    const status = options.status;
    if (status === undefined) return sorted;
    const wanted = status === 'valid';
    const verdicts = yield* Effect.forEach(sorted, (prompt) =>
      store.readRaw(scope.cwd, prompt.name, scope.dir).pipe(
        Effect.mapError((error: PromptStore.StoreError) => error.message),
        Effect.map((raw) => ({
          prompt,
          valid: Prompts.verifyPromptFile(prompt.name, raw).valid,
        })),
      ),
    );
    return verdicts.filter((entry) => entry.valid === wanted).map((entry) => entry.prompt);
  });

/** One prompt by name, failing with a message that names the fix. */
export const load = (
  scope: StoreScope,
  name: string,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    if (!Prompts.isValidName(name)) {
      return yield* Effect.fail(
        `'${name}' is not a valid prompt name — use a kebab-case slug such as 'my-prompt'.`,
      );
    }
    const prompts = yield* list(scope);
    const found = prompts.find((prompt) => prompt.name === name);
    return found === undefined
      ? yield* Effect.fail(`Unknown prompt '${name}'. Run \`list\` to see the available names.`)
      : found;
  });

/** Raw bytes of one prompt file, as stored on disk. */
export const readRaw = (
  scope: StoreScope,
  name: string,
): Effect.Effect<string, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    return yield* store
      .readRaw(scope.cwd, name, scope.dir)
      .pipe(Effect.mapError((error: PromptStore.StoreError) => error.message));
  });

/**
 * Mechanically verify one prompt file against the prompt standard. Pure over
 * the file's bytes, so it reports the file's real state rather than a decoded
 * round-trip of it.
 */
export const verify = (
  scope: StoreScope,
  name: string,
): Effect.Effect<Prompts.VerifyResult, string, PromptStore.PromptStore> =>
  readRaw(scope, name).pipe(Effect.map((raw) => Prompts.verifyPromptFile(name, raw)));

/** One prompt's verification result, paired with its name. */
export interface VerifyAllEntry {
  readonly name: string;
  readonly result: Prompts.VerifyResult;
}

/** A whole-store verification report. */
export interface VerifyAllReport {
  readonly entries: ReadonlyArray<VerifyAllEntry>;
  readonly issueCount: number;
}

/**
 * Mechanically verify every prompt file in the store, including files the
 * store cannot decode. Unlike {@link list}, this enumerates the directory's
 * raw `*.json` files, so a corrupt file is reported rather than dropped —
 * which is the whole point of a `verify --all` gate.
 */
export const verifyAll = (
  scope: StoreScope,
): Effect.Effect<VerifyAllReport, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const raws = yield* store
      .readAllRaw(scope.cwd, scope.dir)
      .pipe(Effect.mapError((error: PromptStore.StoreError) => error.message));
    const entries = raws.map(({ name, raw }) => ({
      name,
      result: Prompts.verifyPromptFile(name, raw),
    }));
    const issueCount = entries.reduce((count, entry) => count + entry.result.issues.length, 0);
    return { entries, issueCount };
  });

/** Everything an `inspect` needs: the summary plus the raw template text. */
export interface InspectResult {
  readonly summary: PromptExecute.PromptSummary;
  readonly template: string;
}

/** Describe one prompt, with any supplied values folded in. */
export const inspect = (
  scope: StoreScope,
  name: string,
  values: ValuesByName = {},
): Effect.Effect<InspectResult, string, PromptStore.PromptStore> =>
  load(scope, name).pipe(
    Effect.map((prompt) => ({
      summary: PromptExecute.inspect({ prompt, values }),
      template: prompt.template,
    })),
  );

/** Render a prompt to text, demanding its required values. */
export const render = (
  scope: StoreScope,
  name: string,
  values: ValuesByName = {},
): Effect.Effect<string, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const prompt = yield* load(scope, name);
    const missing = Prompts.missingRequired(prompt.variables, values);
    if (missing.length > 0) {
      return yield* Effect.fail(
        `Missing values for required variable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
      );
    }
    return yield* Prompts.renderPrompt(prompt, values);
  });

/** Model resolution plus the skills gate, for one execution. */
export interface ExecutionOptions extends StoreScope {
  /** `provider/model-id`; falls back to the prompt's own `model`. */
  readonly model?: string | undefined;
  readonly values?: ValuesByName | undefined;
  /**
   * How this caller spells `execute`, threaded into the refusal text so the
   * advice is typeable. The binary passes `mf-prompts execute`; the slash
   * command passes `/mf-prompts execute`.
   */
  readonly invocation?: string | undefined;
  /** How this caller spells `doctor`, for the skills-gate message. */
  readonly doctorInvocation?: string | undefined;
}

/**
 * Resolve a prompt into a runnable plan, or explain what is missing.
 *
 * The skills gate lives here, not in a front end, on purpose: "you may not
 * start a run on guidance the verifier no longer enforces" is a domain rule,
 * and putting it in the engine is what stops one of the two surfaces from
 * growing a private way to skip it. The gate is read-only, so resolving a plan
 * never mutates the repository.
 */
export const plan = (
  options: ExecutionOptions,
  name: string,
): Effect.Effect<PromptExecute.ExecutePlan, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const gate = yield* Doctor.runDoctor(options.cwd, { check: true });
    if (!gate.healthy) {
      return yield* Effect.fail(Doctor.doctorGateMessage(gate, options.doctorInvocation));
    }
    const prompt = yield* load(options, name);
    return PromptExecute.execute({
      prompt,
      model: options.model,
      values: options.values,
      invocation: options.invocation,
    });
  });

/** Doctor outcome for a repo, without the gate. */
export const doctor = (
  cwd: string,
  check: boolean,
  invocation?: string | undefined,
): Effect.Effect<Doctor.DoctorResult, string> => Doctor.runDoctor(cwd, { check, invocation });

/** Fields `create` accepts. Absent means the schema default. */
export interface CreateFields extends StoreScope {
  readonly name: string;
  readonly template: string;
  readonly description?: string | undefined;
  readonly model?: string | undefined;
  readonly skills?: readonly string[] | undefined;
  /** `name[:flags]` specs. Absent derives required variables from the template. */
  readonly variables?: readonly string[] | undefined;
}

/** Build and persist a new prompt. */
export const create = (
  fields: CreateFields,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    if (!Prompts.isValidName(fields.name)) {
      return yield* Effect.fail(
        `'${fields.name}' is not a valid prompt name — use a kebab-case slug such as 'my-prompt'.`,
      );
    }
    if (fields.template.trim() === '') {
      return yield* Effect.fail('create requires a non-empty --template.');
    }
    const variables =
      fields.variables === undefined ? undefined : yield* parseVariableSpecs(fields.variables);
    const prompt = Prompts.make(
      fields.name,
      fields.template,
      fields.description ?? '',
      fields.model ?? '',
      variables,
      fields.skills ?? [],
    );
    const store = yield* PromptStore.PromptStore;
    yield* store
      .save(fields.cwd, prompt, fields.dir)
      .pipe(Effect.mapError((error: PromptStore.StoreError) => error.message));
    return prompt;
  });

/** Fields `modify` accepts. Absent means keep the stored value. */
export interface ModifyFields extends StoreScope {
  readonly name: string;
  readonly template?: string | undefined;
  readonly description?: string | undefined;
  readonly model?: string | undefined;
  readonly skills?: readonly string[] | undefined;
  /** `name[:flags]` specs. Absent keeps the declared variables. */
  readonly variables?: readonly string[] | undefined;
}

/** Update an existing prompt in place. */
export const modify = (
  fields: ModifyFields,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const prompt = yield* load(fields, fields.name);
    const template = fields.template ?? prompt.template;
    if (template.trim() === '') {
      return yield* Effect.fail('Template must not be empty.');
    }
    const variables =
      fields.variables === undefined
        ? [...prompt.variables]
        : [...(yield* parseVariableSpecs(fields.variables))];
    const updated = Prompts.Prompt.make({
      ...prompt,
      template,
      description: fields.description ?? prompt.description,
      model: fields.model ?? prompt.model,
      variables,
      skills: [...(fields.skills ?? prompt.skills)],
    });
    const store = yield* PromptStore.PromptStore;
    yield* store
      .save(fields.cwd, updated, fields.dir)
      .pipe(Effect.mapError((error: PromptStore.StoreError) => error.message));
    return updated;
  });

/** Delete a prompt file. */
export const remove = (
  scope: StoreScope,
  name: string,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const prompt = yield* load(scope, name);
    const store = yield* PromptStore.PromptStore;
    yield* store
      .remove(scope.cwd, prompt.name, scope.dir)
      .pipe(Effect.mapError((error: PromptStore.StoreError) => error.message));
  });

/** Parse a comma-separated flag into specs, for the binary's `--variable`. */
export const variableFlag = (value: string | undefined): readonly string[] | undefined =>
  csv(value);
