import { Effect, Layer } from 'effect';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Doctor from '../doctor/index.js';
import * as Dispatch from '../../modules/dispatch/index.js';
import * as Roles from '../../modules/roles/index.js';
import { Host, PlaybookStore, PrincipleStore, RolesStore } from '../../services/index.js';

/**
 * Headless engines for `mf-mode`: structured arguments in, data out, failures
 * as a displayable string that names the fix. No argv and no output, so every
 * front end shares one behaviour. `root` is always the workspace root.
 *
 * The engines make every mechanical decision an agent would otherwise guess:
 * which harness it runs in, which seat wins, and the exact headless command.
 */

/** The layers every engine needs, minus the host (the binary adds `Host.Default`). */
const PlatformLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

export const StoreLive = RolesStore.Default.pipe(Layer.provide(PlatformLive));

/** Every store the binary's commands read: roles, principles, and playbooks. */
export const Live = Layer.mergeAll(
  StoreLive,
  PlatformLive,
  Host.Default,
  PrincipleStore.Default.pipe(Layer.provide(PlatformLive)),
  PlaybookStore.Default.pipe(Layer.provide(PlatformLive)),
);

export type Services = RolesStore.RolesStore | Host.Host;

/** Caller form named in fix-it text. */
export const INVOCATION = 'mf-mode';

const storeMessage = (error: RolesStore.StoreError): string => error.message;

/** A role argument, checked. */
const roleOf = (value: string): Effect.Effect<Roles.Role, string> =>
  Roles.isRole(value)
    ? Effect.succeed(value)
    : Effect.fail(`Unknown role '${value}'. Roles: ${Roles.ROLES.join(', ')}.`);

/** The file on disk, decoded; no file is the empty file. */
interface Loaded {
  readonly exists: boolean;
  readonly file: Roles.RolesFile | undefined;
  readonly issues: ReadonlyArray<Roles.Issue>;
}

const load = (root: string): Effect.Effect<Loaded, string, RolesStore.RolesStore> =>
  Effect.gen(function* () {
    const store = yield* RolesStore.RolesStore;
    const raw = yield* store.readRaw(root).pipe(Effect.mapError(storeMessage));
    if (!raw.exists) return { exists: false, file: Roles.EMPTY, issues: [] };
    return { exists: true, ...Roles.decode(raw.raw) };
  });

/** The file, refused when it has any error: nothing resolves from a bad file. */
const loadValid = (root: string): Effect.Effect<Roles.RolesFile, string, RolesStore.RolesStore> =>
  Effect.gen(function* () {
    const loaded = yield* load(root);
    if (loaded.file !== undefined) return loaded.file;
    const count = Roles.errorCount(loaded.issues);
    return yield* Effect.fail(
      `The roles file has ${count} error${count === 1 ? '' : 's'}. Run \`${INVOCATION} roles verify\` and fix it.`,
    );
  });

/**
 * The harness this process runs in: `--harness` when given, else detected.
 * @param flag - the `--harness` value, if any
 */
export const currentHarness = (
  flag: string | undefined,
): Effect.Effect<Roles.Harness, string, Host.Host> =>
  Effect.gen(function* () {
    const choices = Roles.HARNESSES.join('|');
    if (flag !== undefined) {
      return Roles.isHarness(flag)
        ? flag
        : yield* Effect.fail(`'${flag}' is not a harness. Pass --harness <${choices}>.`);
    }
    const host = yield* Host.Host;
    const detected = Roles.detectHarness(host.env);
    return detected.ok
      ? detected.value
      : yield* Effect.fail(
          `${detected.reason} Pass --harness <${choices}>: the harness you are running in.`,
        );
  });

/**
 * Install or check everything mf-mode ships: skills, profiles, principles, and playbooks.
 * @param root - workspace root
 * @param check - report only; write nothing
 */
export const doctor = (root: string, check: boolean): Effect.Effect<Doctor.DoctorResult> =>
  Doctor.runDoctor(root, { check, invocation: `${INVOCATION} doctor` });

// ---------------------------------------------------------------------------
// roles show / verify / set / unset
// ---------------------------------------------------------------------------

export interface ShowRow {
  readonly role: Roles.Role;
  /** Undefined when the role is unset and falls back to the defaults. */
  readonly seats: ReadonlyArray<Roles.Seat> | undefined;
}

/**
 * Every role and what it is set to.
 * @param root - workspace root
 * @returns one row per role, in the canonical order
 */
export const show = (
  root: string,
): Effect.Effect<ReadonlyArray<ShowRow>, string, RolesStore.RolesStore> =>
  loadValid(root).pipe(
    Effect.map((file) => Roles.ROLES.map((role) => ({ role, seats: file.roles[role] }))),
  );

export interface VerifyReport {
  readonly exists: boolean;
  readonly path: string;
  readonly issues: ReadonlyArray<Roles.Issue>;
  readonly errorCount: number;
}

/**
 * Mechanically verify the roles file. No file is valid: every role is unset.
 * @param root - workspace root
 */
export const verify = (root: string): Effect.Effect<VerifyReport, string, RolesStore.RolesStore> =>
  Effect.gen(function* () {
    const store = yield* RolesStore.RolesStore;
    const loaded = yield* load(root);
    return {
      exists: loaded.exists,
      path: store.fileOf(root),
      issues: loaded.issues,
      errorCount: Roles.errorCount(loaded.issues),
    };
  });

/**
 * Set one role's seats, refusing anything `verify` would reject.
 * @param root - workspace root
 * @param role - role name
 * @param specs - one `harness:model[:effort],…` spec per seat
 * @returns the role's new row
 */
