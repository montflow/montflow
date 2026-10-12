import { Deferred, Duration, Effect, Option, Schema } from 'effect';
import { Session } from '../../modules/index.js';
import { SessionRunner, type SessionDetail } from '../../services/index.js';
import { doctor, SESSION_SKILL_NAME } from '../doctor/index.js';

/**
 * Shared surface commands: parse `/mf-sessions` or `mf-sessions` args and execute them
 * against the engine. The CLI and the Pi extension both delegate here, so the
 * verbs and output never drift.
 */

/** Slash/CLI command name. Owned here so both surfaces register the same verb. */
export const COMMAND_NAME = 'mf-sessions';

/** Help text shown for the command. */
export const COMMAND_DESCRIPTION =
  'Manage local agent sessions: doctor [--check] | list [--status <states>] | status <id> | verify <id> | start --id <id> --prompt "text" [--model p/m] [--thinking level] | resume <id> [--prompt "text"] | interrupt <id> | steer <id> <text> | answer <id> <text>.';

/** Help text for the command and the `help` action. */
export const USAGE = [
  'mf-sessions doctor [--check]',
  'mf-sessions list [--status pending|running|awaiting-input|done|failed|cancelled]',
  'mf-sessions status <id>',
  'mf-sessions verify <id>',
  'mf-sessions start --id <id> --prompt "text" [--name "n"] [--model p/m] [--thinking off|minimal|low|medium|high|xhigh|max] [--parent <id>] [--related a,b] [--tools a,b]',
  'mf-sessions resume <id> [--prompt "text"]',
  'mf-sessions interrupt <id>',
  'mf-sessions steer <id> <text>',
  'mf-sessions answer <id> <text>',
  '',
  'Model ids: `pi --list-models [search]` (e.g. opencode-go/deepseek-v4.1-flash).',
].join('\n');

/** Parsed surface invocation. */
export type CommandAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'List'; readonly status: string | undefined }
  | { readonly kind: 'Status'; readonly id: string }
  | { readonly kind: 'Verify'; readonly id: string }
  | { readonly kind: 'Doctor'; readonly check: boolean }
  | { readonly kind: 'Resume'; readonly id: string; readonly prompt: string | undefined }
  | { readonly kind: 'Interrupt'; readonly id: string }
  | { readonly kind: 'Steer'; readonly id: string; readonly text: string }
  | { readonly kind: 'Answer'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'Start';
      readonly id: string;
      readonly prompt: string;
      readonly name: string | undefined;
      readonly model: string | undefined;
      readonly thinking: Session.ThinkingLevel | undefined;
      readonly parent: string | undefined;
      readonly related: ReadonlyArray<string> | undefined;
      readonly tools: ReadonlyArray<string> | undefined;
    };

/** How a surface waits for a dispatched session. */
export type StartMode = 'await' | 'detach';

/**
 * How long `await` waits for a session to settle before reporting it still live.
 * Bounded so a failed prompt cannot orphan the caller forever.
 */
export const DEFAULT_SETTLEMENT_TIMEOUT = Duration.minutes(30);

/** Per-invocation surface controls. */
export interface ExecuteOptions {
  /**
   * `await` blocks until the session settles (the CLI's one-shot `start`);
   * `detach` returns as soon as the session is registered (Pi's `session_start` tool,
   * whose parent must stay free to `steer`/`answer` the child).
   */
  readonly startMode?: StartMode;
  /** Max time `await` waits for settlement; defaults to {@link DEFAULT_SETTLEMENT_TIMEOUT}. */
  readonly settlementTimeout?: Duration.Input;
  /**
   * Extra hook invoked once the session settles. This is the A004 completion seam:
   * the `/mf-profiles-cli create` invocation (E001) composes here; Phase C only
   * guarantees the seam and the per-session workspace notification.
   */
  readonly onSettled?: (detail: SessionDetail) => Effect.Effect<void>;
}