export const set = (
  root: string,
  role: string,
  specs: ReadonlyArray<string>,
): Effect.Effect<ShowRow, string, RolesStore.RolesStore> =>
  Effect.gen(function* () {
    const checked = yield* roleOf(role);
    const seats: Array<Roles.Seat> = [];
    for (const spec of specs) {
      const seat = Roles.parseSeat(spec);
      if (!seat.ok) return yield* Effect.fail(`Bad --seat: ${seat.reason}`);
      seats.push(seat.value);
    }
    const next = Roles.setRole(yield* loadValid(root), checked, seats);
    const errors = Roles.check(next).filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      return yield* Effect.fail(
        [
          'Refused; nothing written:',
          ...errors.map((issue) => `error [${issue.path}] ${issue.message}`),
        ].join('\n'),
      );
    }
    const store = yield* RolesStore.RolesStore;
    yield* store.write(root, next).pipe(Effect.mapError(storeMessage));
    return { role: checked, seats };
  });

/**
 * Remove one role, so it resolves to mf-mode's defaults again.
 * @param root - workspace root
 * @param role - role name
 */
export const unset = (
  root: string,
  role: string,
): Effect.Effect<ShowRow, string, RolesStore.RolesStore> =>
  Effect.gen(function* () {
    const checked = yield* roleOf(role);
    const file = yield* loadValid(root);
    if (file.roles[checked] !== undefined) {
      const store = yield* RolesStore.RolesStore;
      yield* store.write(root, Roles.unsetRole(file, checked)).pipe(Effect.mapError(storeMessage));
    }
    return { role: checked, seats: undefined };
  });

// ---------------------------------------------------------------------------
// roles resolve
// ---------------------------------------------------------------------------

/**
 * Resolve a role's seats from the current harness.
 * @param root - workspace root
 * @param role - role name
 * @param harness - `--harness`, else detected
 */
export const resolve = (
  root: string,
  role: string,
  harness: string | undefined,
): Effect.Effect<Roles.Resolution, string, Services> =>
  Effect.gen(function* () {
    const checked = yield* roleOf(role);
    const current = yield* currentHarness(harness);
    const file = yield* loadValid(root);
    const host = yield* Host.Host;
    const installed = new Set<Roles.Harness>();
    for (const candidate of Roles.HARNESSES) {
      if (yield* host.installed(Roles.BINARIES[candidate])) installed.add(candidate);
    }
    return Roles.resolve(file, checked, current, (candidate) => installed.has(candidate));
  });

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/** The profile a dispatched worker runs as, unless `--profile` names another. */
export const DEFAULT_PROFILE = 'mf-mode-generic-worker';

export interface DispatchOptions {
  readonly role: string;
  /** 1-based seat number. */
  readonly seat: number;
  /** Path of the kickoff brief. */
  readonly brief: string;
  /** Profile name, or `none` for the bare brief. */
  readonly profile: string;
  readonly access: Dispatch.Access;
  readonly harness: string | undefined;
  readonly dryRun: boolean;
}

export interface DispatchResult {
  readonly seat: Roles.ResolvedSeat;
  readonly command: string;
  /** Undefined on a dry run. */
  readonly exitCode: number | undefined;
}

/** What to do instead when a seat must not be dispatched. */
const notDispatched = (
  role: Roles.Role,
  seat: Roles.ResolvedSeat,
  current: Roles.Harness,
): string => {
  if (seat.run === 'dropped') {
    return `Seat ${seat.seat} of ${role} is dropped: no candidate's harness is available. Run without it and say so.`;
  }
  const model =
    seat.candidate === undefined
      ? `the ${role} default from the mf-mode Subagents section`
      : `model ${seat.candidate.model}${seat.candidate.effort === undefined ? '' : `, effort ${seat.candidate.effort}`}`;
  return `Seat ${seat.seat} of ${role} runs natively on ${current}: spawn it with your own subagent tool (${model}). Do not dispatch it.`;
};

/**
 * Run one seat of a role headless on the harness it resolves to.
 * Refuses a native or dropped seat, naming what to do instead.
 * @param root - workspace root, also the child's working directory
 * @param options - role, seat, brief, profile, access, harness, dry run
 */
export const dispatch = (
  root: string,
  options: DispatchOptions,
): Effect.Effect<DispatchResult, string, Services> =>
  Effect.gen(function* () {
    const resolution = yield* resolve(root, options.role, options.harness);
    const seat = resolution.seats[options.seat - 1];
    if (seat === undefined) {
      return yield* Effect.fail(
        `${resolution.role} has ${resolution.seats.length} seat${resolution.seats.length === 1 ? '' : 's'}, not ${options.seat}. Run \`${INVOCATION} roles resolve ${resolution.role}\`.`,
      );
    }
    if (seat.run !== 'dispatch' || seat.candidate === undefined) {
      return yield* Effect.fail(notDispatched(resolution.role, seat, resolution.current));
    }
    const store = yield* RolesStore.RolesStore;
    const brief = yield* store.readBrief(options.brief).pipe(Effect.mapError(storeMessage));
    const profile =
      options.profile === 'none'
        ? undefined
        : Dispatch.body(
            yield* store.readProfile(root, options.profile).pipe(Effect.mapError(storeMessage)),
          );
    const text = Dispatch.prompt(profile, brief);
    const plan = Dispatch.plan(seat.candidate, text, options.access);
    const command = Dispatch.describe(plan, text);
    if (options.dryRun) return { seat, command, exitCode: undefined };
    const host = yield* Host.Host;
    const exitCode = yield* host.run(plan, root);
    return { seat, command, exitCode };
  });