/**
 * Quote-aware whitespace tokenizer. A quote only opens a token at its start
 * (`don't` keeps its apostrophe), backslash escapes the next character, and an
 * unterminated quote yields `undefined` so callers can fall back to usage.
 */
export const tokenize = (input: string): ReadonlyArray<string> | undefined => {
  const tokens: Array<string> = [];
  let current = '';
  let started = false;
  let quote: string | undefined;
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if ((char === '"' || char === "'") && !started) {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  if (escaped) current += '\\';
  if (quote !== undefined) return undefined;
  if (started) tokens.push(current);
  return tokens;
};

/** Bare positionals plus `--flag value` / `--flag=value` pairs. */
interface SplitFlags {
  readonly positionals: ReadonlyArray<string>;
  readonly flags: Record<string, string>;
}

const START_FLAGS = [
  'id',
  'prompt',
  'name',
  'model',
  'thinking',
  'parent',
  'related',
  'tools',
] as const;
const RESUME_FLAGS = ['prompt'] as const;
const LIST_FLAGS = ['status'] as const;

/**
 * Split tokens into positionals and known flags. A value flag consumes the next
 * token even when it starts with `--` (so `--prompt "--dash"` survives); an
 * unknown flag or a bare `--` yields `undefined` for the caller to reject.
 */
const splitFlags = (
  tokens: ReadonlyArray<string>,
  known: ReadonlyArray<string>,
): SplitFlags | undefined => {
  const positionals: Array<string> = [];
  const pairs: Array<[string, string]> = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    if (body === '') return undefined;
    const equals = body.indexOf('=');
    const name = equals >= 0 ? body.slice(0, equals) : body;
    if (!known.includes(name)) return undefined;
    if (equals >= 0) {
      pairs.push([name, body.slice(equals + 1)]);
      continue;
    }
    const next = tokens[index + 1];
    if (next === undefined) {
      pairs.push([name, '']);
      continue;
    }
    pairs.push([name, next]);
    index++;
  }
  return { positionals, flags: Object.fromEntries(pairs) };
};

const one = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

/**
 * Validate a `--thinking` value against the allowed levels. Absent reads as
 * undefined; an unknown level reads as null so the caller rejects the input.
 * @param value - raw `--thinking` flag value
 * @returns the level, undefined when absent, or null when invalid
 */
const thinkingOf = (value: string | undefined): Session.ThinkingLevel | undefined | null => {
  const candidate = one(value);
  if (candidate === undefined) return undefined;
  return Schema.is(Session.ThinkingLevel)(candidate) ? candidate : null;
};

const csv = (value: string | undefined): ReadonlyArray<string> | undefined => {
  if (value === undefined || value === '') return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 0 ? parts : undefined;
};

/**
 * Resolve a raw `--status` value into the session statuses to keep. Absent or
 * empty means "no filter"; an unknown token fails with the accepted values.
 * @param value - raw flag value, if any
 * @returns the statuses, or a refusal naming the accepted values
 */
const resolveStatuses = (
  value: string | undefined,
): Effect.Effect<ReadonlyArray<Session.Status> | undefined, string> => {
  if (value === undefined || value === '') return Effect.succeed(undefined);
  const tokens = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const statuses: Array<Session.Status> = [];
  for (const token of tokens) {
    if (!Schema.is(Session.Status)(token)) {
      return Effect.fail(`Unknown status '${token}'. Use one of: ${Session.STATUSES.join(', ')}.`);
    }
    statuses.push(token);
  }
  return Effect.succeed(statuses);
};

const statusAction = (tokens: ReadonlyArray<string>, kind: 'Status' | 'Verify'): CommandAction => {
  const id = tokens[1];
  return id !== undefined && tokens.length === 2 ? { kind, id } : { kind: 'Help' };
};

/** Parse already-tokenized args. Malformed input is `Help`. */
const parseTokens = (tokens: ReadonlyArray<string>): CommandAction => {
  const head = tokens[0];
  if (head === undefined) return { kind: 'Help' };
  if (tokens.includes('--help') || tokens.includes('-h')) return { kind: 'Help' };
  switch (head) {
    case 'list': {
      const parsed = splitFlags(tokens.slice(1), LIST_FLAGS);
      if (parsed === undefined || parsed.positionals.length > 0) return { kind: 'Help' };
      return { kind: 'List', status: one(parsed.flags['status']) };
    }
    case 'status':
      return statusAction(tokens, 'Status');
    case 'verify':
      return statusAction(tokens, 'Verify');
    case 'doctor': {
      const rest = tokens.slice(1);
      if (rest.length === 0) return { kind: 'Doctor', check: false };
      if (rest.length === 1 && rest[0] === '--check') return { kind: 'Doctor', check: true };
      return { kind: 'Help' };
    }
    case 'interrupt': {
      const id = tokens[1];
      return id !== undefined && tokens.length === 2 ? { kind: 'Interrupt', id } : { kind: 'Help' };
    }
    case 'steer':
    case 'answer': {
      const id = tokens[1];
      const text = tokens.slice(2).join(' ').trim();
      if (id === undefined || text === '') return { kind: 'Help' };
      return head === 'steer' ? { kind: 'Steer', id, text } : { kind: 'Answer', id, text };
    }
    case 'start': {
      const parsed = splitFlags(tokens.slice(1), START_FLAGS);
      if (parsed === undefined || parsed.positionals.length > 0) return { kind: 'Help' };
      const id = one(parsed.flags['id']);
      const prompt = one(parsed.flags['prompt']);
      const thinking = thinkingOf(parsed.flags['thinking']);
      if (id === undefined || prompt === undefined || thinking === null) return { kind: 'Help' };
      return {
        kind: 'Start',
        id,
        prompt,
        name: one(parsed.flags['name']),
        model: one(parsed.flags['model']),
        thinking,
        parent: one(parsed.flags['parent']),
        related: csv(parsed.flags['related']),
        tools: csv(parsed.flags['tools']),
      };
    }
    case 'resume': {
      const id = tokens[1];
      if (id === undefined) return { kind: 'Help' };
      const parsed = splitFlags(tokens.slice(2), RESUME_FLAGS);
      if (parsed === undefined || parsed.positionals.length > 0) return { kind: 'Help' };
      return { kind: 'Resume', id, prompt: one(parsed.flags['prompt']) };
    }
    case 'help':
      return { kind: 'Help' };
    default:
      return { kind: 'Help' };
  }
};

/**
 * Parse a raw command string into a {@link CommandAction}. Malformed input is
 * `Help` — the usage line names every supported flag.
 * @param args - raw args (without the command name)
 * @returns the parsed action
 */
export const parseCommand = (args: string): CommandAction => {
  const tokens = tokenize(args);
  return tokens === undefined ? { kind: 'Help' } : parseTokens(tokens);
};

/**
 * Parse already-split argv (shell quoting is gone) into a {@link CommandAction}.
 * Values are never re-tokenized, so multi-word flags survive intact.
 * @param argv - args after the command name, one element per argument
 * @returns the parsed action
 */
export const parseArgv = (argv: ReadonlyArray<string>): CommandAction => parseTokens(argv);

/** One-line status/row rendering. */
const renderSession = (session: Session.Session): string => {
  const name = session.name !== undefined && session.name !== session.id ? `  ${session.name}` : '';
  return `${session.id}  ${session.status}${name}${session.parent === null ? '' : `  (parent ${session.parent})`}`;
};

/** Human turns only: system/toolResult events are not turns. */
const countTurns = (events: ReadonlyArray<{ readonly role: string }>): number =>
  events.filter((event) => event.role === 'user' || event.role === 'assistant').length;

/**
 * Execute a parsed action against the engine.
 * @param action - parsed action
 * @param root - repo root (sessions store owner)
 * @param options - per-invocation controls (settlement mode, hook, timeout)
 * @returns Effect resolving to display text, failing with a message
 */
export const execute = (
  action: CommandAction,
  root: string,
  options: ExecuteOptions = {},
): Effect.Effect<string, string, SessionRunner> =>
  Effect.gen(function* () {
    const sessionRunner = yield* SessionRunner;
    switch (action.kind) {
      case 'Help':
        return USAGE;
      case 'List': {
        const sessions = yield* sessionRunner.list(root);
        const statuses = yield* resolveStatuses(action.status);
        const shown =
          statuses === undefined
            ? sessions
            : sessions.filter((session) => statuses.includes(session.status));
        if (shown.length === 0) {
          return statuses === undefined
            ? 'No sessions.'
            : `No sessions with status '${action.status}'.`;
        }
        return shown.map(renderSession).join('\n');
      }
      case 'Status': {
        const detail = yield* sessionRunner.detail(root, action.id);
        const receipt =
          detail.receipt === undefined
            ? ''
            : `\nreceipt ${detail.receipt.outcome}: ${detail.receipt.summary}`;
        const store = yield* sessionRunner.verifyStore(root);
        const storeLine = store.ignored
          ? 'store ignored: yes'
          : `store ignored: no${store.issues.map((entry) => `\n  [${entry.field}] ${entry.message}`).join('')}`;
        return `${renderSession(detail.session)}\nturns ${countTurns(detail.events)}${receipt}\n${storeLine}`;
      }
      case 'Verify': {
        const verdict = yield* sessionRunner.verify(root, action.id);
        const issues = verdict.issues
          .map((entry) => `  [${entry.field}] ${entry.message}`)
          .join('\n');
        return `valid ${verdict.valid ? 'yes' : 'no'} · resumable ${verdict.resumable ? 'yes' : 'no'}${issues === '' ? '' : `\n${issues}`}`;
      }
      case 'Doctor': {
        const result = yield* doctor(root, { check: action.check });
        if (result.status === 'missing') {
          return yield* Effect.fail(
            `Session skill '${SESSION_SKILL_NAME}' is not installed at ${result.target}.`,
          );
        }
        return result.status === 'present'
          ? `Session skill '${SESSION_SKILL_NAME}' is installed at ${result.target}.`
          : `Installed session skill '${SESSION_SKILL_NAME}' at ${result.target}.`;
      }
      case 'Start': {
        const settled = yield* Deferred.make<{
          readonly outcome: string;
          readonly summary: string;
        }>();
        const started = yield* sessionRunner.start({
          root,
          id: action.id,
          prompt: action.prompt,
          name: action.name,
          model: action.model,
          thinking: action.thinking,
          parent: action.parent,
          related: action.related,
          tools: action.tools,
          onSettled: (detail) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(settled, {
                outcome: detail.receipt?.outcome ?? 'done',
                summary: detail.receipt?.summary ?? '',
              });
              if (options.onSettled !== undefined) yield* options.onSettled(detail);
            }),
        });
        if (options.startMode === 'detach') return `Session '${started.id}' started.`;
        const outcome = yield* Deferred.await(settled).pipe(
          Effect.timeoutOption(options.settlementTimeout ?? DEFAULT_SETTLEMENT_TIMEOUT),
        );
        return Option.match(outcome, {
          onNone: () => `Session '${started.id}' still running; check its status.`,
          onSome: (value) => `Session '${started.id}' ${value.outcome}: ${value.summary}`,
        });
      }
      case 'Resume': {
        const resumed = yield* sessionRunner.resume(root, action.id, action.prompt);
        return `Resumed '${resumed.id}'.`;
      }
      case 'Interrupt':
        yield* sessionRunner.interrupt(root, action.id);
        return `Interrupted '${action.id}'.`;
      case 'Steer':
        yield* sessionRunner.steer(root, action.id, action.text);
        return `Steered '${action.id}'.`;
      case 'Answer':
        yield* sessionRunner.answer(root, action.id, action.text);
        return `Answered '${action.id}'.`;
    }
  });
